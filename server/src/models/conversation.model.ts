import { Schema, model } from 'mongoose';

const ConversationSchema = new Schema({
  _id: { type: String, required: true },    // UUID комнаты используется как _id
  anonA: { type: String, required: true },  // anonClientId первого участника
  anonB: { type: String, required: true },  // anonClientId второго участника
  createdAt: { type: Date, default: Date.now }
});

export const Conversation = model('Conversation', ConversationSchema);
