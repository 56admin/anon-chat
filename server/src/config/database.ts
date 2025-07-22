import mongoose from 'mongoose';

const mongoUrl = process.env.MONGO_URL || 'mongodb://mongo:27017/anonchat';

export async function connectMongo(): Promise<void> {
  try {
    await mongoose.connect(mongoUrl);
    console.log(`✅ MongoDB подключен: ${mongoUrl}`);
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    process.exit(1);  // Выходим, если не удалось подключиться
  }
}