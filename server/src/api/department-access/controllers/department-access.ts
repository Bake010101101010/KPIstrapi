import type { Context } from 'koa';
import { getUserAccess } from '../../../utils/access';

declare const strapi: any;

function normalizeDepartments(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((d) => String(d || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,;]+/)
      .map((d) => d.trim())
      .filter(Boolean);
  }
  return [];
}

export default {
  // GET /api/department-access/users
  async listUsers(ctx: Context) {
    const access = await getUserAccess(ctx);
    if (!access.isAdmin) {
      ctx.throw(403, 'Нет доступа');
    }

    const reqUser = (ctx.state as any)?.user || {};
    console.log('[DEPT_ACCESS] listUsers by', {
      id: reqUser.id,
      username: reqUser.username,
      email: reqUser.email,
      role: access.roleName,
      isAdmin: access.isAdmin,
    });

    const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
      populate: ['role'],
      fields: ['id', 'username', 'email', 'allowedDepartments'],
      pagination: { pageSize: 1000 },
    });

    const items = (users || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role?.name || u.role?.type || '',
      allowedDepartments: Array.isArray(u.allowedDepartments) ? u.allowedDepartments : [],
    }));

    console.log('[DEPT_ACCESS] users fetched', {
      count: items.length,
      sample: items.slice(0, 5),
    });

    ctx.body = { items };
  },

  // POST /api/department-access/update
  async updateUser(ctx: Context) {
    const access = await getUserAccess(ctx);
    if (!access.isAdmin) {
      ctx.throw(403, 'Нет доступа');
    }

    const body: any = ctx.request.body || {};
    const idRaw = body.userId || body.id;
    const userId = parseInt(String(idRaw), 10);
    if (!userId || Number.isNaN(userId)) {
      ctx.throw(400, 'userId обязателен');
    }

    const departments = normalizeDepartments(
      body.departments !== undefined ? body.departments : body.allowedDepartments
    );

    const updated = await strapi.entityService.update(
      'plugin::users-permissions.user',
      userId,
      {
        data: {
          allowedDepartments: departments,
        },
      }
    );

    ctx.body = {
      item: {
        id: updated.id,
        allowedDepartments: updated.allowedDepartments || [],
      },
    };
  },
};
