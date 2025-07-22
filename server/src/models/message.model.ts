import { Schema, model } from 'mongoose';

const MessageSchema = new Schema({
  conversationId: { type: String, required: true },
  senderAnonId: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

export const Message = model('Message', MessageSchema);