import { Message } from '../models/message.model';

export class ChatService {
  static async addMessage({
    conversationId,
    senderAnonId,
    text,
    imageId
  }: {
    conversationId: string;
    senderAnonId: string;
    text?: string;
    imageId?: string;
  }) {
    const type = imageId ? 'image' : 'text';
    const message = new Message({
      conversationId,
      senderAnonId,
      type,
      text: text || null,
      imageId: imageId || null
    });
    await message.save();
    return message;
  }

  static async getMessages(conversationId: string) {
    return Message.find({ conversationId }).sort({ createdAt: 1 }).lean();
  }
}
