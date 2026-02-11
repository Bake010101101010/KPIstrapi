/**
 * Bulk-import employees from a TSV file directly through Strapi entityService.
 *
 * Usage:
 *   node scripts/import-employees-tsv.js
 *   node scripts/import-employees-tsv.js .\scripts\radiology.tsv
 *   node scripts/import-employees-tsv.js .\scripts\radiology.tsv --department "Лучевая"
 */

const fs = require('fs');
const path = require('path');

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeFioKey(value) {
  return normalizeSpaces(value).toLowerCase();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let filePath = path.join(__dirname, 'radiology.tsv');
  let forcedDepartment = '';
  let upsert = false;

  const deptFlagIndex = args.indexOf('--department');
  if (deptFlagIndex !== -1 && args[deptFlagIndex + 1]) {
    forcedDepartment = normalizeSpaces(args[deptFlagIndex + 1]);
    args.splice(deptFlagIndex, 2);
  }

  if (args.includes('--upsert')) {
    upsert = true;
    const idx = args.indexOf('--upsert');
    args.splice(idx, 1);
  }

  if (args[0]) {
    filePath = path.resolve(process.cwd(), args[0]);
  }

  return { filePath, forcedDepartment, upsert };
}

function parseRows(rawText, forcedDepartment) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  const parsed = [];
  for (const line of lines) {
    const parts = line.split('\t').map((part) => part.trim());
    if (parts.length < 4) {
      continue;
    }

    // Optional first column: running index
    if (/^\d+$/.test(parts[0])) {
      parts.shift();
    }

    const fio = normalizeSpaces(parts[0]);
    const kpiRaw = String(parts[1] || '').replace(',', '.');
    const scheduleRaw = normalizeSpaces(parts[2]).toLowerCase();
    const categoryRaw = normalizeSpaces(parts[3] || '');
    const departmentRaw = normalizeSpaces(parts[4] || '');

    if (!fio) {
      continue;
    }

    const kpiSum = Number(kpiRaw);
    if (!Number.isFinite(kpiSum) || kpiSum <= 0) {
      continue;
    }

    const scheduleType = scheduleRaw === 'shift' ? 'shift' : 'day';
    const department = normalizeSpaces(forcedDepartment || departmentRaw);
    if (!department) {
      continue;
    }

    parsed.push({
      fio,
      kpiSum,
      scheduleType,
      department,
      categoryCode: categoryRaw || null,
    });
  }

  return parsed;
}

async function main() {
  const { filePath, forcedDepartment, upsert } = parseArgs(process.argv);
  if (!fs.existsSync(filePath)) {
    throw new Error(`TSV file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseRows(raw, forcedDepartment);
  if (rows.length === 0) {
    throw new Error('No valid rows found in TSV.');
  }

  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  try {
    const existing = await strapi.entityService.findMany('api::employee.employee', {
      fields: ['id', 'fio'],
      pagination: { pageSize: 10000 },
    });

    const existingByFio = new Map();
    for (const item of existing || []) {
      const key = normalizeFioKey(item?.fio);
      if (key) {
        existingByFio.set(key, item.id);
      }
    }

    const seenInBatch = new Set();
    const created = [];
    const updated = [];
    const skippedExists = [];
    const skippedDuplicates = [];
    const failed = [];

    for (const row of rows) {
      const key = normalizeFioKey(row.fio);
      if (!key) {
        continue;
      }

      if (seenInBatch.has(key)) {
        skippedDuplicates.push(row.fio);
        continue;
      }
      seenInBatch.add(key);

      if (existingByFio.has(key)) {
        if (upsert) {
          const id = existingByFio.get(key);
          const data = {
            fio: row.fio,
            kpiSum: row.kpiSum,
            scheduleType: row.scheduleType,
            department: row.department,
          };
          if (row.categoryCode) {
            data.categoryCode = row.categoryCode;
          }

          try {
            await strapi.entityService.update('api::employee.employee', id, { data });
            updated.push({ id, fio: row.fio });
          } catch (error) {
            failed.push({
              fio: row.fio,
              error: error?.message || String(error),
            });
          }
        } else {
          skippedExists.push(row.fio);
        }
        continue;
      }

      const data = {
        fio: row.fio,
        kpiSum: row.kpiSum,
        scheduleType: row.scheduleType,
        department: row.department,
      };
      if (row.categoryCode) {
        data.categoryCode = row.categoryCode;
      }

      try {
        const inserted = await strapi.entityService.create('api::employee.employee', { data });
        created.push({ id: inserted.id, fio: row.fio });
        existingByFio.set(key, inserted.id);
      } catch (error) {
        failed.push({
          fio: row.fio,
          error: error?.message || String(error),
        });
      }
    }

    console.log('Import finished');
    console.log(`Input rows: ${rows.length}`);
    console.log(`Created: ${created.length}`);
    console.log(`Updated: ${updated.length}`);
    console.log(`Skipped (already exists): ${skippedExists.length}`);
    console.log(`Skipped (duplicates in file): ${skippedDuplicates.length}`);
    console.log(`Failed: ${failed.length}`);

    if (created.length > 0) {
      console.log('Created sample:', created.slice(0, 10));
    }
    if (updated.length > 0) {
      console.log('Updated sample:', updated.slice(0, 10));
    }
    if (failed.length > 0) {
      console.log('Failures:', failed);
    }
  } finally {
    await app.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
