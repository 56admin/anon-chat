import { Report } from '../models/report.model';

export class ReportService {
  /** Создаёт новую жалобу */
  static async createReport(conversationId: string, reporterAnonId: string, reason: string) {
    return Report.create({ conversationId, reporterAnonId, reason });
  }

  /** Возвращает все жалобы (сначала свежие) */
  static async getAllReports() {
    return Report.find().sort({ createdAt: -1 }).lean();
  }
}
