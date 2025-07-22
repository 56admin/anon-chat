import { Router } from 'express';
import ChatController from '../controllers/chat.controller';

const router = Router();

// История сообщений по идентификатору беседы
router.get('/:conversationId/messages', ChatController.getMessages);

export default router;