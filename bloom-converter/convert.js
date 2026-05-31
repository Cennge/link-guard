const { BloomFilter } = require('bloomfilter');
const fs = require('fs');
const readline = require('readline');

// НАСТРОЙКИ ФИЛЬТРА (Важно для точности)
// 16 000 000 бит = ровно 2 Мегабайта на выходе.
// Для 1 000 000 доменов при 4 хэш-функциях это дает шанс ложного срабатывания всего ~1%.
const TOTAL_BITS = 16000000;
const HASH_FUNCTIONS = 4;

async function convertCsvToBloomBinary() {
    const csvFilePath = 'cleaned_top_domains.txt'; // <--- Укажи здесь имя твоего исходного файла!
    const binaryOutputPath = 'bloomfilter.bin';

    console.log('Инициализация Фильтра Блума...');
    const filter = new BloomFilter(TOTAL_BITS, HASH_FUNCTIONS);

    // Проверяем, существует ли исходный файл
    if (!fs.existsSync(csvFilePath)) {
        console.error(`Ошибка: Файл ${csvFilePath} не найден в текущей директории.`);
        return;
    }

    // Настраиваем потоковое чтение файла строка за строкой
    const fileStream = fs.createReadStream(csvFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let count = 0;
    console.log('Начало конвертации массива данных...');

    for await (const line of rl) {
        let cleanLine = line.trim();
        if (!cleanLine) continue;

        // Оптимизация: если это классический CSV с разделителем (например: "1,google.com" или "google.com,12345")
        if (cleanLine.includes(',')) {
            const parts = cleanLine.split(',');
            // Ищем, какая из частей похожа на домен (содержит точку и не является просто числом)
            const domainPart = parts.find(p => p.includes('.') && isNaN(p));
            cleanLine = domainPart ? domainPart.trim() : parts[1].trim();
        }

        // Очищаем от протоколов и www, если они случайно затесались в списке
        let domain = cleanLine.toLowerCase()
            .replace(/^(https?:\/\/)?(www\.)?/, '')
            .split('/')[0]; // убираем пути, оставляем только чистый хост

        if (domain) {
            // Вставляем домен в фильтр
            filter.add(domain);
            count++;

            // Логируем прогресс каждые 100 000 строк
            if (count % 100000 === 0) {
                console.log(`Успешно обработано: ${count} доменов...`);
            }
        }
    }

    console.log('Сжатие данных и экспорт в бинарный формат...');

    const filterBuffer = Buffer.from(filter.buckets.buffer);

    // Записываем финальный готовый бинарник
    fs.writeFileSync(binaryOutputPath, filterBuffer);

    console.log('\n🎉 Конвертация успешно завершена!');
    console.log(`=========================================`);
    console.log(`Всего доменов упаковано: ${count}`);
    console.log(`Создан бинарный файл:    ${binaryOutputPath}`);
    console.log(`Финальный размер файла:  ${(filterBuffer.length / 1024 / 1024).toFixed(2)} МБ (ровно 2.00 МБ)`);
    console.log(`=========================================`);
}

convertCsvToBloomBinary().catch(err => console.error('Критическая ошибка при конвертации:', err));