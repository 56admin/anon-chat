import { Request, Response } from 'express';
import { ReportService } from '../services/report.service';

class ReportController {
  /** POST /api/report – отправка жалобы */
  async createReport(req: Request, res: Response) {
    try {
      const { conversationId, reason } = req.body;
      // anonClientId берётся из cookie (устанавливается middleware)
      const reporterAnonId = req.cookies.anonClientId;
      if (!conversationId || !reason) {
        return res.status(400).json({ error: 'conversationId and reason are required' });
      }
      // Сохраняем жалобу в базе
      await ReportService.createReport(conversationId, reporterAnonId, reason);
      return res.json({ message: 'Жалоба принята' });
    } catch (err) {
      console.error('❌ Ошибка при отправке жалобы:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new ReportController();