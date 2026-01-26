/**
 * Скрипт автоматической миграции сотрудников через Strapi API
 * 
 * Требования:
 *   1. Strapi должен быть запущен (npm run develop)
 * 
 * Использование:
 *   cd server
 *   node scripts/migrate-employees-api.js
 * 
 * Токен НЕ требуется - используются кастомные API endpoints без авторизации
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const STRAPI_URL = process.env.STRAPI_URL || 'http://192.168.101.25:12003';
// Токен больше не требуется - используем кастомные API endpoints без авторизации

// Простая функция fetch через http/https модули Node.js
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    
    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const response = {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        };
        resolve(response);
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function migrateViaAPI() {
  const excelPath = path.join(__dirname, '../../backend/KPIsum_dynamic.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Файл не найден: ${excelPath}`);
    process.exit(1);
  }

  // Токен не требуется - используем кастомные API endpoints без авторизации

  console.log('📖 Читаю Excel файл...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const worksheet = workbook.worksheets[0];
  const employees = [];
  
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const fio = String(row.getCell(2)?.value || '').trim();
    
    if (!fio) continue;
    
    const kpiSum = parseFloat(row.getCell(3)?.value || 0) || 0;
    const scheduleType = String(row.getCell(4)?.value || '').trim().toLowerCase() || 'day';
    const department = String(row.getCell(5)?.value || '').trim();
    const categoryCode = String(row.getCell(6)?.value || '').trim();
    
    employees.push({
      fio,
      kpiSum,
      scheduleType,
      department,
      categoryCode,
    });
  }
  
  console.log(`✅ Найдено ${employees.length} сотрудников\n`);
  console.log('🔄 Начинаю миграцию через API...\n');
  
  let success = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const emp of employees) {
    try {
      // Проверяем, существует ли уже сотрудник через наш кастомный API
      const checkRes = await fetch(`${STRAPI_URL}/api/kpi-list`);
      
      if (!checkRes.ok) {
        const errorText = await checkRes.text();
        throw new Error(`Ошибка проверки списка: ${errorText}`);
      }
      
      const checkData = await checkRes.json();
      const existing = (checkData.items || []).find(
        (item) => item.fio && item.fio.trim().toLowerCase() === emp.fio.trim().toLowerCase()
      );
      
      if (existing) {
        console.log(`⏭️  Пропущен (уже существует): ${emp.fio}`);
        skipped++;
        continue;
      }
      
      // Создаём сотрудника через наш кастомный API /api/kpi-add
      const createRes = await fetch(`${STRAPI_URL}/api/kpi-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emp),
      });
      
      if (!createRes.ok) {
        const errorText = await createRes.text();
        let errorMsg = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error?.message || errorJson.message || errorText;
        } catch {}
        console.error(`❌ Ошибка при создании ${emp.fio}: ${errorMsg}`);
        errors++;
        continue;
      }
      
      const result = await createRes.json();
      console.log(`✅ Создан: ${emp.fio} (${emp.department})`);
      success++;
      
      // Небольшая задержка, чтобы не перегружать API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      const errorMsg = err.message || String(err);
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed')) {
        console.error(`❌ Ошибка подключения к Strapi. Убедитесь, что Strapi запущен на ${STRAPI_URL}`);
        console.error(`   Остановка миграции после ${success + skipped + errors} записей`);
        break;
      }
      console.error(`❌ Ошибка при обработке ${emp.fio}:`, errorMsg);
      errors++;
    }
  }
  
  console.log('\n📊 Итоги миграции:');
  console.log(`   ✅ Успешно: ${success}`);
  console.log(`   ⏭️  Пропущено: ${skipped}`);
  console.log(`   ❌ Ошибок: ${errors}`);
  console.log(`   📝 Всего: ${employees.length}`);
}

migrateViaAPI().catch(err => {
  console.error('❌ Критическая ошибка:', err);
  process.exit(1);
});
