import { Router } from 'express';
import AdminController from '../controllers/admin.controller';

const router = Router();

// Получить список всех жалоб
router.get('/reports', AdminController.getAllReports);

// Получить детали конкретного чата по ID
router.get('/conversations/:id', AdminController.getConversationDetails);

export default router;