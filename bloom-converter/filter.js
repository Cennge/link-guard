const fs = require('fs');
const readline = require('readline');

// 1. Паттерны технического мусора, который нужно ИГНОРИРОВАТЬ
const JUNK_PATTERNS = [
    /cdn/i, /tracker/i, /telemetry/i, /analytics/i, /adsystem/i, /advertising/i,
    /static/i, /api\./i, /content\./i, /cloudfront/i, /amazonaws/i, /traffic/i,
    /doubleclick/i, /googlesyndication/i, /akamai/i, /edge/i, /wp-content/i
];

// 2. Ключевые слова критичных ниш (Бренды, Крипта, Финансы, Соцсети, Админки)
const CRITICAL_KEYWORDS = [
    'google', 'facebook', 'instagram', 'twitter', 'tiktok', 'linkedin', 'reddit', 'youtube', // Соцсети
    'apple', 'microsoft', 'amazon', 'ebay', 'aliexpress', 'shopify', 'walmart', 'etsy',      // Маркетплейсы
    'binance', 'coinbase', 'crypto', 'wallet', 'token', 'blockchain', 'solana', 'ethereum',   // Web3 / Крипта
    'bank', 'pay', 'card', 'checkout', 'finance', 'stripe', 'paypal', 'visa', 'mastercard',   // Финансы
    'ads', 'manager', 'business', 'pixel', 'login', 'auth', 'signin', 'verification',        // Антифрод-зоны
    'casino', 'bet', 'poker', 'gamble', 'slot'                                                // Гемблинг
];

async function filterToCriticalAndBrands() {
    const sourceCsv = 'top-1m.csv'; // Исходный файл на 1 млн
    const outputTxt = 'cleaned_top_domains.txt'; // Результат

    if (!fs.existsSync(sourceCsv)) {
        console.error(`Ошибка: Исходный файл ${sourceCsv} не найден.`);
        return;
    }

    const fileStream = fs.createReadStream(sourceCsv);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const uniqueDomains = new Set();
    let totalLines = 0;

    console.log('Анализ и фильтрация доменов...');

    for await (const line of rl) {
        totalLines++;
        let cleanLine = line.trim();
        if (!cleanLine) continue;

        // Вытаскиваем домен из CSV (например из "1,google.com")
        if (cleanLine.includes(',')) {
            const parts = cleanLine.split(',');
            const domainPart = parts.find(p => p.includes('.') && isNaN(p));
            cleanLine = domainPart ? domainPart.trim() : parts[1].trim();
        }

        // Базовая очистка
        let domain = cleanLine.toLowerCase()
            .replace(/^(https?:\/\/)?(www\.)?/, '')
            .split('/')[0];

        if (!domain || !domain.includes('.')) continue;

        // Проверка 1: Убираем явный технический мусор
        const isJunk = JUNK_PATTERNS.some(pattern => pattern.test(domain));
        if (isJunk) continue;

        // Проверка 2: Проверяем, входит ли домен в категорию брендов/критичных сайтов
        const isCritical = CRITICAL_KEYWORDS.some(keyword => domain.includes(keyword));

        // Проверка 3: Если домен входит в Топ-5000 мира, берем его в любом случае (это главные сайты интернета)
        const isTopGlobal = totalLines <= 5000;

        if (isCritical || isTopGlobal) {
            // Очищаем от поддоменов третьего уровня (оставляем только brand.com)
            // Исключение для региональных зон вроде .co.uk или .com.ua
            const domainParts = domain.split('.');
            if (domainParts.length > 2 && domainParts[domainParts.length - 2].length > 3) {
                domain = domainParts.slice(-2).join('.');
            }

            uniqueDomains.add(domain);
        }
    }

    // Сохраняем отфильтрованный список
    const sortedDomains = Array.from(uniqueDomains).sort();
    fs.writeFileSync(outputTxt, sortedDomains.join('\n'));

    console.log('\n🎉 Фильтрация завершена успешно!');
    console.log(`=========================================`);
    console.log(`Проанализировано строк:   ${totalLines}`);
    console.log(`Осталось чистых брендов:  ${sortedDomains.length}`);
    console.log(`Сохранено в файл:         ${outputTxt}`);
    console.log(`=========================================`);
}

filterToCriticalAndBrands();