import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';

interface Holiday {
  date?: string;
  year?: number;
  month?: number;
}

interface ParsedEmployee {
  fio: string;
  letters_weekday: number;
  letters_sat: number;
  letters_sun: number;
  letters_holiday: number;
  numbers_weekday: number;
  numbers_sat: number;
  numbers_sun: number;
  numbers_holiday: number;
  workedDaysTotal?: number;
}

function normalizeHolidays(
  holidays: (string | number)[] | undefined,
  year: number,
  month: number
): Set<number> {
  const out = new Set<number>();
  if (!holidays) {
    console.log(`📅 Нет праздников для ${year}-${month}`);
    return out;
  }

  console.log(`📅 Обработка праздников для ${year}-${month}:`, holidays);

  for (const h of holidays) {
    if (h === null || h === undefined) continue;
    
    if (typeof h === 'number') {
      if (h >= 1 && h <= 31) {
        out.add(h);
        console.log(`  ✓ Добавлен праздник: день ${h}`);
      }
      continue;
    }

    const s = String(h).trim();
    if (!s) continue;

    // ISO date format: "2025-12-16" or "2025-12-16T00:00:00.000Z"
    if (s.includes('-')) {
      const parts = s.split('T')[0].split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const d = parseInt(parts[2]);
        if (y === year && m === month && d >= 1 && d <= 31) {
          out.add(d);
          console.log(`  ✓ Добавлен праздник: ${s} -> день ${d}`);
        } else {
          console.log(`  ✗ Пропущен праздник ${s} (не соответствует ${year}-${month})`);
        }
      }
      continue;
    }

    // Day number: "16" or 16
    if (/^\d+$/.test(s)) {
      const d = parseInt(s);
      if (d >= 1 && d <= 31) {
        out.add(d);
        console.log(`  ✓ Добавлен праздник: день ${d}`);
      }
    }
  }

  console.log(`📅 Итоговый набор праздничных дней:`, Array.from(out).sort((a, b) => a - b));
  return out;
}

function classifyDay(
  year: number,
  month: number,
  dayNum: number,
  holidayDays: Set<number>
): 'weekday' | 'sat' | 'sun' | 'holiday' {
  // Сначала проверяем, является ли день праздничным
  if (holidayDays.has(dayNum)) {
    return 'holiday';
  }

  try {
    const date = DateTime.fromObject({ year, month, day: dayNum });
    const weekday = date.weekday; // 1=Monday, 7=Sunday
    
    if (weekday === 6) return 'sat';
    if (weekday === 7) return 'sun';
    return 'weekday';
  } catch {
    return 'weekday';
  }
}

function tryFloat(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && isNaN(val)) return null;
  
  try {
    const s = String(val).trim().replace(',', '.');
    if (!s) return null;
    const num = parseFloat(s);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export async function parseTimesheet(
  fileBuffer: Buffer,
  year: number,
  month: number,
  holidays: (string | number)[] = []
): Promise<ParsedEmployee[]> {
  const holidayDays = normalizeHolidays(holidays, year, month);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  // Try to find Kazakh template first
  let worksheet = workbook.worksheets[0];
  let headerRowIdx: number | null = null;

  // Find "АТЫ-жөні (толығымен)" header
  for (let i = 0; i < worksheet.rowCount; i++) {
    const row = worksheet.getRow(i + 1);
    for (let j = 1; j <= worksheet.columnCount; j++) {
      const cell = row.getCell(j);
      const value = String(cell.value || '').trim();
      if (value === 'АТЫ-жөні (толығымен)') {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx !== null) break;
  }

  if (headerRowIdx !== null) {
    return parseKazakhTemplate(worksheet, headerRowIdx, year, month, holidayDays);
  }

  // Try simple template with "Сотрудник" column
  worksheet = workbook.worksheets[0];
  const headerRow = worksheet.getRow(1);
  let hasEmployeeCol = false;
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = headerRow.getCell(j);
    if (String(cell.value || '').trim() === 'Сотрудник') {
      hasEmployeeCol = true;
      break;
    }
  }

  if (hasEmployeeCol) {
    return parseSimpleTemplate(worksheet, year, month, holidayDays);
  }

  throw new Error(
    'Не удалось определить формат табеля. Нет ни заголовка "АТЫ-жөні (толығымен)", ни колонки "Сотрудник".'
  );
}

function parseKazakhTemplate(
  worksheet: ExcelJS.Worksheet,
  headerRowIdx: number,
  year: number,
  month: number,
  holidayDays: Set<number>
): ParsedEmployee[] {
  const headerRow = worksheet.getRow(headerRowIdx + 1);
  let fioCol: number | null = null;

  // Find FIO column
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = headerRow.getCell(j);
    if (String(cell.value || '').trim() === 'АТЫ-жөні (толығымен)') {
      fioCol = j;
      break;
    }
  }

  if (!fioCol) {
    throw new Error('Не найдена колонка с ФИО');
  }

  // Day header row (next after header)
  const dayHeaderRow = worksheet.getRow(headerRowIdx + 2);
  const dayCols: Array<{ col: number; day: number }> = [];

  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = dayHeaderRow.getCell(j);
    const value = String(cell.value || '').trim();
    if (/^\d+$/.test(value)) {
      const day = parseInt(value);
      if (day >= 1 && day <= 31) {
        dayCols.push({ col: j, day });
      }
    }
  }

  // Find "өтелген күндер жиынтығы" column
  let totalDaysCol: number | null = null;
  for (let i = Math.max(0, headerRowIdx - 2); i < headerRowIdx + 5 && i < worksheet.rowCount; i++) {
    const row = worksheet.getRow(i + 1);
    for (let j = 1; j <= worksheet.columnCount; j++) {
      const cell = row.getCell(j);
      const value = String(cell.value || '').toLowerCase().trim();
      if (value.includes('өтелген') && value.includes('жиынтығы')) {
        totalDaysCol = j;
        break;
      }
    }
    if (totalDaysCol !== null) break;
  }

  const employees: ParsedEmployee[] = [];

  // Process employee rows
  for (let i = headerRowIdx + 2; i < worksheet.rowCount; i++) {
    const row = worksheet.getRow(i + 1);
    const fioCell = row.getCell(fioCol);
    const fioRaw = fioCell.value;

    if (!fioRaw || String(fioRaw).trim() === '' || String(fioRaw).trim() === 'АТЫ-жөні (толығымен)') {
      continue;
    }

    const fio = String(fioRaw).trim();
    if (!fio) continue;

    const emp: ParsedEmployee = {
      fio,
      letters_weekday: 0,
      letters_sat: 0,
      letters_sun: 0,
      letters_holiday: 0,
      numbers_weekday: 0,
      numbers_sat: 0,
      numbers_sun: 0,
      numbers_holiday: 0,
    };

    // Process day columns
    for (const { col, day } of dayCols) {
      const cell = row.getCell(col);
      const val = cell.value;
      if (val === null || val === undefined) continue;

      const valStr = String(val).trim();
      if (!valStr || valStr === '-' || valStr.toUpperCase() === 'В') continue;

      const dayType = classifyDay(year, month, day, holidayDays);
      const num = tryFloat(valStr);
      const isNumber = num !== null;

      if (isNumber) {
        if (dayType === 'weekday') emp.numbers_weekday++;
        else if (dayType === 'sat') emp.numbers_sat++;
        else if (dayType === 'sun') emp.numbers_sun++;
        else emp.numbers_holiday++;
      } else {
        if (dayType === 'weekday') emp.letters_weekday++;
        else if (dayType === 'sat') emp.letters_sat++;
        else if (dayType === 'sun') emp.letters_sun++;
        else emp.letters_holiday++;
      }
    }

    // Get workedDaysTotal if column exists
    if (totalDaysCol !== null) {
      const totalCell = row.getCell(totalDaysCol);
      const total = tryFloat(totalCell.value);
      if (total !== null) {
        emp.workedDaysTotal = total;
      }
    }

    employees.push(emp);
  }

  return employees;
}

function parseSimpleTemplate(
  worksheet: ExcelJS.Worksheet,
  year: number,
  month: number,
  holidayDays: Set<number>
): ParsedEmployee[] {
  const headerRow = worksheet.getRow(1);
  let employeeCol: number | null = null;
  const dayCols: Array<{ col: number; day: number }> = [];

  // Find columns
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = headerRow.getCell(j);
    const header = String(cell.value || '').trim();

    if (header === 'Сотрудник') {
      employeeCol = j;
    } else if (header.length === 2 && /^\d{2}$/.test(header)) {
      const day = parseInt(header);
      if (day >= 1 && day <= 31) {
        dayCols.push({ col: j, day });
      }
    }
  }

  if (!employeeCol) {
    throw new Error('Не найдена колонка "Сотрудник"');
  }

  const employees: ParsedEmployee[] = [];

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const fioCell = row.getCell(employeeCol);
    const fio = String(fioCell.value || '').trim();

    if (!fio) continue;

    const emp: ParsedEmployee = {
      fio,
      letters_weekday: 0,
      letters_sat: 0,
      letters_sun: 0,
      letters_holiday: 0,
      numbers_weekday: 0,
      numbers_sat: 0,
      numbers_sun: 0,
      numbers_holiday: 0,
    };

    for (const { col, day } of dayCols) {
      const cell = row.getCell(col);
      const val = cell.value;
      if (val === null || val === undefined) continue;

      const valStr = String(val).trim();
      if (!valStr || valStr === '-' || valStr.toUpperCase() === 'В') continue;

      const dayType = classifyDay(year, month, day, holidayDays);
      const num = tryFloat(valStr);
      const isNumber = num !== null;

      if (isNumber) {
        if (dayType === 'weekday') emp.numbers_weekday++;
        else if (dayType === 'sat') emp.numbers_sat++;
        else if (dayType === 'sun') emp.numbers_sun++;
        else emp.numbers_holiday++;
      } else {
        if (dayType === 'weekday') emp.letters_weekday++;
        else if (dayType === 'sat') emp.letters_sat++;
        else if (dayType === 'sun') emp.letters_sun++;
        else emp.letters_holiday++;
      }
    }

    employees.push(emp);
  }

  return employees;
}