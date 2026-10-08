import {z} from 'zod';
import {reportSchema,profileSchema} from './schema.mjs';

const dish=reportSchema.shape.dishes.element;
// Normalize older saved results, validate the fields the UI reads and strip extras
// (especially photos and client-side ownership metadata) before cloud storage.
export const savedReportSchema=reportSchema.extend({
 id:z.uuid(),createdAt:z.iso.datetime({offset:true}),model:z.string().max(200).default(''),
 sourceType:reportSchema.shape.sourceType.default('menu'),readable:z.boolean().default(true),
 allergenListText:reportSchema.shape.allergenListText.default(''),menuText:reportSchema.shape.menuText.default(''),
 legend:reportSchema.shape.legend.default([]),warnings:reportSchema.shape.warnings.default([]),
 summary:reportSchema.shape.summary.default(''),profileSnapshot:profileSchema.default([]),
 dishes:z.array(dish.extend({
  id:z.string().min(1).max(100),status:z.enum(['Critical','Avoid','Uncertain']),
  allergenCodes:dish.shape.allergenCodes.default([]),
  allergens:z.array(dish.shape.allergens.element.extend({
   severity:z.enum(['Critical','Avoid','Safe','Untracked']),source:z.enum(['legend','menu','ai']).optional(),
  })).max(24),
 })).max(100),
});
