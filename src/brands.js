// Brands we protect. Each entry has:
//   label   -> the brandable "core" we compare against (no TLD)
//   display -> human name for the warning UI
//   domains -> the full set of LEGITIMATE registrable domains (the allow-list)
//
// `label` is what typo/homograph distance is measured against; `domains` is what
// keeps us from warning on the real sites and their sub-domains.

export const BRANDS = [
  // ---- Global tech / social ----
  { label: 'google', display: 'Google', domains: ['gmail.com','google.ac','google.ad','google.ae','google.af','google.ag','google.ai','google.al','google.am','google.as','google.at','google.ax','google.az','google.ba','google.be','google.bf','google.bg','google.bi','google.bj','google.bs','google.bt','google.by','google.ca','google.cat','google.cc','google.cd','google.cf','google.cg','google.ch','google.ci','google.cl','google.cm','google.cn','google.co','google.co.id','google.co.il','google.co.in','google.co.jp','google.co.kr','google.co.th','google.co.uk','google.co.za','google.com','google.com.ar','google.com.au','google.com.br','google.com.hk','google.com.mx','google.com.my','google.com.ph','google.com.sg','google.com.tr','google.com.tw','google.com.ua','google.com.vn','google.cv','google.cz','google.de','google.dev','google.dj','google.dk','google.dm','google.dz','google.ee','google.es','google.eu','google.fi','google.fm','google.fr','google.ga','google.ge','google.gf','google.gg','google.gl','google.gm','google.gp','google.gr','google.gy','google.hk','google.hn','google.hr','google.ht','google.hu','google.ie','google.im','google.in','google.info','google.io','google.iq','google.is','google.it','google.je','google.jo','google.jp','google.kg','google.ki','google.kz','google.la','google.li','google.lk','google.lt','google.lu','google.lv','google.md','google.me','google.mg','google.mk','google.ml','google.mn','google.ms','google.mu','google.mv','google.mw','google.mx','google.ne','google.net','google.ng','google.nl','google.no','google.nr','google.nu','google.org','google.pk','google.pl','google.play','google.pn','google.ps','google.pt','google.ro','google.rs','google.ru','google.rw','google.sc','google.se','google.sh','google.si','google.sk','google.sm','google.sn','google.so','google.sr','google.st','google.td','google.tg','google.tk','google.tl','google.tm','google.tn','google.to','google.tt','google.us','google.uz','google.vg','google.vu','google.ws','googlemail.com','youtube.com'] },
  { label: 'youtube', display: 'YouTube', domains: ['youtu.be','youtube.ae','youtube.al','youtube.am','youtube.at','youtube.auto','youtube.az','youtube.ba','youtube.be','youtube.bg','youtube.bh','youtube.bo','youtube.by','youtube.ca','youtube.cat','youtube.ch','youtube.cl','youtube.co','youtube.co.id','youtube.co.il','youtube.co.in','youtube.co.jp','youtube.co.kr','youtube.co.th','youtube.co.uk','youtube.co.za','youtube.com','youtube.com.ar','youtube.com.au','youtube.com.br','youtube.com.hk','youtube.com.mx','youtube.com.my','youtube.com.ph','youtube.com.sg','youtube.com.tr','youtube.com.tw','youtube.com.ua','youtube.cr','youtube.cz','youtube.de','youtube.dk','youtube.ee','youtube.es','youtube.fi','youtube.fr','youtube.ge','youtube.gr','youtube.gt','youtube.hk','youtube.hr','youtube.hu','youtube.ie','youtube.in','youtube.iq','youtube.is','youtube.it','youtube.jo','youtube.jp','youtube.kr','youtube.kz','youtube.la','youtube.lk','youtube.lt','youtube.lu','youtube.lv','youtube.ly','youtube.ma','youtube.md','youtube.me','youtube.mk','youtube.mn','youtube.mx','youtube.my','youtube.net','youtube.ng','youtube.ni','youtube.nl','youtube.no','youtube.pa','youtube.pe','youtube.ph','youtube.pk','youtube.pl','youtube.pr','youtube.pt','youtube.qa','youtube.ro','youtube.rs','youtube.ru','youtube.sa','youtube.se','youtube.sg','youtube.si','youtube.sk','youtube.sn','youtube.soy','youtube.sv','youtube.tn','youtube.tv','youtube.ua','youtube.ug','youtube.uy','youtube.video','youtube.vn'] },
  { label: 'facebook', display: 'Facebook', domains: ['facebook.at','facebook.ca','facebook.co','facebook.com','facebook.com.au','facebook.com.br','facebook.com.mx','facebook.com.vn','facebook.de','facebook.design','facebook.dk','facebook.es','facebook.fr','facebook.hu','facebook.in','facebook.it','facebook.net','facebook.nl','facebook.org','facebook.pl','facebook.ru','facebook.se','facebook.us','fb.com','fb.me'] },
  { label: 'instagram', display: 'Instagram', domains: ['instagram.co','instagram.com','instagram.com.br','instagram.de','instagram.fr','instagram.net'] },
  { label: 'whatsapp', display: 'WhatsApp', domains: ['wa.me','whatsapp.com','whatsapp.net'] },
  { label: 'telegram', display: 'Telegram', domains: ['t.me','telegram.me','telegram.org'] },
  { label: 'twitter', display: 'Twitter / X', domains: ['t.co','twitter.biz','twitter.co','twitter.com','twitter.com.br','twitter.jp','x.com'] },
  { label: 'linkedin', display: 'LinkedIn', domains: ['linkedin.at','linkedin.biz','linkedin.cn','linkedin.com','linkedin.com.br','linkedin.de','lnkd.in'] },
  { label: 'tiktok', display: 'TikTok', domains: ['tiktok.com','tiktok.in','tiktok.me','tiktok.ru','tiktok.shop','tiktok.tv'] },
  { label: 'reddit', display: 'Reddit', domains: ['redd.it','reddit.com','reddit.tube'] },
  { label: 'discord', display: 'Discord', domains: ['discord.com','discord.gg','discord.media','discordapp.com'] },
  { label: 'twitch', display: 'Twitch', domains: ['twitch.tv'] },
  { label: 'github', display: 'GitHub', domains: ['github.com','github.io'] },
  { label: 'microsoft', display: 'Microsoft', domains: ['azure.com','bing.com','live.com','microsoft.ai','microsoft.cloud','microsoft.cn','microsoft.co.il','microsoft.com','microsoft.de','microsoft.design','microsoft.fr','microsoft.net','microsoft.ru','microsoft.us','microsoftonline.com','msn.com','office.com','outlook.com'] },
  { label: 'apple', display: 'Apple', domains: ['apple.cn','apple.co','apple.co.jp','apple.com','apple.com.cn','apple.de','apple.fr','apple.news','apple.ru','apple.us','icloud.com','me.com'] },
  { label: 'amazon', display: 'Amazon', domains: ['amazon.ae','amazon.app','amazon.at','amazon.ca','amazon.cl','amazon.cn','amazon.co','amazon.co.jp','amazon.co.uk','amazon.co.za','amazon.com','amazon.com.au','amazon.com.br','amazon.com.mx','amazon.com.sg','amazon.com.tr','amazon.de','amazon.dev','amazon.eg','amazon.es','amazon.eu','amazon.fr','amazon.ie','amazon.in','amazon.io','amazon.it','amazon.jobs','amazon.jp','amazon.me','amazon.net','amazon.nl','amazon.pl','amazon.pt','amazon.ru','amazon.sa','amazon.science','amazon.se','amazon.sg','amazon.vn','amazon.voting','amazon.work','amazon.xyz','amazonaws.com','aws.amazon.com'] },
  { label: 'netflix', display: 'Netflix', domains: ['netflix.com','netflix.net'] },
  { label: 'spotify', display: 'Spotify', domains: ['spotify.com'] },
  { label: 'dropbox', display: 'Dropbox', domains: ['dropbox.com'] },
  { label: 'adobe', display: 'Adobe', domains: ['adobe.com','adobe.io','adobe.net'] },
  { label: 'yahoo', display: 'Yahoo', domains: ['yahoo.co.jp','yahoo.com','yahoo.net'] },
  { label: 'ebay', display: 'eBay', domains: ['ebay.at','ebay.be','ebay.ca','ebay.ch','ebay.cn','ebay.co','ebay.co.jp','ebay.co.uk','ebay.com','ebay.com.au','ebay.com.cn','ebay.com.hk','ebay.com.my','ebay.com.sg','ebay.de','ebay.es','ebay.eu','ebay.fr','ebay.ie','ebay.in','ebay.it','ebay.la','ebay.ng','ebay.nl','ebay.ph','ebay.pl','ebay.st','ebay.to','ebay.us'] },
  { label: 'steam', display: 'Steam', domains: ['steamcommunity.com','steampowered.com'] },
  { label: 'steamcommunity', display: 'Steam Community', domains: ['steamcommunity.com'] },

  // ---- Payments / crypto ----
  { label: 'paypal', display: 'PayPal', domains: ['paypal.cn','paypal.co.uk','paypal.com','paypal.com.au','paypal.de','paypal.es','paypal.fr','paypal.gd','paypal.it','paypal.jp','paypal.me'] },
  { label: 'stripe', display: 'Stripe', domains: ['stripe.com','stripe.dev','stripe.global','stripe.me','stripe.network','stripe.partners'] },
  { label: 'coinbase', display: 'Coinbase', domains: ['coinbase.com'] },
  { label: 'binance', display: 'Binance', domains: ['binance.bh','binance.charity','binance.click','binance.cloud','binance.com','binance.im','binance.info','binance.je','binance.me','binance.org','binance.sg','binance.th','binance.tr','binance.us','binance.vision'] },
  { label: 'metamask', display: 'MetaMask', domains: ['metamask.io'] },
  { label: 'kraken', display: 'Kraken', domains: ['kraken.com'] },

  // ---- Banks (intl) ----
  { label: 'wellsfargo', display: 'Wells Fargo', domains: ['wellsfargo.com'] },
  { label: 'bankofamerica', display: 'Bank of America', domains: ['bankofamerica.com'] },
  { label: 'chase', display: 'Chase', domains: ['chase.com'] },
  { label: 'citibank', display: 'Citibank', domains: ['citi.com','citibank.ae','citibank.co.id','citibank.co.in','citibank.co.kr','citibank.com','citibank.com.au','citibank.com.br','citibank.com.cn','citibank.com.hk','citibank.com.sg','citibank.pl','citibank.ru'] },
  { label: 'hsbc', display: 'HSBC', domains: ['hsbc.co.uk','hsbc.com'] },
  { label: 'revolut', display: 'Revolut', domains: ['revolut.com'] },

  // ---- Shipping ----
  { label: 'dhl', display: 'DHL', domains: ['dhl.com','dhl.de'] },
  { label: 'fedex', display: 'FedEx', domains: ['fedex.com'] },
  { label: 'usps', display: 'USPS', domains: ['usps.com'] },

  // ---- Russia / CIS (audience-relevant) ----
  { label: 'sberbank', display: 'Сбербанк', domains: ['online.sberbank.ru','sber.ru','sberbank.com','sberbank.ru'] },
  { label: 'sber', display: 'Сбер', domains: ['sber.ru','sberbank.ru'] },
  { label: 'gosuslugi', display: 'Госуслуги', domains: ['gosuslugi.ru'] },
  { label: 'tinkoff', display: 'Т-Банк (Тинькофф)', domains: ['tbank.ru','tinkoff.ru'] },
  { label: 'alfabank', display: 'Альфа-Банк', domains: ['alfabank.by','alfabank.com','alfabank.com.ua','alfabank.kz','alfabank.ru','alfabank.st'] },
  { label: 'vtb', display: 'ВТБ', domains: ['vtb.ru'] },
  { label: 'yandex', display: 'Яндекс', domains: ['ya.ru','yandex.by','yandex.com','yandex.com.tr','yandex.kz','yandex.net','yandex.ru'] },
  { label: 'vk', display: 'ВКонтакте', domains: ['vk.com','vk.ru','vkontakte.ru'] },
  { label: 'ozon', display: 'Ozon', domains: ['ozon.ru'] },
  { label: 'wildberries', display: 'Wildberries', domains: ['wb.ru','wildberries.ru'] },
  { label: 'mailru', display: 'Mail.ru', domains: ['mail.ru'] },
  { label: 'avito', display: 'Авито', domains: ['avito.ru','avito.st'] },

  // ---- More payments / fintech ----
  { label: 'venmo', display: 'Venmo', domains: ['venmo.com'] },
  { label: 'cashapp', display: 'Cash App', domains: ['cash.app','cash.me'] },
  { label: 'wise', display: 'Wise', domains: ['wise.com'] },
  { label: 'zelle', display: 'Zelle', domains: ['zellepay.com'] },
  { label: 'klarna', display: 'Klarna', domains: ['klarna.com'] },
  { label: 'skrill', display: 'Skrill', domains: ['skrill.com'] },
  { label: 'payoneer', display: 'Payoneer', domains: ['payoneer.com'] },
  { label: 'qiwi', display: 'QIWI', domains: ['qiwi.com','qiwi.ru'] },
  { label: 'westernunion', display: 'Western Union', domains: ['westernunion.com'] },

  // ---- More crypto ----
  { label: 'cryptocom', display: 'Crypto.com', domains: ['crypto.com'] },
  { label: 'kucoin', display: 'KuCoin', domains: ['kucoin.com'] },
  { label: 'bybit', display: 'Bybit', domains: ['bybit.com'] },
  { label: 'okexchange', display: 'OKX', domains: ['okx.com'] },
  { label: 'bitget', display: 'Bitget', domains: ['bitget.com'] },
  { label: 'gateio', display: 'Gate.io', domains: ['gate.io'] },
  { label: 'blockchain', display: 'Blockchain.com', domains: ['blockchain.com'] },
  { label: 'ledger', display: 'Ledger', domains: ['ledger.com'] },
  { label: 'trezor', display: 'Trezor', domains: ['trezor.io'] },
  { label: 'trustwallet', display: 'Trust Wallet', domains: ['trustwallet.com'] },
  { label: 'phantom', display: 'Phantom', domains: ['phantom.app','phantom.com'] },
  { label: 'bitcoin', display: 'Bitcoin', domains: ['bitcoin.org'] },

  // ---- More banks (intl) ----
  { label: 'barclays', display: 'Barclays', domains: ['barclays.co.uk','barclays.com'] },
  { label: 'santander', display: 'Santander', domains: ['santander.co.uk','santander.com'] },
  { label: 'lloyds', display: 'Lloyds Bank', domains: ['lloydsbank.com'] },
  { label: 'natwest', display: 'NatWest', domains: ['natwest.com'] },
  { label: 'capitalone', display: 'Capital One', domains: ['capitalone.com'] },
  { label: 'americanexpress', display: 'American Express', domains: ['americanexpress.com','amex.com'] },
  { label: 'usbank', display: 'U.S. Bank', domains: ['usbank.com'] },
  { label: 'deutschebank', display: 'Deutsche Bank', domains: ['db.com','deutsche-bank.de'] },
  { label: 'bbva', display: 'BBVA', domains: ['bbva.com','bbva.es'] },

  // ---- More shipping ----
  { label: 'ups', display: 'UPS', domains: ['ups.com'] },
  { label: 'royalmail', display: 'Royal Mail', domains: ['royalmail.com'] },
  { label: 'dpd', display: 'DPD', domains: ['dpd.com','dpd.co.uk'] },
  { label: 'pochta', display: 'Почта России', domains: ['pochta.ru'] },

  // ---- Email providers ----
  { label: 'proton', display: 'Proton', domains: ['proton.me','protonmail.com'] },
  { label: 'gmx', display: 'GMX', domains: ['gmx.com','gmx.de','gmx.net'] },

  // ---- Shopping / marketplaces ----
  { label: 'aliexpress', display: 'AliExpress', domains: ['aliexpress.com','aliexpress.ru'] },
  { label: 'walmart', display: 'Walmart', domains: ['walmart.com'] },
  { label: 'etsy', display: 'Etsy', domains: ['etsy.com'] },
  { label: 'shopify', display: 'Shopify', domains: ['shopify.com','myshopify.com'] },
  { label: 'rakuten', display: 'Rakuten', domains: ['rakuten.co.jp','rakuten.com'] },
  { label: 'mercadolibre', display: 'Mercado Libre', domains: ['mercadolibre.com','mercadolivre.com.br'] },

  // ---- Gaming ----
  { label: 'epicgames', display: 'Epic Games', domains: ['epicgames.com'] },
  { label: 'roblox', display: 'Roblox', domains: ['roblox.com'] },
  { label: 'battlenet', display: 'Battle.net', domains: ['battle.net','blizzard.com'] },
  { label: 'playstation', display: 'PlayStation', domains: ['playstation.com'] },
  { label: 'nintendo', display: 'Nintendo', domains: ['nintendo.com','nintendo.net'] },

  // ---- Travel / services ----
  { label: 'booking', display: 'Booking.com', domains: ['booking.com'] },
  { label: 'airbnb', display: 'Airbnb', domains: ['airbnb.com','airbnb.ru'] },
  { label: 'uber', display: 'Uber', domains: ['uber.com'] },

  // ---- Government / tax ----
  { label: 'irsgov', display: 'IRS', domains: ['irs.gov'] },
  { label: 'hmrc', display: 'HMRC / GOV.UK', domains: ['gov.uk','tax.service.gov.uk'] },

  // ---- More tech / cloud / email ----
  { label: 'cloudflare', display: 'Cloudflare', domains: ['cloudflare.com'] },
  { label: 'oracle', display: 'Oracle', domains: ['oracle.com'] },
  { label: 'salesforce', display: 'Salesforce', domains: ['salesforce.com'] },
  { label: 'zoom', display: 'Zoom', domains: ['zoom.us','zoom.com'] },
  { label: 'slack', display: 'Slack', domains: ['slack.com'] },
  { label: 'notion', display: 'Notion', domains: ['notion.so','notion.com'] },
  { label: 'figma', display: 'Figma', domains: ['figma.com'] },
  { label: 'atlassian', display: 'Atlassian', domains: ['atlassian.com','atlassian.net'] },
  { label: 'docusign', display: 'DocuSign', domains: ['docusign.com','docusign.net'] },
  { label: 'wetransfer', display: 'WeTransfer', domains: ['wetransfer.com'] },
  { label: 'mega', display: 'MEGA', domains: ['mega.nz','mega.io'] },
  { label: 'protonvpn', display: 'Proton VPN', domains: ['protonvpn.com'] },
  { label: 'aol', display: 'AOL', domains: ['aol.com'] },
  { label: 'zoho', display: 'Zoho', domains: ['zoho.com','zoho.eu'] },

  // ---- More streaming / media ----
  { label: 'disney', display: 'Disney+', domains: ['disneyplus.com','disney.com'] },
  { label: 'hbomax', display: 'Max (HBO)', domains: ['max.com','hbomax.com'] },
  { label: 'primevideo', display: 'Prime Video', domains: ['primevideo.com'] },
  { label: 'hulu', display: 'Hulu', domains: ['hulu.com'] },
  { label: 'paramountplus', display: 'Paramount+', domains: ['paramountplus.com'] },

  // ---- More crypto / trading ----
  { label: 'bitfinex', display: 'Bitfinex', domains: ['bitfinex.com'] },
  { label: 'bitstamp', display: 'Bitstamp', domains: ['bitstamp.net'] },
  { label: 'gemini', display: 'Gemini', domains: ['gemini.com'] },
  { label: 'etoro', display: 'eToro', domains: ['etoro.com'] },
  { label: 'robinhood', display: 'Robinhood', domains: ['robinhood.com'] },
  { label: 'uniswap', display: 'Uniswap', domains: ['uniswap.org'] },
  { label: 'opensea', display: 'OpenSea', domains: ['opensea.io'] },
  { label: 'exodus', display: 'Exodus', domains: ['exodus.com'] },

  // ---- More banks (intl) ----
  { label: 'tdbank', display: 'TD Bank', domains: ['td.com','tdbank.com'] },
  { label: 'pncbank', display: 'PNC Bank', domains: ['pnc.com'] },
  { label: 'scotiabank', display: 'Scotiabank', domains: ['scotiabank.com'] },
  { label: 'commbank', display: 'CommBank', domains: ['commbank.com.au'] },
  { label: 'monzo', display: 'Monzo', domains: ['monzo.com'] },
  { label: 'n26', display: 'N26', domains: ['n26.com'] },
  { label: 'ing', display: 'ING', domains: ['ing.com','ing.nl','ing.de'] },
  { label: 'unicredit', display: 'UniCredit', domains: ['unicredit.it','unicreditgroup.eu'] },
  { label: 'creditagricole', display: 'Crédit Agricole', domains: ['credit-agricole.fr'] },

  // ---- Telecom (frequent SMS/phishing targets) ----
  { label: 'verizon', display: 'Verizon', domains: ['verizon.com'] },
  { label: 'attmobile', display: 'AT&T', domains: ['att.com'] },
  { label: 'tmobile', display: 'T-Mobile', domains: ['t-mobile.com'] },
  { label: 'vodafone', display: 'Vodafone', domains: ['vodafone.com'] },
  { label: 'orange', display: 'Orange', domains: ['orange.com','orange.fr'] },
  { label: 'mtsbank', display: 'МТС', domains: ['mts.ru'] },
  { label: 'beeline', display: 'Билайн', domains: ['beeline.ru'] },
  { label: 'megafon', display: 'МегаФон', domains: ['megafon.ru'] },

  // ---- More shopping / delivery ----
  { label: 'alibaba', display: 'Alibaba', domains: ['alibaba.com'] },
  { label: 'temu', display: 'Temu', domains: ['temu.com'] },
  { label: 'shein', display: 'SHEIN', domains: ['shein.com'] },
  { label: 'asos', display: 'ASOS', domains: ['asos.com'] },
  { label: 'ikea', display: 'IKEA', domains: ['ikea.com'] },
  { label: 'dpdgroup', display: 'DPD', domains: ['dpdgroup.com'] },
  { label: 'cdek', display: 'СДЭК', domains: ['cdek.ru'] },

  // ---- More social / comms ----
  { label: 'snapchat', display: 'Snapchat', domains: ['snapchat.com'] },
  { label: 'pinterest', display: 'Pinterest', domains: ['pinterest.com'] },
  { label: 'signal', display: 'Signal', domains: ['signal.org'] },
  { label: 'odnoklassniki', display: 'Одноклассники', domains: ['ok.ru'] },
]

// Flat set of every legitimate *brand* domain. Membership here means "this is a
// verified brand site" → trusted (green) badge AND skip impersonation checks.
// NOTE: popularity ≠ trust. Popular-but-not-brand domains are handled separately
// via the top-domains bloom filter (false-positive suppression), NOT here.
export const LEGIT_DOMAINS = new Set()
// Maps each legitimate domain to its brand display name (for "trusted" badges).
export const DOMAIN_TO_BRAND = new Map()

for (const brand of BRANDS) {
  for (const d of brand.domains) {
    LEGIT_DOMAINS.add(d)
    DOMAIN_TO_BRAND.set(d, brand.display)
  }
}

// Distinctive brand labels used for combosquatting detection. Short or
// dictionary-word-ish labels are excluded to avoid false positives.
// Dictionary-ish labels are excluded so ordinary words in a domain don't trip
// combosquatting (e.g. "orange", "signal", "gemini", "exodus").
const COMBO_EXCLUDE = ['apple', 'chase', 'steam', 'kraken', 'orange', 'signal', 'gemini', 'exodus', 'phantom', 'booking', 'discord']
export const COMBO_LABELS = BRANDS
  .map((b) => b.label)
  .filter((l) => l.length >= 5 && !COMBO_EXCLUDE.includes(l))

// Helper to get brand info (label and display name) by its legit domain
export function getBrandByDomain(domain) {
  for (const brand of BRANDS) {
    if (brand.domains.includes(domain)) {
      return { label: brand.label, display: brand.display };
    }
  }
  return null;
}
