import type { Context } from 'koa';

declare const strapi: any;

type UserAccess = {
  isAdmin: boolean;
  roleName: string;
  allowedDepartments: string[];
  userId?: number;
};

const ADMIN_ROLE_HINTS = ['admin', 'administrator', 'super admin', 'superadmin'];

function normalizeDepartments(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((d) => String(d || '').trim())
    .filter((d) => d.length > 0);
}

function isAdminRole(roleName: string): boolean {
  const lowered = String(roleName || '').toLowerCase();
  if (!lowered) return false;
  return ADMIN_ROLE_HINTS.some((hint) => lowered === hint || lowered.includes(hint));
}

function isAdminLogin(user: any): boolean {
  const username = String(user?.username || '').toLowerCase();
  const email = String(user?.email || '').toLowerCase();
  return (
    username === 'admin-nnmc' ||
    username.startsWith('admin') ||
    email.startsWith('admin@') ||
    email.includes('.admin@')
  );
}

export async function getUserAccess(ctx: Context): Promise<UserAccess> {
  const user = (ctx.state as any)?.user;
  if (!user) {
    return { isAdmin: false, roleName: '', allowedDepartments: [] };
  }

  let roleName = '';
  let allowedDepartments: string[] | null = null;

  if (user.role && typeof user.role === 'object') {
    roleName = String(user.role.name || user.role.type || '');
  }

  if (Array.isArray(user.allowedDepartments)) {
    allowedDepartments = normalizeDepartments(user.allowedDepartments);
  }

  if (!roleName || allowedDepartments === null) {
    const fullUser = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['role'] }
    );

    if (!roleName) {
      roleName = String(fullUser?.role?.name || fullUser?.role?.type || '');
    }

    if (allowedDepartments === null) {
      allowedDepartments = normalizeDepartments(fullUser?.allowedDepartments);
    }
  }

  const normalized = allowedDepartments || [];

  return {
    isAdmin: isAdminRole(roleName) || isAdminLogin(user),
    roleName,
    allowedDepartments: normalized,
    userId: user.id,
  };
}
