/**
 * holiday controller
 */

import { factories } from '@strapi/strapi';
import type { Context } from 'koa';

export default factories.createCoreController('api::holiday.holiday', ({ strapi }) => ({
  async create(ctx: Context) {
    const body = ctx.request.body?.data || {};
    
    if (!body.date) {
      ctx.status = 400;
      ctx.body = { error: { message: 'Дата обязательна' } };
      return;
    }

    // Если дата указана, но год/месяц нет - вычисляем их из даты
    if (!body.year || !body.month) {
      const dateObj = new Date(body.date);
      if (!isNaN(dateObj.getTime())) {
        body.year = body.year || dateObj.getFullYear();
        body.month = body.month || (dateObj.getMonth() + 1);
      }
    }

    // Проверяем на дубликаты: ищем существующие праздники с такой же датой в этом году/месяце
    const existing = await strapi.entityService.findMany('api::holiday.holiday', {
      filters: {
        date: { $eq: body.date },
        year: { $eq: body.year },
        month: { $eq: body.month },
      },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      ctx.status = 400;
      ctx.body = { 
        error: { 
          message: `Праздник на дату ${body.date} уже существует в этом месяце` 
        } 
      };
      return;
    }
    
    // Вызываем стандартный create через entityService
    const created = await strapi.entityService.create('api::holiday.holiday', {
      data: body,
    });
    
    ctx.body = { data: created };
    return ctx.body;
  },
}));