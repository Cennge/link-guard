// test/background.test.js
// Устанавливаем мок-объект chrome глобально до импорта background.js
const localStore = {}
const sessionStore = {}
let updatedTab = null

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
    update: async (tabId, opts) => { updatedTab = opts }
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
    }
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
