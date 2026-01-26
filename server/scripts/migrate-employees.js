/**
 * Скрипт миграции сотрудников из Excel (backend/KPIsum_dynamic.xlsx) в Strapi
 * 
 * Использование:
 *   cd server
 *   node scripts/migrate-employees.js
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function migrateEmployees() {
  const excelPath = path.join(__dirname, '../../backend/KPIsum_dynamic.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Файл не найден: ${excelPath}`);
    console.log('Убедитесь, что файл backend/KPIsum_dynamic.xlsx существует');
    process.exit(1);
  }

  console.log('📖 Читаю Excel файл...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const worksheet = workbook.worksheets[0];
  const employees = [];
  
  // Пропускаем заголовок (первая строка)
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const fio = String(row.getCell(2)?.value || '').trim(); // колонка B (fio)
    
    if (!fio) continue;
    
    const id = parseInt(row.getCell(1)?.value || 0) || 0; // колонка A (id)
    const kpiSum = parseFloat(row.getCell(3)?.value || 0) || 0; // колонка C (kpiSum)
    const scheduleType = String(row.getCell(4)?.value || '').trim() || 'day'; // колонка D
    const department = String(row.getCell(5)?.value || '').trim(); // колонка E
    const categoryCode = String(row.getCell(6)?.value || '').trim(); // колонка F
    
    employees.push({
      id,
      fio,
      kpiSum,
      scheduleType: scheduleType.toLowerCase(),
      department,
      categoryCode,
    });
  }
  
  console.log(`✅ Найдено ${employees.length} сотрудников в Excel`);
  console.log('\nПримеры:');
  employees.slice(0, 3).forEach(emp => {
    console.log(`  - ${emp.fio} (${emp.department}, ${emp.scheduleType})`);
  });
  
  console.log('\n📝 Инструкция по миграции:');
  console.log('1. Откройте Strapi админку: http://192.168.101.25:12003/admin');
  console.log('2. Перейдите в Content Manager → Employee');
  console.log('3. Используйте кнопку "Create new entry" для каждого сотрудника');
  console.log('   ИЛИ используйте API скрипт ниже\n');
  
  console.log('💻 Для автоматической миграции через API, запустите:');
  console.log('   node scripts/migrate-employees-api.js\n');
  
  // Сохраняем данные в JSON для API скрипта
  const jsonPath = path.join(__dirname, 'employees-to-migrate.json');
  fs.writeFileSync(jsonPath, JSON.stringify(employees, null, 2));
  console.log(`✅ Данные сохранены в: ${jsonPath}`);
}

migrateEmployees().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
