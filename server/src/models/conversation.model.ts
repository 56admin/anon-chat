import { Schema, model } from 'mongoose';

const ConversationSchema = new Schema({
  _id: { type: String, required: true },
  anonA: { type: String, required: true },
  anonB: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },

  // ➕ Новые поля:
  isAdult: { type: Boolean, default: false },
  tag: { type: String, default: null }
});

export const Conversation = model('Conversation', ConversationSchema);
