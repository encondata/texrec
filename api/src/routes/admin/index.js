import { Router } from 'express';
import { requireRole } from '../../lib/auth.js';
import { usersRouter } from './users.js';
import { catalogRouter } from './catalog.js';
import { eventsRouter } from './events.js';
import { siteRouter } from './site.js';

// everything under /api/admin needs at least a staff account
export const adminRouter = Router();
adminRouter.use(requireRole('staff'));
adminRouter.use('/users', usersRouter);
adminRouter.use('/events', eventsRouter);
adminRouter.use(catalogRouter);
adminRouter.use(siteRouter);
