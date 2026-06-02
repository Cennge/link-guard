// Renders the interstitial from the query params the service worker passed, and
// wires the three actions (go back / go to the real site / proceed anyway).

const params = new URLSearchParams(location.search)
const target = params.get('target') || ''
const verdict = params.get('verdict') || 'danger'
const reason = params.get('reason') || ''
const brand = params.get('brand') || ''
const host = params.get('host') || ''
const unicode = params.get('unicode') || ''
const suggestion = params.get('suggestion') || ''

const REASON_TEXT = {
  homograph: brand
    ? `Адрес визуально имитирует <strong>${brand}</strong> с помощью похожих символов из других алфавитов (например, кириллица вместо латиницы). Это классическая гомографическая атака — настоящий сайт выглядит так же, но домен другой.`
    : 'В адресе смешаны символы из разных алфавитов, которые выглядят одинаково. Так маскируют поддельные сайты под настоящие.',
  typosquat: `Адрес очень похож на <strong>${brand}</strong>, но написан с искажением (опечаткой). Так работает тайпосквоттинг: вы попадаете на сайт злоумышленника, набрав или кликнув почти правильный адрес.`,
  combosquat: `В адресе используется имя бренда <strong>${brand}</strong>, но сам домен бренду не принадлежит. Мошенники добавляют известное название в чужой домен, чтобы вызвать доверие.`,
  mixed_script: 'В адресе одновременно используются символы из разных алфавитов (например, латиница и кириллица). Легитимные сайты так почти никогда не делают — это типичный признак подделки.',
  suspicious_structure: 'Адрес имеет структуру, типичную для фишинга: ключевые слова вроде «login», «secure», «verify» в сочетании с подозрительным доменом (много дефисов или закодированные символы). Так маскируют поддельные страницы входа.',
  blocklist: 'Этот адрес находится в списке известных фишинговых/мошеннических сайтов. Переход крайне не рекомендуется.',
  deceptive_url: 'Адрес устроен так, чтобы обмануть: настоящее имя сайта спрятано (например, известный бренд указан перед символом «@», а реальный домен — после него). Браузер откроет именно тот сайт, что стоит после «@».',
  suspicious_login: 'Страница просит ввести пароль и использует тревожные формулировки (подтвердите аккаунт, доступ ограничен) на малоизвестном домене — типичный приём фишинга.',
  payment_skim: 'Данные банковской карты с этой страницы уходят на сторонний сайт — типичный скимминг. Не вводите номер карты и CVV.',
  user_blocked: 'Вы лично заблокировали доступ к этому сайту. Чтобы снова заходить на него, вам потребуется удалить правило блокировки в настройках расширения.',
}

const titleEl = document.getElementById('title')
const leadEl = document.getElementById('lead')
const explainEl = document.getElementById('explain')

if (verdict === 'warning') {
  document.body.classList.add('warn')
  document.getElementById('shield').textContent = '⚠️'
  titleEl.textContent = 'Внимание: подозрительный адрес'
  leadEl.textContent = 'LinkGuard обнаружил признаки возможной подделки.'
} else {
  titleEl.textContent = 'Опасно: вероятный фишинг'
  leadEl.textContent = 'LinkGuard заблокировал переход на потенциально мошеннический сайт.'
}

explainEl.innerHTML = REASON_TEXT[reason] || 'Адрес имеет признаки фишингового сайта.'

document.getElementById('host').textContent = host || target

if (unicode && unicode !== host) {
  document.getElementById('unicode').textContent = unicode
  document.getElementById('unicode-row').hidden = false
}

if (suggestion) {
  document.getElementById('suggestion').textContent = suggestion
  document.getElementById('suggest-row').hidden = false
  const gotoReal = document.getElementById('goto-real')
  gotoReal.textContent = `Перейти на ${suggestion} →`
  gotoReal.href = `https://${suggestion}`
  gotoReal.hidden = false
}

// "Go back to safety": return to the previous page, or open a blank tab.
document.getElementById('back').addEventListener('click', () => {
  if (history.length > 1) history.back()
  else location.href = 'about:blank'
})

if (reason === 'user_blocked') {
  document.getElementById('proceed').hidden = true
  document.getElementById('proceed-always').hidden = true
}


// "Proceed anyway": tell the worker to allow this host for the session, then go.
document.getElementById('proceed').addEventListener('click', () => {
  const ok = confirm(
    'Вы уверены? Этот сайт может похищать пароли и платёжные данные.\n\nПереход выполняется на ваш страх и риск.'
  )
  if (!ok) return
  chrome.runtime.sendMessage({ type: 'allow', host }, () => {
    location.replace(target)
  })
})

// "Always trust": allow this host permanently.
document.getElementById('proceed-always').addEventListener('click', () => {
  const ok = confirm(
    'Добавить этот сайт в белый список навсегда?\n\nОн больше никогда не будет проверяться или блокироваться. Выполняйте это, только если на 100% уверены, что сайт безопасен.'
  )
  if (!ok) return
  chrome.runtime.sendMessage({ type: 'allowAlways', host }, () => {
    location.replace(target)
  })
})
