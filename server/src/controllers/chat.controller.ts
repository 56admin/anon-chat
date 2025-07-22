import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';

class ChatController {
  /** GET /api/chat/:conversationId/messages – история сообщений чата */
  async getMessages(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const messages = await ChatService.getMessages(conversationId);
      return res.json(messages);
    } catch (err) {
      console.error('❌ Ошибка получения истории сообщений:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new ChatController();