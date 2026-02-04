import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import type { Context } from 'koa';
import { parseTimesheet } from '../services/timesheet-parser';
import * as kpiCalculator from '../services/kpi-calculator';
import { getUserAccess } from '../../../utils/access';

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

function getBodyField(body: any, key: string): any {
  if (!body) return undefined;

  if (body[key] !== undefined) {
    const val = body[key];
    return Array.isArray(val) ? val[0] : val;
  }

  const data = body.data;
  if (data !== undefined && data !== null) {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed && parsed[key] !== undefined) {
          const val = parsed[key];
          return Array.isArray(val) ? val[0] : val;
        }
      } catch {
        // ignore parse errors
      }
    } else if (typeof data === 'object' && data[key] !== undefined) {
      const val = data[key];
      return Array.isArray(val) ? val[0] : val;
    }
  }

  const fields = body.fields;
  if (fields && typeof fields === 'object' && fields[key] !== undefined) {
    const val = fields[key];
    return Array.isArray(val) ? val[0] : val;
  }

  return undefined;
}

function getRequestField(ctx: Context, key: string): any {
  const body: any = (ctx.request as any).body || {};
  const fromBody = getBodyField(body, key);
  if (fromBody !== undefined && String(fromBody).trim() !== '') {
    return fromBody;
  }

  const queryValue: any =
    (ctx.request as any).query?.[key] ?? (ctx as any).query?.[key];
  if (queryValue !== undefined) {
    return Array.isArray(queryValue) ? queryValue[0] : queryValue;
  }

  const headerKey = `x-kpi-${key}`.toLowerCase();
  const headerValue = (ctx.request as any).headers?.[headerKey];
  if (headerValue !== undefined) {
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  return undefined;
}

function normalizeDepartment(value: any): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-–—_]+/g, '');
}

async function calcCore(ctx: Context) {
  const body: any = (ctx.request as any).body || {};
  const access = await getUserAccess(ctx);
  const requestedDepartment = String(getRequestField(ctx, 'department') || '').trim();
  const allowedDepartments = access.allowedDepartments || [];
  const normalizedAllowed = allowedDepartments.map(normalizeDepartment).filter(Boolean);
  const debugEnabled = String(getRequestField(ctx, 'debug') || '').trim() === '1';
  const debug: any = debugEnabled
    ? {
        serverTime: new Date().toISOString(),
        rawBodyKeys: Object.keys(body || {}),
        bodyDepartment: body?.department,
        bodyDataType: typeof body?.data,
        bodyFieldsKeys: body?.fields ? Object.keys(body.fields) : [],
        requestedDepartment,
        allowedDepartments,
        normalizedAllowed,
      }
    : null;
  const withDebug = (payload: any) => (debug ? { ...payload, debug } : payload);
  console.log('KPI_CALC_DEBUG rawBodyKeys:', Object.keys(body || {}));
  if (body && typeof body === 'object') {
    console.log('KPI_CALC_DEBUG body.department:', body.department);
    console.log('KPI_CALC_DEBUG body.data:', body.data);
    console.log('KPI_CALC_DEBUG body.fields:', body.fields);
  }
  console.log('KPI_CALC_DEBUG requestedDepartment:', requestedDepartment);
  console.log('KPI_CALC_DEBUG allowedDepartments:', allowedDepartments);

  if (!access.isAdmin) {
    if (normalizedAllowed.length === 0) {
      ctx.throw(403, 'Нет доступных отделов');
    }
    if (!requestedDepartment) {
      ctx.throw(400, 'Отдел для расчёта не указан');
    }
    if (requestedDepartment) {
      const requestedNorm = normalizeDepartment(requestedDepartment);
      if (!normalizedAllowed.includes(requestedNorm)) {
        ctx.throw(403, 'Нет доступа к указанному отделу');
      }
    }
  }

  const nchDay = parseInt(getRequestField(ctx, 'nchDay') || '0', 10) || 0;
  const ndShift = parseInt(getRequestField(ctx, 'ndShift') || '0', 10) || 0;

  if (nchDay <= 0 && ndShift <= 0) {
    throw new Error('Нужно указать Н.ч для дневных и/или Н.д для суточных');
  }

  const year = parseInt(getRequestField(ctx, 'year') || '0', 10);
  const month = parseInt(getRequestField(ctx, 'month') || '0', 10);

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
  const formHolidays = parseHolidays(getRequestField(ctx, 'holidays'));
  const allHolidays = [...new Set([...strapiHolidayDates, ...formHolidays])];
  
  console.log(`📅 Всего праздников для расчёта:`, allHolidays);

  const fileBuffer = await getFileBufferFromCtx(ctx);

  const parsedEmployees = await parseTimesheet(fileBuffer, year, month, allHolidays);
  const parsedDeptSamples = parsedEmployees
    .map((e: any) => String(e?.department || '').trim())
    .filter(Boolean);
  console.log('KPI_CALC_DEBUG timesheetDeptSample:', Array.from(new Set(parsedDeptSamples)).slice(0, 12));
  if (debug) {
    debug.timesheetDeptSample = Array.from(new Set(parsedDeptSamples)).slice(0, 12);
  }

  let employees = parsedEmployees;


  const kpiFilters: any = {};
  if (!access.isAdmin && allowedDepartments.length > 0) {
    kpiFilters.department = { $in: allowedDepartments };
  }

  const kpiQuery: any = {
    fields: ['id', 'fio', 'kpiSum', 'scheduleType', 'department', 'categoryCode'],
    publicationState: 'live',
    pagination: { pageSize: 10000 },
  };
  if (Object.keys(kpiFilters).length > 0) {
    kpiQuery.filters = kpiFilters;
  }

  const kpiTable = await strapi.entityService.findMany('api::employee.employee', kpiQuery);
  const kpiDeptSamples = (kpiTable || [])
    .map((e: any) => String(e?.department || '').trim())
    .filter(Boolean);
  console.log('KPI_CALC_DEBUG kpiDeptSample:', Array.from(new Set(kpiDeptSamples)).slice(0, 12));
  if (debug) {
    debug.kpiDeptSample = Array.from(new Set(kpiDeptSamples)).slice(0, 12);
  }

  let finalEmployees = employees;
  let finalKpiTable = kpiTable;

  if (requestedDepartment) {
    const target = normalizeDepartment(requestedDepartment);
    finalKpiTable = (kpiTable || []).filter(
      (item: any) => normalizeDepartment(item?.department) === target
    );

    const kpiFioSet = new Set(
      finalKpiTable.map((item: any) => String(item?.fio || '').trim().toLowerCase()).filter(Boolean)
    );

    finalEmployees = employees.filter((emp: any) =>
      kpiFioSet.has(String(emp?.fio || '').trim().toLowerCase())
    );

    if (finalEmployees.length === 0) {
      return withDebug({
        results: [],
        errors: [
          {
            fio: '',
            type: 'NO_EMPLOYEES',
            details: `Нету никого в отделе ${requestedDepartment}`,
          },
        ],
      });
    }
  }

  let { results, errors } = kpiCalculator.calculateKPI(
    finalEmployees,
    finalKpiTable,
    nchDay,
    ndShift
  );

  if (requestedDepartment) {
    const target = normalizeDepartment(requestedDepartment);
    const filteredResults = (results || []).filter(
      (r: any) => normalizeDepartment(r?.department) === target
    );
    if (filteredResults.length === 0) {
      return withDebug({
        results: [],
        errors: [
          {
            fio: '',
            type: 'NO_EMPLOYEES',
            details: `Нету никого в отделе ${requestedDepartment}`,
          },
        ],
      });
    }
    results = filteredResults;
  }

  return withDebug({ results, errors });
}

export default {
  async calculate(ctx: Context) {
    try {
      const payload = await calcCore(ctx);
      ctx.body = payload;
    } catch (error: any) {
      ctx.status = error?.status || 400;
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
      ctx.status = error?.status || 400;
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
      ctx.status = error?.status || 400;
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
      ctx.status = error?.status || 400;
      ctx.body = {
        error: error.message || 'Ошибка формирования файла для бухгалтерии',
      };
    }
  },
};

