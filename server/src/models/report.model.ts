import { Schema, model } from 'mongoose';

const ReportSchema = new Schema({
  conversationId: { type: String, required: true },
  reporterAnonId: { type: String, required: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

//
export const Report = model('Report', ReportSchema);
