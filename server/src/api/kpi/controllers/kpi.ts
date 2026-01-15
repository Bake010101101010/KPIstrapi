import type { Context } from 'koa';

declare const strapi: any;

function getUserLogin(ctx: Context): string {
  const user = (ctx.state as any)?.user;
  if (!user) {
    return 'system';
  }
  // users-permissions user has username / email / id; adapt as needed
  return (user.username as string) || (user.email as string) || `user-${user.id}`;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) {
    return null;
  }
  return n;
}

export default {
  // GET /api/kpi-list
  async list(ctx: Context) {
    const employees = await strapi.entityService.findMany('api::employee.employee', {
      pagination: { pageSize: 10000 },
    });

    const items = (employees || []).map((e: any) => ({
      id: e.id,
      fio: e.fio,
      kpiSum: e.kpiSum,
      scheduleType: e.scheduleType,
      department: e.department,
      categoryCode: e.categoryCode,
    }));

    ctx.body = { items };
  },

  // POST /api/kpi-add
  async add(ctx: Context) {
    try {
      const body: any = ctx.request.body || {};
      console.log('📥 Получен запрос на добавление сотрудника:', JSON.stringify(body, null, 2));
      
      const fio = String(body.fio || '').trim();
      if (!fio) {
        ctx.throw(400, 'Укажите ФИО как в удостоверении личности или в 1С');
      }

      const kpiSum = parseNumber(body.kpiSum);
      if (kpiSum === null) {
        ctx.throw(400, 'kpiSum должен быть числом');
      }
      if (kpiSum <= 0) {
        ctx.throw(400, 'Укажите KPI сумм (тенге)');
      }

      const scheduleTypeRaw = String(body.scheduleType || '').trim() || 'day';
      // Нормализуем scheduleType: приводим к нижнему регистру и проверяем валидность
      const scheduleType = (scheduleTypeRaw.toLowerCase() === 'shift' ? 'shift' : 'day');
      const department = String(body.department || '').trim();
      // categoryCode может быть пустой строкой - преобразуем в null
      const categoryCodeRaw = String(body.categoryCode || '').trim();
      const categoryCode = categoryCodeRaw || null;

      if (!department) {
        ctx.throw(400, 'Укажите отделение');
      }

      console.log('✅ Валидация пройдена. Данные:', { fio, kpiSum, scheduleType, department, categoryCode });

      const existing = await strapi.entityService.findMany('api::employee.employee', {
        filters: {
          fio: {
            $eqi: fio,
          },
        },
      });

      if ((existing || []).length > 0) {
        ctx.throw(400, 'Сотрудник с таким ФИО уже существует.');
      }

      console.log('📝 Создаю сотрудника...');
      const employeeData: any = {
        fio,
        kpiSum: Number(kpiSum), // Явно преобразуем в число
        scheduleType,
        department,
      };
      
      // Добавляем categoryCode только если он не пустой
      if (categoryCode) {
        employeeData.categoryCode = categoryCode;
      }
      
      console.log('📦 Данные для создания:', JSON.stringify(employeeData, null, 2));
      
      const created = await strapi.entityService.create('api::employee.employee', {
        data: employeeData,
      });
      console.log('✅ Сотрудник создан:', created.id);

      // Создаём запись в логе (если не получится - не критично)
      try {
        await strapi.entityService.create('api::log-entry.log-entry', {
          data: {
            type: 'added',
            user: getUserLogin(ctx),
            employeeId: created.id,
            newData: {
              id: created.id,
              fio: created.fio,
              kpiSum: created.kpiSum,
              scheduleType: created.scheduleType,
              department: created.department,
              categoryCode: created.categoryCode,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (logErr: any) {
        // Логируем ошибку, но не прерываем создание сотрудника
        console.error('Ошибка создания записи в логе:', logErr);
      }

      ctx.body = { item: created, message: 'Сотрудник успешно добавлен' };
    } catch (err: any) {
      console.error('❌ Ошибка при добавлении сотрудника:', err);
      console.error('Stack:', err?.stack);
      ctx.status = err.status || 500;
      const errorMessage = err?.message || err?.error?.message || String(err) || 'Ошибка сохранения сотрудника';
      ctx.body = { error: errorMessage };
    }
  },

  // POST /api/kpi-edit
  async edit(ctx: Context) {
    try {
      const body: any = ctx.request.body || {};

      const idRaw = body.id;
      const empId = parseInt(String(idRaw), 10);
      if (!empId || Number.isNaN(empId)) {
        ctx.throw(400, 'id обязателен и должен быть числом');
      }

      const existing = await strapi.entityService.findOne('api::employee.employee', empId);
      if (!existing) {
        ctx.throw(400, 'Сотрудник с таким id не найден.');
      }

      const updates: any = {};

      if (body.fio !== undefined) {
        const fio = String(body.fio || '').trim();
        if (!fio) {
          ctx.throw(400, 'ФИО не может быть пустым');
        }
        updates.fio = fio;
      }

      if (body.department !== undefined) {
        const department = String(body.department || '').trim();
        if (!department) {
          ctx.throw(400, 'Отделение не может быть пустым');
        }
        updates.department = department;
      }

      if (body.scheduleType !== undefined) {
        updates.scheduleType = String(body.scheduleType || '').trim();
      }

      if (body.categoryCode !== undefined) {
        updates.categoryCode = String(body.categoryCode || '').trim();
      }

      if (body.kpiSum !== undefined) {
        const kpiSum = parseNumber(body.kpiSum);
        if (kpiSum === null) {
          ctx.throw(400, 'kpiSum должен быть числом');
        }
        updates.kpiSum = kpiSum;
      }

      const updated = await strapi.entityService.update('api::employee.employee', empId, {
        data: updates,
      });

      // Создаём запись в логе (если не получится - не критично)
      try {
        await strapi.entityService.create('api::log-entry.log-entry', {
          data: {
            type: 'edited',
            user: getUserLogin(ctx),
            employeeId: empId,
            oldData: {
              id: existing.id,
              fio: existing.fio,
              kpiSum: existing.kpiSum,
              scheduleType: existing.scheduleType,
              department: existing.department,
              categoryCode: existing.categoryCode,
            },
            newData: {
              id: updated.id,
              fio: updated.fio,
              kpiSum: updated.kpiSum,
              scheduleType: updated.scheduleType,
              department: updated.department,
              categoryCode: updated.categoryCode,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (logErr: any) {
        console.error('Ошибка создания записи в логе:', logErr);
      }

      ctx.body = { item: updated, message: 'Данные сотрудника успешно обновлены' };
    } catch (err: any) {
      ctx.status = err.status || 400;
      ctx.body = { error: err.message || 'Ошибка сохранения сотрудника' };
    }
  },

  // POST /api/kpi-delete
  async remove(ctx: Context) {
    try {
      const body: any = ctx.request.body || {};
      const idRaw = body.id;
      const empId = parseInt(String(idRaw), 10);
      if (!empId || Number.isNaN(empId)) {
        ctx.throw(400, 'id обязателен и должен быть числом');
      }

      const existing = await strapi.entityService.findOne('api::employee.employee', empId);
      if (!existing) {
        ctx.throw(400, 'Сотрудник с таким id не найден.');
      }

      const reason = String(body.reason || '').trim() || 'не указано';

      await strapi.entityService.delete('api::employee.employee', empId);

      // Создаём запись в логе (если не получится - не критично)
      try {
        await strapi.entityService.create('api::log-entry.log-entry', {
          data: {
            type: 'deleted',
            user: getUserLogin(ctx),
            employeeId: existing.id,
            oldData: {
              id: existing.id,
              fio: existing.fio,
              kpiSum: existing.kpiSum,
              scheduleType: existing.scheduleType,
              department: existing.department,
              categoryCode: existing.categoryCode,
            },
            reason,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (logErr: any) {
        console.error('Ошибка создания записи в логе:', logErr);
      }

      ctx.body = {
        item: {
          id: existing.id,
          fio: existing.fio,
          kpiSum: existing.kpiSum,
          scheduleType: existing.scheduleType,
          department: existing.department,
          categoryCode: existing.categoryCode,
        },
        message: 'Сотрудник успешно удалён',
      };
    } catch (err: any) {
      ctx.status = err.status || 400;
      ctx.body = { error: err.message || 'Ошибка удаления сотрудника' };
    }
  },

  // GET /api/kpi-deleted-log
  async deletedLog(ctx: Context) {
    try {
      const logs = await strapi.entityService.findMany('api::log-entry.log-entry', {
        filters: { type: 'deleted' },
        sort: ['timestamp:desc'],
        pagination: { pageSize: 1000 },
      });

      const items = (logs || []).map((l: any) => ({
        timestamp: l.timestamp,
        user: l.user,
        fio: l.oldData?.fio,
        kpiSum: l.oldData?.kpiSum,
        scheduleType: l.oldData?.scheduleType,
        department: l.oldData?.department,
        categoryCode: l.oldData?.categoryCode,
        reason: l.reason,
      }));

      ctx.body = { items };
    } catch (err: any) {
      console.error('❌ Ошибка при получении лога удалённых:', err);
      ctx.status = err.status || 500;
      ctx.body = { error: err?.message || 'Ошибка получения лога удалённых' };
    }
  },

  // GET /api/kpi-edited-log
  async editedLog(ctx: Context) {
    try {
      const logs = await strapi.entityService.findMany('api::log-entry.log-entry', {
        filters: { type: 'edited' },
        sort: ['timestamp:desc'],
        pagination: { pageSize: 1000 },
      });

      const items = (logs || []).map((l: any) => ({
        timestamp: l.timestamp,
        user: l.user,
        fio_old: l.oldData?.fio,
        department_old: l.oldData?.department,
        scheduleType_old: l.oldData?.scheduleType,
        categoryCode_old: l.oldData?.categoryCode,
        kpiSum_old: l.oldData?.kpiSum,
        fio_new: l.newData?.fio,
        department_new: l.newData?.department,
        scheduleType_new: l.newData?.scheduleType,
        categoryCode_new: l.newData?.categoryCode,
        kpiSum_new: l.newData?.kpiSum,
      }));

      ctx.body = { items };
    } catch (err: any) {
      console.error('❌ Ошибка при получении лога изменённых:', err);
      ctx.status = err.status || 500;
      ctx.body = { error: err?.message || 'Ошибка получения лога изменённых' };
    }
  },

  // GET /api/kpi-restored-log
  async restoredLog(ctx: Context) {
    try {
      const logs = await strapi.entityService.findMany('api::log-entry.log-entry', {
        filters: { type: 'restored' },
        sort: ['timestamp:desc'],
        pagination: { pageSize: 1000 },
      });

      const items = (logs || []).map((l: any) => ({
        timestamp: l.timestamp,
        user: l.user,
        fio: l.newData?.fio,
        kpiSum: l.newData?.kpiSum,
        scheduleType: l.newData?.scheduleType,
        department: l.newData?.department,
        categoryCode: l.newData?.categoryCode,
        deleted_timestamp: l.oldData?.timestamp,
        deleted_by: l.oldData?.user,
        deleted_reason: l.oldData?.reason,
      }));

      ctx.body = { items };
    } catch (err: any) {
      console.error('❌ Ошибка при получении лога восстановленных:', err);
      ctx.status = err.status || 500;
      ctx.body = { error: err?.message || 'Ошибка получения лога восстановленных' };
    }
  },

  // POST /api/kpi-restore
  async restore(ctx: Context) {
    try {
      const body: any = ctx.request.body || {};

      const fio = String(body.fio || '').trim();
      if (!fio) {
        ctx.throw(400, 'ФИО обязательно');
      }

      const kpiSum = parseNumber(body.kpiSum);
      if (kpiSum === null) {
        ctx.throw(400, 'kpiSum должен быть числом');
      }

      const scheduleType = String(body.scheduleType || '').trim() || 'day';
      const department = String(body.department || '').trim();
      const categoryCode = String(body.categoryCode || '').trim();

      if (!department) {
        ctx.throw(400, 'Укажите отделение');
      }

      const created = await strapi.entityService.create('api::employee.employee', {
        data: {
          fio,
          kpiSum,
          scheduleType,
          department,
          categoryCode,
        },
      });

      const sourceDeleted = {
        timestamp: body.deleted_timestamp || null,
        user: body.deleted_by || null,
        reason: body.deleted_reason || null,
      };

      // Создаём запись в логе (если не получится - не критично)
      try {
        await strapi.entityService.create('api::log-entry.log-entry', {
          data: {
            type: 'restored',
            user: getUserLogin(ctx),
            employeeId: created.id,
            oldData: sourceDeleted,
            newData: {
              id: created.id,
              fio: created.fio,
              kpiSum: created.kpiSum,
              scheduleType: created.scheduleType,
              department: created.department,
              categoryCode: created.categoryCode,
            },
            reason: sourceDeleted.reason,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (logErr: any) {
        console.error('Ошибка создания записи в логе:', logErr);
      }

      ctx.body = { item: created, message: 'Сотрудник успешно восстановлен' };
    } catch (err: any) {
      ctx.status = err.status || 400;
      ctx.body = { error: err.message || 'Ошибка восстановления сотрудника' };
    }
  },
};

