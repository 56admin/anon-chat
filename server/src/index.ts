import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import { config } from './config/constants';
import { connectMongo } from './config/database';
import { redisClient } from './config/redis';

import chatRoutes from './routes/chat.routes';
import reportRoutes from './routes/report.routes';
import adminRoutes from './routes/admin.routes';
import fileRoutes from './routes/file.routes';

import { registerSocketHandlers } from './sockets';

const app = express();

// 1. Middleware для CORS и парсинга JSON
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// 2. Middleware для установки anonClientId cookie для HTTP-запросов (REST API)
app.use((req, res, next) => {
  if (!req.cookies.anonClientId) {
    const anonId = uuidv4();
    res.cookie('anonClientId', anonId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 3600 * 24 * 365  // 1 год
      // secure: process.env.NODE_ENV === 'production'
    });
  }
  next();
});

// 3. Подключение маршрутов REST API
app.use('/api/chat', chatRoutes);
app.use('/api', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', fileRoutes);

// 4. Создание HTTP-сервера и Socket.IO сервера
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true }
});

// 5. Регистрация обработчиков Socket.IO
registerSocketHandlers(io);

// 6. Запуск сервера после подключения к базе данных
const PORT = process.env.PORT || 3001;
connectMongo().then(() => {
  server.listen(PORT, () => {
    console.log(`✅ Backend сервер запущен на порту ${PORT}`);
  });
});