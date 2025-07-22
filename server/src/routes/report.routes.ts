import { Router } from 'express';
import ReportController from '../controllers/report.controller';

const router = Router();

// Отправка жалобы
router.post('/report', ReportController.createReport);

export default router;