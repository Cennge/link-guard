// test/background.test.js
// Устанавливаем мок-объект chrome глобально до импорта background.js
import fs from 'node:fs'

const localStore = {}
const sessionStore = {}
let updatedTab = null
let dnrRules = []
const noopEvent = () => ({ addListener: () => {} })
global.getDnrRules = () => dnrRules

global.chrome = {
  storage: {
    local: {
      get: async (key) => {
        if (typeof key === 'string') return { [key]: localStore[key] }
        return localStore // fallback
      },
      set: async (obj) => { Object.assign(localStore, obj) }
    },
    session: {
      get: async (key) => {
        if (typeof key === 'string') return { [key]: sessionStore[key] }
        return sessionStore
      },
      set: async (obj) => { Object.assign(sessionStore, obj) }
    }
  },
  tabs: {
    update: async (tabId, opts) => { updatedTab = opts },
    get: async () => ({ id: 1, url: 'about:blank' }),
    onUpdated: noopEvent(),
    onActivated: noopEvent(),
  },
  action: {
    setBadgeText: async () => {},
    setBadgeBackgroundColor: async () => {},
  },
  declarativeNetRequest: {
    getDynamicRules: async () => dnrRules,
    updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
      if (removeRuleIds.length) dnrRules = dnrRules.filter((r) => !removeRuleIds.includes(r.id))
      dnrRules = dnrRules.concat(addRules)
    },
  },
  alarms: {
    create: () => {},
    onAlarm: noopEvent(),
  },
  webNavigation: {
    onBeforeNavigate: {
      addListener: (fn) => { global.mockOnNavigate = fn }
    }
  },
  runtime: {
    getURL: (path) => `chrome-extension://mock/${path}`,
    onMessage: {
      addListener: (fn) => { global.mockOnMessage = fn }
    },
    onInstalled: {
      addListener: (fn) => { global.mockOnInstalled = fn }
    },
    onStartup: noopEvent(),
  }
}

// Serve the bundled data files (bloom filter + phishing list) from disk so the
// service worker's lazy fetches resolve against real artifacts.
global.fetch = async (url) => {
  const path = String(url).replace('chrome-extension://mock/', '')
  const buf = fs.readFileSync(path)
  return {
    arrayBuffer: async () => Uint8Array.from(buf).buffer,
    json: async () => JSON.parse(buf.toString('utf8')),
    text: async () => buf.toString('utf8'),
  }
}

// Динамический импорт, чтобы он произошел после инициализации global.chrome
await import('../src/background.js')

async function sendMessage(msg) {
  return new Promise((resolve) => {
    // В background.js мы возвращаем true, а ответ шлем через sendResponse (resolve)
    global.mockOnMessage(msg, {}, resolve)
  })
}

async function runTests() {
  let pass = 0
  let fail = 0

  function assertEqual(actual, expected, msg) {
    if (actual === expected) {
      pass++
      console.log(`PASS  ${msg}`)
    } else {
      fail++
      console.error(`FAIL  ${msg}\n      Expected: ${expected}\n      Actual: ${actual}`)
    }
  }

  console.log('--- Запуск тестов списков в background.js ---')

  const paypalUrl = 'https://pаypаl.com'
  const paypalHost = new URL(paypalUrl).hostname // xn--pypl-53d3c.com

  // 1. Обычный фишинг
  let res = await sendMessage({ type: 'analyze', url: paypalUrl })
  assertEqual(res.verdict, 'danger', 'Гомограф должен определяться как danger')

  // 2. Тест userAllow (белый список)
  await sendMessage({ type: 'allowAlways', host: paypalHost })
  res = await sendMessage({ type: 'analyze', url: paypalUrl })
  assertEqual(res.verdict, 'safe', 'После добавления в userAllow должен стать safe')
  assertEqual(res.reason, 'user_allowed', 'Причина должна быть user_allowed')

  // 3. Тест userBlock (черный список)
  await sendMessage({ type: 'blockAlways', host: 'example.com' })
  res = await sendMessage({ type: 'analyze', url: 'https://example.com' })
  assertEqual(res.verdict, 'danger', 'После добавления в userBlock должен стать danger')
  assertEqual(res.reason, 'user_blocked', 'Причина должна быть user_blocked')

  // 4. Тест приоритета: userBlock > userAllow
  await sendMessage({ type: 'allowAlways', host: 'conflict.com' })
  await sendMessage({ type: 'blockAlways', host: 'conflict.com' })
  res = await sendMessage({ type: 'analyze', url: 'https://conflict.com' })
  assertEqual(res.verdict, 'danger', 'userBlock должен иметь приоритет над userAllow (verdict)')
  assertEqual(res.reason, 'user_blocked', 'userBlock должен иметь приоритет над userAllow (reason)')

  // 5. Тест analyzeBatch
  const batch = await sendMessage({ 
    type: 'analyzeBatch', 
    urls: ['https://example.com', paypalUrl] 
  })
  assertEqual(batch.badges, true, 'Badges должны быть включены по умолчанию')
  assertEqual(batch.results[0].verdict, 'danger', 'Первый URL в батче (в userBlock) -> danger')
  assertEqual(batch.results[1].verdict, 'safe', 'Второй URL в батче (в userAllow) -> safe')

  // 6. Known-phishing blocklist (phishingExtra storage key)
  localStore['phishingExtra'] = ['evil-blocklisted.com']
  res = await sendMessage({ type: 'analyze', url: 'https://evil-blocklisted.com/login' })
  assertEqual(res.verdict, 'danger', 'Хост из blocklist -> danger')
  assertEqual(res.reason, 'blocklist', 'Причина должна быть blocklist')
  delete localStore['phishingExtra']

  // 7. False-positive suppression: a typo-looking host that IS in the top-1M
  res = await sendMessage({ type: 'analyze', url: 'https://googel.com' })
  assertEqual(res.verdict, 'safe', 'Популярный домен (top-1M) подавляет WARNING -> safe')

  // 8. ...but a typo host NOT in the top-1M stays a warning
  res = await sendMessage({ type: 'analyze', url: 'https://whatspp.com' })
  assertEqual(res.verdict, 'warning', 'Непопулярная опечатка остаётся warning')

  // 9. Credential-phishing structure heuristic
  res = await sendMessage({ type: 'analyze', url: 'https://account-verify-now.com' })
  assertEqual(res.verdict, 'warning', 'Подозрительная структура -> warning')
  assertEqual(res.reason, 'suspicious_structure', 'Причина должна быть suspicious_structure')

  // 10. Combosquat with brand buried in a label
  res = await sendMessage({ type: 'analyze', url: 'https://secure-paypal-login.com' })
  assertEqual(res.verdict, 'warning', 'Бренд внутри лейбла + ключевое слово -> warning')
  assertEqual(res.reason, 'combosquat', 'Причина должна быть combosquat')

  // 11. Deceptive userinfo URL (brand before @, real host after)
  res = await sendMessage({ type: 'analyze', url: 'https://paypal.com@evil-host.tld/login' })
  assertEqual(res.verdict, 'warning', 'URL с userinfo-обманом -> warning')
  assertEqual(res.reason, 'deceptive_url', 'Причина должна быть deceptive_url')

  // 12. On-page fake login: brand identity on a foreign domain
  res = await sendMessage({
    type: 'analyzePage', url: 'https://paypa1-clone.tld/', hasPassword: true,
    identity: 'PayPal - Войдите в аккаунт',
  })
  assertEqual(res.verdict, 'danger', 'Поддельная страница входа бренда -> danger')
  assertEqual(res.reason, 'fake_login', 'Причина должна быть fake_login')

  // 13. On-page: real brand domain is NOT flagged
  res = await sendMessage({
    type: 'analyzePage', url: 'https://paypal.com/signin', hasPassword: true, identity: 'PayPal',
  })
  assertEqual(res.verdict, 'safe', 'Настоящий домен бренда -> safe')

  // 14. On-page: password form posting cross-origin
  res = await sendMessage({
    type: 'analyzePage', url: 'https://my-shop-xyz.tld/', hasPassword: true,
    identity: 'My Shop', crossOriginPost: true,
  })
  assertEqual(res.verdict, 'warning', 'Кросс-доменная отправка пароля -> warning')
  assertEqual(res.reason, 'cross_origin_credentials', 'Причина должна быть cross_origin_credentials')

  // 15. Hard DNR block installs a main_frame rule for a blocked host
  await sendMessage({ type: 'blockAlways', host: 'evil-dnr.test' })
  let rules = global.getDnrRules()
  const hasMainFrameBlock = rules.some((r) =>
    r.condition.urlFilter.includes('evil-dnr.test') &&
    r.condition.resourceTypes.includes('main_frame') &&
    r.action.type === 'block')
  assertEqual(hasMainFrameBlock, true, 'blockAlways ставит жёсткое DNR-правило с main_frame')

  // 16. "Proceed anyway" (allow) removes the hard-block rule for that host
  await sendMessage({ type: 'allow', host: 'evil-dnr.test' })
  rules = global.getDnrRules()
  const stillBlocked = rules.some((r) => r.condition.urlFilter.includes('evil-dnr.test'))
  assertEqual(stillBlocked, false, 'allow убирает DNR-блок (можно перейти)')
  await sendMessage({ type: 'removeUserRule', host: 'evil-dnr.test' })

  // 17. On-page: brand given away by a hot-linked favicon (no brand text)
  res = await sendMessage({
    type: 'analyzePage', url: 'https://acc-secure-xyz.tld/', hasPassword: true,
    identity: 'Login', iconHost: 'paypal.com',
  })
  assertEqual(res.verdict, 'danger', 'Favicon бренда на чужом домене -> danger')
  assertEqual(res.reason, 'fake_login', 'Причина favicon-имперсонации -> fake_login')

  // 18. On-page: alarmist wording on an obscure domain -> warning
  res = await sendMessage({
    type: 'analyzePage', url: 'https://obscure-portal-xyz.tld/', hasPassword: true,
    identity: 'Account suspended — verify now',
  })
  assertEqual(res.verdict, 'warning', 'Тревожные формулировки на редком домене -> warning')
  assertEqual(res.reason, 'suspicious_login', 'Причина -> suspicious_login')

  // 19. ...but the same wording on a top-1M domain is suppressed
  res = await sendMessage({
    type: 'analyzePage', url: 'https://wikipedia.org/', hasPassword: true,
    identity: 'Account suspended — verify now',
  })
  assertEqual(res.verdict, 'safe', 'Те же слова на популярном домене подавляются -> safe')

  // 20. Bulk import merges into the user lists
  await sendMessage({ type: 'importUserRules', allow: ['imp-a.com', 'http://www.imp-b.com/x'], block: ['imp-bad.tld'] })
  res = await sendMessage({ type: 'getUserRules' })
  assertEqual(res.allow.includes('imp-a.com') && res.allow.includes('imp-b.com'), true, 'импорт нормализует и добавляет в белый список')
  assertEqual(res.block.includes('imp-bad.tld'), true, 'импорт добавляет в чёрный список')
  await sendMessage({ type: 'removeUserRule', host: 'imp-a.com' })
  await sendMessage({ type: 'removeUserRule', host: 'imp-b.com' })
  await sendMessage({ type: 'removeUserRule', host: 'imp-bad.tld' })

  // Очистка
  await sendMessage({ type: 'removeUserRule', host: paypalHost })
  await sendMessage({ type: 'removeUserRule', host: 'example.com' })
  await sendMessage({ type: 'removeUserRule', host: 'conflict.com' })

  console.log(`\nBackground логика: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

runTests().catch(e => {
  console.error(e)
  process.exit(1)
})
