import { Request, Response } from 'express';
import { Conversation } from '../models/conversation.model';
import { ChatService } from '../services/chat.service';
import { ReportService } from '../services/report.service';

class AdminController {
  /** GET /api/admin/reports – получение списка всех жалоб */
  async getAllReports(req: Request, res: Response) {
    try {
      const reports = await ReportService.getAllReports();
      return res.json(reports);
    } catch (err) {
      console.error('❌ Ошибка получения списка жалоб:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /** GET /api/admin/conversations/:id – детали чата по ID (сообщения и участники) */
  async getConversationDetails(req: Request, res: Response) {
    try {
      const { id: conversationId } = req.params;
      // Находим сам разговор и все сообщения этого разговора
      const conversation = await Conversation.findById(conversationId).lean();
      const messages = await ChatService.getMessages(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      return res.json({
        conversationId: conversationId,
        participants: { anonA: conversation.anonA, anonB: conversation.anonB },
        messages: messages
      });
    } catch (err) {
      console.error('❌ Ошибка получения данных чата:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new AdminController();