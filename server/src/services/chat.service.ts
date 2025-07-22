import { Message } from '../models/message.model';

export class ChatService {
  /** Сохраняет отправленное сообщение в базу данных */
  static async addMessage(conversationId: string, senderAnonId: string, text: string): Promise<void> {
    try {
      await Message.create({ conversationId, senderAnonId, text });
    } catch (err) {
      console.error('❌ Не удалось сохранить сообщение в БД:', err);
    }
  }

  /** Получает всю историю сообщений для указанного разговора */
  static async getMessages(conversationId: string) {
    // Находим все сообщения этого чата в хронологическом порядке
    return Message.find({ conversationId }).sort({ timestamp: 1 }).lean();
  }
}
