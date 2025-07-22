import { Schema, model } from 'mongoose';

const ReportSchema = new Schema({
  conversationId: { type: String, required: true },   // UUID чата, на который жалоба
  reporterAnonId: { type: String, required: true },   // anonClientId пользователя, отправившего жалобу
  reason: { type: String, required: true },           // Текст причины жалобы
  createdAt: { type: Date, default: Date.now }
});

export const Report = model('Report', ReportSchema);
