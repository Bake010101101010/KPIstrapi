import PDFDocument from 'pdfkit';
import fs from 'fs';

type CommissionMember = {
  role: string;
  name: string;
  order?: number | null;
};

type MeetingDateOverride = {
  year?: number | null;
  month?: number | null;
  date?: string | null;
};

export type ReportSettings = {
  protocolNumber?: string | null;
  meetingTitle?: string | null;
  departmentTitle?: string | null;
  place?: string | null;
  agendaText?: string | null;
  footerText?: string | null;
  commissionMembers?: CommissionMember[] | null;
  secretaryName?: string | null;
  coordinatorRole?: string | null;
  meetingDateOverrides?: MeetingDateOverride[] | null;
};

type ReportInput = {
  results: any[];
  year: number;
  month: number;
  department?: string;
  meetingDate: string;
  settings: ReportSettings;
};

const MONTHS_NOM = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  protocolNumber: '1',
  meetingTitle: 'Заседания комиссии по оплате и мотивации труда персонала',
  departmentTitle: 'Отдел централизованный медицинский клининг-1',
  place: 'г.Астана, пр.Абылай – хана 42',
  agendaText:
    'Рассмотрение итогов работы за {{month}} месяц {{year}} года. Оценка достижения ключевых показателей работы эффективности выполнения внутренних стандартов, санитарно-эпидемиологического режима и трудовой дисциплины, степень достижения КПР каждым сотрудником {{department}}.\n' +
    'Результаты фактического исполнения целевых показателей КПР за {{month}} месяц {{year}} года в соответствии с утверждённым Положением об оплате труда. Младший медицинский персонал {{department}}.',
  footerText:
    'Передать отделу бухгалтерии результаты рассмотрения стимулирующих и мотивирующих компонентов для своевременного начисления.',
  commissionMembers: [
    { role: 'Председатель', name: 'Нурсейтова Т.Б.' },
    { role: 'Координатор ОЦМК', name: 'Кикимбаева Г.Т.' },
    { role: 'Руководитель по сестринскому делу', name: 'Мусабаева А.М' },
    { role: 'Руководитель отдела управления', name: 'Кенжебаева Ш.Т' },
    { role: 'Главный экономист', name: 'Мендыбаева Э.М' },
    { role: 'Главный бухгалтер', name: 'Тасеменова Д.К' },
  ],
  secretaryName: 'Актанова К.Е',
  coordinatorRole: 'Координатор ОЦМК',
};

type FontPair = {
  regular?: string;
  bold?: string;
};

const FONT_CANDIDATES: FontPair[] = [
  {
    regular: process.env.PDF_FONT_PATH,
    bold: process.env.PDF_FONT_BOLD_PATH,
  },
  {
    regular: 'C:\\\\Windows\\\\Fonts\\\\arial.ttf',
    bold: 'C:\\\\Windows\\\\Fonts\\\\arialbd.ttf',
  },
  {
    regular: 'C:\\\\Windows\\\\Fonts\\\\times.ttf',
    bold: 'C:\\\\Windows\\\\Fonts\\\\timesbd.ttf',
  },
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  },
  {
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
  {
    regular: '/System/Library/Fonts/Supplemental/Arial.ttf',
    bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  },
];

function pickFont(): { regular?: string; bold?: string } {
  for (const candidate of FONT_CANDIDATES) {
    const regular = candidate.regular;
    if (regular && fs.existsSync(regular)) {
      const bold = candidate.bold && fs.existsSync(candidate.bold) ? candidate.bold : undefined;
      return { regular, bold };
    }
  }
  return {};
}

export function mergeReportSettings(settings?: ReportSettings | null): ReportSettings {
  return {
    ...DEFAULT_REPORT_SETTINGS,
    ...(settings || {}),
    commissionMembers:
      settings?.commissionMembers && settings.commissionMembers.length > 0
        ? settings.commissionMembers
        : DEFAULT_REPORT_SETTINGS.commissionMembers,
  };
}

function formatDateRu(dateStr: string): string {
  const [y, m, d] = String(dateStr).split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return dateStr;
  const monthName = MONTHS_GEN[m - 1] || '';
  return `${d} ${monthName} ${y} г.`;
}

function formatNumber(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Math.abs(num - Math.round(num)) < 0.00001) {
    return String(Math.round(num));
  }
  return num.toFixed(2);
}

function applyTemplate(text: string, vars: Record<string, string>): string {
  return Object.keys(vars).reduce((acc, key) => {
    return acc.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), vars[key]);
  }, text);
}

function drawKeyValue(
  doc: PDFDocument,
  left: string,
  right: string,
  leftX: number,
  maxRoleWidth: number,
  nameWidth: number,
  opts?: { minRoleWidth?: number; gap?: number }
) {
  const y = doc.y;
  const gap = opts?.gap ?? 6;
  const minRoleWidth = opts?.minRoleWidth ?? 140;
  const roleTextWidth = doc.widthOfString(left) + gap;
  const roleWidth = Math.min(maxRoleWidth, Math.max(minRoleWidth, roleTextWidth));
  const nameX = leftX + roleWidth;
  doc.text(left, leftX, y, { width: roleWidth - gap });
  doc.text(right, nameX, y, { width: nameWidth, align: 'left' });
  doc.moveDown(0.1);
  doc.x = leftX;
}

function drawTable(
  doc: PDFDocument,
  rows: any[],
  opts: { startY: number; fontRegular: string; fontBold: string }
) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - marginLeft - marginRight;

  const colIdx = 28;
  const colPlan = 110;
  const colPercent = 60;
  const colFinal = 80;
  const colFio = contentWidth - colIdx - colPlan - colPercent - colFinal;

  const columns = [
    { key: 'idx', label: '№', width: colIdx, align: 'left' },
    { key: 'fio', label: 'ФИО', width: colFio, align: 'left' },
    { key: 'kpiSum', label: 'КПР общий план (сумма)', width: colPlan, align: 'right' },
    { key: 'workPercent', label: 'КПР %', width: colPercent, align: 'right' },
    { key: 'kpiFinal', label: 'КПР итог', width: colFinal, align: 'right' },
  ];

  let y = opts.startY;
  const headerHeight = 18;

  const drawHeader = () => {
    doc.fontSize(10).font(opts.fontBold);
    let x = marginLeft;
    columns.forEach((col) => {
      doc.text(col.label, x, y, { width: col.width, align: col.align as any });
      x += col.width;
    });
    y += headerHeight;
    doc.moveTo(marginLeft, y - 4).lineTo(pageWidth - marginRight, y - 4).stroke();
    doc.font(opts.fontRegular);
  };

  drawHeader();

  rows.forEach((row, index) => {
    const fioText = String(row?.fio || '').trim();
    const fioHeight = doc.heightOfString(fioText, { width: colFio });
    const rowHeight = Math.max(16, fioHeight + 2);

    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }

    const values: Record<string, string> = {
      idx: String(index + 1),
      fio: fioText,
      kpiSum: formatNumber(row?.kpiSum),
      workPercent: formatNumber(row?.workPercent),
      kpiFinal: formatNumber(row?.kpiFinal),
    };

    let x = marginLeft;
    columns.forEach((col) => {
      doc.text(values[col.key] || '', x, y, { width: col.width, align: col.align as any });
      x += col.width;
    });

    y += rowHeight;
    doc.moveTo(marginLeft, y).lineTo(pageWidth - marginRight, y).strokeColor('#e5e7eb').stroke();
    doc.strokeColor('black');
  });

  return y + 8;
}

function drawBuhTable(
  doc: PDFDocument,
  rows: any[],
  opts: { startY: number; fontRegular: string; fontBold: string }
) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - marginLeft - marginRight;

  const idxWidth = 28;
  const numWidth = 70;
  const percentWidth = 50;
  let fioWidth = contentWidth - idxWidth - numWidth * 2 - percentWidth;
  if (fioWidth < 160) {
    fioWidth = 160;
  }

  const columns = [
    { key: 'idx', label: '№ п/п', width: idxWidth, align: 'center' },
    { key: 'fio', label: 'ФИО', width: fioWidth, align: 'left' },
    { key: 'kpiPlan', label: 'КПР план', width: numWidth, align: 'right' },
    { key: 'kpiPercent', label: 'КПР %', width: percentWidth, align: 'center' },
    { key: 'kpiFinal', label: 'КПР итог', width: numWidth, align: 'right' },
  ];

  const cellPadding = 3;
  const headerFontSize = 8.5;
  const bodyFontSize = 8.5;

  let y = opts.startY;

  const drawHeader = () => {
    doc.fontSize(headerFontSize).font(opts.fontBold);
    let x = marginLeft;
    const headerHeight = 18;
    columns.forEach((col) => {
      doc
        .rect(x, y, col.width, headerHeight)
        .stroke();
      doc.text(col.label, x + cellPadding, y + 4, {
        width: col.width - cellPadding * 2,
        align: col.align as any,
      });
      x += col.width;
    });
    y += headerHeight;
    doc.font(opts.fontRegular).fontSize(bodyFontSize);
  };

  const ensureSpace = (rowHeight: number) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
  };

  drawHeader();

  rows.forEach((row) => {
    const rowValues: Record<string, string> = {
      idx: row?.idx ? String(row.idx) : '',
      fio: String(row?.fio || ''),
      kpiPlan: formatNumber(row?.kpiPlan),
      kpiPercent: formatNumber(row?.kpiPercent),
      kpiFinal: formatNumber(row?.kpiFinal),
    };

    const rowHeight = columns.reduce((maxHeight, col) => {
      const text = rowValues[col.key] || '';
      const height = doc.heightOfString(text, { width: col.width - cellPadding * 2 });
      return Math.max(maxHeight, height + cellPadding * 2);
    }, 16);

    ensureSpace(rowHeight);

    if (row?._isTotal) {
      doc.font(opts.fontBold);
    }

    let x = marginLeft;
    columns.forEach((col) => {
      doc.rect(x, y, col.width, rowHeight).stroke();
      const text = rowValues[col.key] || '';
      doc.text(text, x + cellPadding, y + 2, {
        width: col.width - cellPadding * 2,
        align: col.align as any,
      });
      x += col.width;
    });

    if (row?._isTotal) {
      doc.font(opts.fontRegular);
    }

    y += rowHeight;
  });

  return y + 8;
}

type BuhRow = {
  idx: number | null;
  fio: string;
  kpiPlan: number | null;
  kpiPercent: number | null;
  kpiFinal: number | null;
  _isTotal?: boolean;
};

export async function buildReportPdf(input: ReportInput): Promise<Buffer> {
  const settings = mergeReportSettings(input.settings);
  const monthNom = MONTHS_NOM[input.month - 1] || '';
  const monthGen = MONTHS_GEN[input.month - 1] || '';
  const department = input.department || settings.departmentTitle || '';
  const lastDay = new Date(input.year, input.month, 0).getDate();

  const templateVars = {
    month: monthNom,
    monthGen,
    year: String(input.year),
    department,
  };

  const agendaText = applyTemplate(settings.agendaText || '', templateVars);
  const footerText = applyTemplate(settings.footerText || '', templateVars);

  const font = pickFont();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, left: 50, right: 50, bottom: 50 } });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.margins.right;
    const pageContentWidth = doc.page.width - pageLeft - pageRight;

    let regularFontName = 'Helvetica';
    let boldFontName = 'Helvetica-Bold';

    if (font.regular) {
      doc.registerFont('regular', font.regular);
      regularFontName = 'regular';
      boldFontName = 'regular';
    }
    if (font.bold) {
      doc.registerFont('bold', font.bold);
      boldFontName = 'bold';
    }

    doc.font(boldFontName).fontSize(14).text(`Протокол № ${settings.protocolNumber || '1'}`, { align: 'center' });
    doc.moveDown(0.6);

    doc.font(boldFontName).fontSize(12).text(settings.meetingTitle || DEFAULT_REPORT_SETTINGS.meetingTitle || '');
    if (department) {
      doc.text(department);
    }
    doc.moveDown(0.6);

    doc.font(regularFontName).fontSize(11);
    doc.text(`Дата заседания: ${formatDateRu(input.meetingDate)}`);
    doc.text(`Место проведения: ${settings.place || DEFAULT_REPORT_SETTINGS.place}`);
    doc.moveDown(0.4);

    doc.text(
      `Оцениваемый период: с 1 ${monthGen} ${input.year} года – по ${lastDay} ${monthGen} ${input.year} г.`
    );
    doc.moveDown(0.6);

    doc.font(boldFontName).text('Члены комиссии:');
    doc.moveDown(0.2);
    doc.font(regularFontName);

    const members = (settings.commissionMembers || []).slice().sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : 9999;
      const bo = typeof b.order === 'number' ? b.order : 9999;
      return ao - bo;
    });

    const leftX = pageLeft;
    const maxRoleWidth = Math.min(260, Math.round(pageContentWidth * 0.4));
    const nameWidth = Math.max(200, pageContentWidth - maxRoleWidth);

    members.forEach((member) => {
      if (!member?.role || !member?.name) return;
      drawKeyValue(doc, String(member.role), String(member.name), leftX, maxRoleWidth, nameWidth);
    });

    if (settings.secretaryName) {
      drawKeyValue(
        doc,
        'Секретарь комиссии:',
        String(settings.secretaryName),
        leftX,
        maxRoleWidth,
        nameWidth
      );
    }

    doc.moveDown(0.6);
    doc.font(boldFontName).text('ПОВЕСТКА ДНЯ:');
    doc.moveDown(0.3);
    doc.font(regularFontName).text(agendaText, { align: 'left' });
    doc.moveDown(0.8);

    doc.font(boldFontName).text(`Результаты КПР за ${monthNom} ${input.year} года`);
    doc.moveDown(0.4);

    doc.font(regularFontName);
    let tableEndY = drawTable(doc, input.results || [], {
      startY: doc.y,
      fontRegular: regularFontName,
      fontBold: boldFontName,
    });
    doc.y = tableEndY;

    doc.moveDown(0.6);
    doc.text(footerText);
    doc.moveDown(0.6);
    doc.text('Члены заседания проголосовали');
    doc.text(`ЗА — ${members.length || 0} человек`);
    doc.text('ПРОТИВ — нет');
    doc.text('ВОЗДЕРЖАВШИХСЯ — нет');
    doc.moveDown(0.6);

    doc.text('Члены комиссии:');

    const coordinatorRole = settings.coordinatorRole || DEFAULT_REPORT_SETTINGS.coordinatorRole || '';
    const coordinator = members.find((m) =>
      String(m.role || '').toLowerCase().includes(String(coordinatorRole).toLowerCase())
    );
    if (coordinator) {
      drawKeyValue(doc, coordinatorRole || 'Координатор', String(coordinator.name), leftX, maxRoleWidth, nameWidth);
    }
    if (settings.secretaryName) {
      drawKeyValue(
        doc,
        'Секретарь комиссии',
        String(settings.secretaryName),
        leftX,
        maxRoleWidth,
        nameWidth
      );
    }

    doc.end();
  });
}

export async function buildBuhPdf(input: ReportInput): Promise<Buffer> {
  const settings = mergeReportSettings(input.settings);
  const monthNom = MONTHS_NOM[input.month - 1] || '';
  const monthGen = MONTHS_GEN[input.month - 1] || '';
  const department = input.department || settings.departmentTitle || '';
  const lastDay = new Date(input.year, input.month, 0).getDate();

  const templateVars = {
    month: monthNom,
    monthGen,
    year: String(input.year),
    department,
  };

  const agendaText = applyTemplate(settings.agendaText || '', templateVars);
  const footerText = applyTemplate(settings.footerText || '', templateVars);
  const font = pickFont();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 40, left: 40, right: 40, bottom: 40 },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const contentWidth = doc.page.width - marginLeft - marginRight;
    const pageLeft = marginLeft;
    const pageContentWidth = contentWidth;

    let regularFontName = 'Helvetica';
    let boldFontName = 'Helvetica-Bold';

    if (font.regular) {
      doc.registerFont('regular', font.regular);
      regularFontName = 'regular';
      boldFontName = 'regular';
    }
    if (font.bold) {
      doc.registerFont('bold', font.bold);
      boldFontName = 'bold';
    }

    doc.font(boldFontName).fontSize(13).text(`Протокол № ${settings.protocolNumber || '1'}`, {
      align: 'center',
    });
    doc.moveDown(0.6);

    doc
      .font(boldFontName)
      .fontSize(11)
      .text(settings.meetingTitle || DEFAULT_REPORT_SETTINGS.meetingTitle || '');
    if (department) {
      doc.text(department);
    }
    doc.moveDown(0.5);

    doc.font(regularFontName).fontSize(10);
    doc.text(`Дата заседания: ${formatDateRu(input.meetingDate)} г.`);
    doc.text(`Место проведения: ${settings.place || DEFAULT_REPORT_SETTINGS.place}`);
    doc.moveDown(0.4);
    doc.text(
      `Оцениваемый период: с 1 ${monthGen} ${input.year} года - по ${lastDay} ${monthGen} ${input.year} г.`
    );
    doc.moveDown(0.8);

    doc.font(boldFontName).text('Члены комиссии:');
    doc.font(regularFontName);

    const members = (settings.commissionMembers || []).slice().sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : 9999;
      const bo = typeof b.order === 'number' ? b.order : 9999;
      return ao - bo;
    });

    const leftX = pageLeft;
    const maxRoleWidth = Math.min(260, Math.round(pageContentWidth * 0.4));
    const nameWidth = Math.max(200, pageContentWidth - maxRoleWidth);

    members.forEach((member) => {
      if (!member?.role || !member?.name) return;
      drawKeyValue(doc, String(member.role), String(member.name), leftX, maxRoleWidth, nameWidth);
    });

    if (settings.secretaryName) {
      drawKeyValue(
        doc,
        'Секретарь комиссии:',
        String(settings.secretaryName),
        leftX,
        maxRoleWidth,
        nameWidth
      );
    }

    doc.moveDown(0.6);
    doc.font(boldFontName).text('ПОВЕСТКА ДНЯ:', pageLeft, doc.y, {
      width: pageContentWidth,
    });
    doc.moveDown(0.2);
    doc.font(regularFontName).text(agendaText, pageLeft, doc.y, {
      width: pageContentWidth,
      align: 'left',
    });
    doc.moveDown(0.6);

    const tableRows: BuhRow[] = (input.results || []).map((r, idx) => {
      const kpiSum = Number(r?.kpiSum || 0);
      const workPercent = Number(r?.workPercent || 0);
      const kpiFinal = Number(r?.kpiFinal || 0);

      return {
        idx: idx + 1,
        fio: String(r?.fio || ''),
        kpiPlan: kpiSum,
        kpiPercent: workPercent,
        kpiFinal,
      };
    });

    const totalKpiFinal = tableRows.reduce((sum, row) => sum + Number(row.kpiFinal || 0), 0);
    tableRows.push({
      idx: null,
      fio: 'Итого',
      kpiPlan: null,
      kpiPercent: null,
      kpiFinal: totalKpiFinal,
      _isTotal: true,
    });

    let tableEndY = drawBuhTable(doc, tableRows, {
      startY: doc.y,
      fontRegular: regularFontName,
      fontBold: boldFontName,
    });
    doc.y = tableEndY;

    doc.moveDown(0.6);
    doc.text(footerText, pageLeft, doc.y, { width: pageContentWidth });
    doc.moveDown(0.6);
    doc.text('Члены заседания проголосовали', pageLeft, doc.y, {
      width: pageContentWidth,
    });
    doc.text(`ЗА — ${members.length || 0} человек`, pageLeft, doc.y, {
      width: pageContentWidth,
    });
    doc.text('ПРОТИВ — нет', pageLeft, doc.y, { width: pageContentWidth });
    doc.text('ВОЗДЕРЖАВШИХСЯ — нет', pageLeft, doc.y, { width: pageContentWidth });
    doc.moveDown(0.6);

    doc.text('Члены комиссии:', pageLeft, doc.y, { width: pageContentWidth });

    const coordinatorRole = settings.coordinatorRole || DEFAULT_REPORT_SETTINGS.coordinatorRole || '';
    const coordinator = members.find((m) =>
      String(m.role || '').toLowerCase().includes(String(coordinatorRole).toLowerCase())
    );
    if (coordinator) {
      drawKeyValue(doc, coordinatorRole || 'Координатор', String(coordinator.name), leftX, maxRoleWidth, nameWidth);
    }
    if (settings.secretaryName) {
      drawKeyValue(
        doc,
        'Секретарь комиссии',
        String(settings.secretaryName),
        leftX,
        maxRoleWidth,
        nameWidth
      );
    }

    doc.end();
  });
}
