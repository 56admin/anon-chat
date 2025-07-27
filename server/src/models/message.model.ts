import { Schema, model } from 'mongoose';

const MessageSchema = new Schema({
  conversationId: { type: String, required: true },
  senderAnonId: { type: String, required: true },

  type: {
    type: String,
    enum: ['text', 'image'],
    default: 'text'
  },

  text: { type: String, default: null },
  imageId: { type: String, default: null },

  createdAt: { type: Date, default: Date.now }
});

export const Message = model('Message', MessageSchema);
