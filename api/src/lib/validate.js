import { z } from 'zod';
import { badRequest } from './http.js';

// parse req.body (or any value) with a zod schema; 400 with field errors on failure
export function validate(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) details[issue.path.join('.') || '_'] = issue.message;
    throw badRequest('validation failed', details);
  }
  return result.data;
}

export { z };

export const uuid = z.string().uuid();
export const email = z.string().trim().toLowerCase().email().max(200);
export const password = z.string().min(10, 'at least 10 characters').max(200);
export const optionalText = (max = 5000) => z.string().max(max).optional().default('');
