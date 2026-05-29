// Brands we protect. Each entry has:
//   label   -> the brandable "core" we compare against (no TLD)
//   display -> human name for the warning UI
//   domains -> the full set of LEGITIMATE registrable domains (the allow-list)
//
// `label` is what typo/homograph distance is measured against; `domains` is what
// keeps us from warning on the real sites and their sub-domains.

export const BRANDS = [
  // ---- Global tech / social ----
  { label: 'google', display: 'Google', domains: ['google.com', 'google.co.uk', 'google.de', 'google.ru', 'youtube.com', 'gmail.com', 'googlemail.com'] },
  { label: 'youtube', display: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
  { label: 'facebook', display: 'Facebook', domains: ['facebook.com', 'fb.com', 'fb.me'] },
  { label: 'instagram', display: 'Instagram', domains: ['instagram.com'] },
  { label: 'whatsapp', display: 'WhatsApp', domains: ['whatsapp.com', 'wa.me'] },
  { label: 'telegram', display: 'Telegram', domains: ['telegram.org', 'telegram.me', 't.me'] },
  { label: 'twitter', display: 'Twitter / X', domains: ['twitter.com', 'x.com', 't.co'] },
  { label: 'linkedin', display: 'LinkedIn', domains: ['linkedin.com', 'lnkd.in'] },
  { label: 'tiktok', display: 'TikTok', domains: ['tiktok.com'] },
  { label: 'reddit', display: 'Reddit', domains: ['reddit.com', 'redd.it'] },
  { label: 'discord', display: 'Discord', domains: ['discord.com', 'discord.gg', 'discordapp.com'] },
  { label: 'twitch', display: 'Twitch', domains: ['twitch.tv'] },
  { label: 'github', display: 'GitHub', domains: ['github.com', 'github.io'] },
  { label: 'microsoft', display: 'Microsoft', domains: ['microsoft.com', 'live.com', 'outlook.com', 'office.com', 'microsoftonline.com', 'msn.com', 'bing.com', 'azure.com'] },
  { label: 'apple', display: 'Apple', domains: ['apple.com', 'icloud.com', 'me.com'] },
  { label: 'amazon', display: 'Amazon', domains: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'aws.amazon.com', 'amazonaws.com'] },
  { label: 'netflix', display: 'Netflix', domains: ['netflix.com'] },
  { label: 'spotify', display: 'Spotify', domains: ['spotify.com'] },
  { label: 'dropbox', display: 'Dropbox', domains: ['dropbox.com'] },
  { label: 'adobe', display: 'Adobe', domains: ['adobe.com'] },
  { label: 'yahoo', display: 'Yahoo', domains: ['yahoo.com'] },
  { label: 'ebay', display: 'eBay', domains: ['ebay.com', 'ebay.co.uk', 'ebay.de'] },
  { label: 'steam', display: 'Steam', domains: ['steampowered.com', 'steamcommunity.com'] },
  { label: 'steamcommunity', display: 'Steam Community', domains: ['steamcommunity.com'] },

  // ---- Payments / crypto ----
  { label: 'paypal', display: 'PayPal', domains: ['paypal.com'] },
  { label: 'stripe', display: 'Stripe', domains: ['stripe.com'] },
  { label: 'coinbase', display: 'Coinbase', domains: ['coinbase.com'] },
  { label: 'binance', display: 'Binance', domains: ['binance.com', 'binance.us'] },
  { label: 'metamask', display: 'MetaMask', domains: ['metamask.io'] },
  { label: 'kraken', display: 'Kraken', domains: ['kraken.com'] },

  // ---- Banks (intl) ----
  { label: 'wellsfargo', display: 'Wells Fargo', domains: ['wellsfargo.com'] },
  { label: 'bankofamerica', display: 'Bank of America', domains: ['bankofamerica.com'] },
  { label: 'chase', display: 'Chase', domains: ['chase.com'] },
  { label: 'citibank', display: 'Citibank', domains: ['citibank.com', 'citi.com'] },
  { label: 'hsbc', display: 'HSBC', domains: ['hsbc.com', 'hsbc.co.uk'] },
  { label: 'revolut', display: 'Revolut', domains: ['revolut.com'] },

  // ---- Shipping ----
  { label: 'dhl', display: 'DHL', domains: ['dhl.com', 'dhl.de'] },
  { label: 'fedex', display: 'FedEx', domains: ['fedex.com'] },
  { label: 'usps', display: 'USPS', domains: ['usps.com'] },

  // ---- Russia / CIS (audience-relevant) ----
  { label: 'sberbank', display: 'Сбербанк', domains: ['sberbank.ru', 'sber.ru', 'online.sberbank.ru'] },
  { label: 'sber', display: 'Сбер', domains: ['sber.ru', 'sberbank.ru'] },
  { label: 'gosuslugi', display: 'Госуслуги', domains: ['gosuslugi.ru'] },
  { label: 'tinkoff', display: 'Т-Банк (Тинькофф)', domains: ['tinkoff.ru', 'tbank.ru'] },
  { label: 'alfabank', display: 'Альфа-Банк', domains: ['alfabank.ru'] },
  { label: 'vtb', display: 'ВТБ', domains: ['vtb.ru'] },
  { label: 'yandex', display: 'Яндекс', domains: ['yandex.ru', 'yandex.com', 'ya.ru'] },
  { label: 'vk', display: 'ВКонтакте', domains: ['vk.com', 'vk.ru', 'vkontakte.ru'] },
  { label: 'ozon', display: 'Ozon', domains: ['ozon.ru'] },
  { label: 'wildberries', display: 'Wildberries', domains: ['wildberries.ru', 'wb.ru'] },
  { label: 'mailru', display: 'Mail.ru', domains: ['mail.ru'] },
  { label: 'avito', display: 'Авито', domains: ['avito.ru'] },
]

// Flat set of every legitimate registrable domain, for O(1) allow-listing.
export const LEGIT_DOMAINS = new Set()
for (const brand of BRANDS) {
  for (const d of brand.domains) LEGIT_DOMAINS.add(d)
}

// Distinctive brand labels used for combosquatting detection. Short or
// dictionary-word-ish labels are excluded to avoid false positives.
export const COMBO_LABELS = BRANDS
  .map((b) => b.label)
  .filter((l) => l.length >= 5 && !['apple', 'chase', 'steam', 'kraken'].includes(l))
