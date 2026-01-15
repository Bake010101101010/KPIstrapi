import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import type { Context } from 'koa';
import { parseTimesheet } from '../services/timesheet-parser';
import * as kpiCalculator from '../services/kpi-calculator';

declare const strapi: any;

async function getFileBufferFromCtx(ctx: Context): Promise<Buffer> {
  const files: any = (ctx.request as any).files || {};
  let file = files.timesheet;

  if (Array.isArray(file)) {
    file = file[0];
  }

  if (!file) {
    throw new Error('Файл табеля (timesheet) не загружен');
  }

  if (file.buffer) {
    return file.buffer as Buffer;
  }

  const filepath: string | undefined = file.filepath || file.path;
  if (!filepath) {
    throw new Error('Не удалось определить путь к загруженному файлу');
  }

  return fs.readFile(filepath);
}

function parseHolidays(raw: any): (string | number)[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  const s = String(raw).trim();
  if (!s) return [];

  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore JSON errors, fallback below
    }
  }

  return s
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

async function calcCore(ctx: Context) {
  const body: any = (ctx.request as any).body || {};

  const nchDay = parseInt(body.nchDay || '0', 10) || 0;
  const ndShift = parseInt(body.ndShift || '0', 10) || 0;

  if (nchDay <= 0 && ndShift <= 0) {
    throw new Error('Нужно указать Н.ч для дневных и/или Н.д для суточных');
  }

  const year = parseInt(body.year || '0', 10);
  const month = parseInt(body.month || '0', 10);

  if (!year || !month || month < 1 || month > 12) {
    throw new Error('Некорректные значения года или месяца');
  }

  // Загружаем праздники из Strapi для указанного года/месяца
  const strapiHolidays = await strapi.entityService.findMany('api::holiday.holiday', {
    filters: {
      year: { $eq: year },
      month: { $eq: month },
    },
    fields: ['date', 'year', 'month'],
    pagination: { pageSize: 1000 },
  });

  console.log(`📅 Сырые данные праздников из Strapi:`, JSON.stringify(strapiHolidays, null, 2));

  // Преобразуем в массив дат (entityService возвращает объекты напрямую)
  const strapiHolidayDates: string[] = [];
  (strapiHolidays || []).forEach((h: any) => {
    // entityService.findMany возвращает объекты напрямую: { id, date, year, month, ... }
    const dateValue = h.date;
    if (dateValue) {
      strapiHolidayDates.push(String(dateValue));
    }
  });

  console.log(`📅 Загружено праздников из Strapi для ${year}-${month}:`, strapiHolidayDates);

  // Объединяем с праздниками из формы (если есть)
  const formHolidays = parseHolidays(body.holidays);
  const allHolidays = [...new Set([...strapiHolidayDates, ...formHolidays])];
  
  console.log(`📅 Всего праздников для расчёта:`, allHolidays);

  const fileBuffer = await getFileBufferFromCtx(ctx);

  const employees = await parseTimesheet(fileBuffer, year, month, allHolidays);

  const kpiTable = await strapi.entityService.findMany('api::employee.employee', {
    fields: ['id', 'fio', 'kpiSum', 'scheduleType', 'department', 'categoryCode'],
    publicationState: 'live',
    pagination: { pageSize: 10000 },
  });

  const { results, errors } = kpiCalculator.calculateKPI(employees, kpiTable, nchDay, ndShift);

  return { results, errors };
}

export default {
  async calculate(ctx: Context) {
    try {
      const { results, errors } = await calcCore(ctx);
      ctx.body = { results, errors };
    } catch (error: any) {
      ctx.status = 400;
      ctx.body = { error: error.message || 'Ошибка расчёта KPI' };
    }
  },

  async downloadExcel(ctx: Context) {
    try {
      const { results, errors } = await calcCore(ctx);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('KPI');

      worksheet.columns = [
        { header: '#', key: 'idx', width: 5 },
        { header: 'ФИО', key: 'fio', width: 30 },
        { header: 'График', key: 'scheduleType', width: 10 },
        { header: 'Отдел', key: 'department', width: 15 },
        { header: 'Норма дней', key: 'daysAssigned', width: 12 },
        { header: 'Факт дней', key: 'daysWorked', width: 12 },
        { header: '% выполнения', key: 'workPercent', width: 12 },
        { header: 'KPI сумм', key: 'kpiSum', width: 12 },
        { header: 'KPI итог', key: 'kpiFinal', width: 12 },
      ];

      results.forEach((r: any, idx: number) => {
        worksheet.addRow({
          idx: idx + 1,
          fio: r.fio,
          scheduleType: r.scheduleType,
          department: r.department,
          daysAssigned: r.daysAssigned,
          daysWorked: r.daysWorked,
          workPercent: r.workPercent,
          kpiSum: r.kpiSum,
          kpiFinal: r.kpiFinal,
        });
      });

      if (errors && errors.length > 0) {
        const errorSheet = workbook.addWorksheet('Errors');
        errorSheet.columns = [
          { header: '#', key: 'idx', width: 5 },
          { header: 'ФИО', key: 'fio', width: 30 },
          { header: 'Тип', key: 'type', width: 15 },
          { header: 'Описание', key: 'details', width: 50 },
        ];
        errors.forEach((e: any, idx: number) => {
          errorSheet.addRow({
            idx: idx + 1,
            fio: e.fio,
            type: e.type,
            details: e.details,
          });
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();

      ctx.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPIfinal_${Date.now()}.xlsx"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = 400;
      ctx.body = { error: error.message || 'Ошибка формирования файла' };
    }
  },

  async download1C(ctx: Context) {
    try {
      const { results } = await calcCore(ctx);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('1C');

      results.forEach((r: any, idx: number) => {
        const kpiFinalRounded = Math.ceil(r.kpiFinal || 0);
        worksheet.addRow([idx + 1, r.fio, kpiFinalRounded]);
      });

      const buffer = await workbook.xlsx.writeBuffer();

      ctx.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPI_for_1C_${Date.now()}.xlsx"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = 400;
      ctx.body = { error: error.message || 'Ошибка формирования файла для 1С' };
    }
  },

  async downloadBuh(ctx: Context) {
    try {
      const { results } = await calcCore(ctx);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Buh');

      worksheet.columns = [
        { header: 'ФИО', key: 'fio', width: 30 },
        { header: 'KPI_план', key: 'kpiPlan', width: 12 },
        { header: 'KPI_%', key: 'kpiPercent', width: 12 },
        { header: 'KPI_итог', key: 'kpiFinal', width: 12 },
        { header: 'КПР1_план', key: 'kpr1Plan', width: 12 },
        { header: 'КПР1_%', key: 'kpr1Percent', width: 12 },
        { header: 'КПР1_итог', key: 'kpr1Final', width: 12 },
        { header: 'КПР2_план', key: 'kpr2Plan', width: 12 },
        { header: 'КПР2_%', key: 'kpr2Percent', width: 12 },
        { header: 'КПР2_итог', key: 'kpr2Final', width: 12 },
      ];

      results.forEach((r: any) => {
        const half = (r.kpiSum || 0) / 2.0;
        const kpr1Final = Math.round(((half * (r.workPercent || 0)) / 100) * 100) / 100;
        const kpr2Final = Math.round(((half * (r.workPercent || 0)) / 100) * 100) / 100;

        worksheet.addRow({
          fio: r.fio,
          kpiPlan: r.kpiSum,
          kpiPercent: r.workPercent,
          kpiFinal: r.kpiFinal,
          kpr1Plan: half,
          kpr1Percent: r.workPercent,
          kpr1Final,
          kpr2Plan: half,
          kpr2Percent: r.workPercent,
          kpr2Final,
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();

      ctx.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPI_for_Buh_${Date.now()}.xlsx"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = 400;
      ctx.body = {
        error: error.message || 'Ошибка формирования файла для бухгалтерии',
      };
    }
  },
};

