import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import Redis from 'ioredis'
import cors from 'cors'

import { handleJoin } from './matchmaking.js'
import { config } from './config.js'

import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";

import { ignoreUser } from './redisIgnore.js';

// Подключаем парсер cookie (Express middleware для работы с cookie)
app.use(cookieParser());

/**
 * Middleware для установки анонимного идентификатора пользователя (anonClientId) в cookie.
 * 
 * - Проверяет, есть ли у клиента cookie с anonClientId.
 * - Если нет — генерирует новый UUID и сохраняет его в cookie с большим сроком жизни.
 * - anonClientId используется для анонимного трекинга пользователя (например, для игнора и бана).
 */
app.use((req, res, next) => {
  // Если в cookie нет anonClientId, генерируем и устанавливаем
  if (!req.cookies.anonClientId) {
    const anonClientId = uuidv4();
    res.cookie('anonClientId', anonClientId, {
      httpOnly: false,                         // false — cookie доступна на клиенте через JS (если true — безопасней, но фронт не увидит)
      sameSite: 'lax',                         // Lax — защита от CSRF, но работает из большинства сценариев
      maxAge: 1000 * 3600 * 24 * 365,          // Cookie живёт 1 год (в миллисекундах)
      secure: process.env.NODE_ENV === 'production', // Secure только для HTTPS в проде
    });
    // Сразу добавляем anonClientId в req.cookies для дальнейшей логики запроса
    req.cookies.anonClientId = anonClientId;
  }
  // Переходим к следующему middleware/роуту
  next();
});

// Redis клиент
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379
})

// Express-сервер + WebSocket сервер поверх него
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Маршрут-заглушка
app.get('/', (req, res) => {
  res.send('Backend is alive!')
})

const joinedCount = {};

// Когда клиент подключается через socket.io
io.on('connection', (socket) => {
  console.log(`🔌 Клиент подключился: ${socket.id}`)
  socket.data.anonClientId = socket.handshake.query.anonClientId;


  // Клиент отправляет 'join' — хочет искать собеседника
  socket.on('join', async (payload) => {
    console.log(`📥 JOIN от ${socket.id}:`, payload)

    try {
      await handleJoin(socket, io, redis, payload)
    } catch (err) {
      console.error(`❌ Ошибка в handleJoin:`, err)
      socket.emit('error', { message: 'Internal server error' })
    }
  })

  // 📨 Обработка входящего сообщения от клиента
  socket.on("message", ({ roomId, text }) => {
    console.log(`💬 Сообщение от ${socket.id} в комнате ${roomId}:`, text)
  
    // Отправляем всем в комнате, включая самого отправителя
    io.to(roomId).emit("message", {
      text,
      from: socket.id, // просто передаём идентификатор отправителя
    })
  })

// Кнопка "Игнорировать" на клиенте будет вызывать это событие
  socket.on('ignoreUser', async ({ roomId }) => {
    const session = await redis.hgetall(`session:${roomId}`);
    const userA = socket.data.anonClientId;
    let userB = null;
    if (session.userA && session.userA !== socket.id) userB = session.userA;
    if (session.userB && session.userB !== socket.id) userB = session.userB;
    if (!userA || !userB) return;

    await ignoreUser(redis, userA, userB);

    // Завершить чат для обоих (как в endChat)
    if (session.userA) io.to(session.userA).emit('chatEnded');
    if (session.userB) io.to(session.userB).emit('chatEnded');
    await redis.del(`session:${roomId}`);
    socket.leave(roomId);
  })


  //Обработка подключения к комнате
  socket.on('joinRoomAck', ({ roomId }) => {
    socket.join(roomId)
    console.log(`✅ ${socket.id} реально присоединился к комнате ${roomId}`)
    
    // Увеличиваем счетчик для этой комнаты
    joinedCount[roomId] = (joinedCount[roomId] || 0) + 1;

    // Как только оба клиента реально в комнате:
    if (joinedCount[roomId] === 2) {
      io.to(roomId).emit("roomReady")
      console.log(`➡️ roomReady отправлен в комнату ${roomId}`)
      // Можно обнулить счетчик, если нужно:
      // joinedCount[roomId] = 0;
    }
  })

  // Обработка отключения
  socket.on('disconnect', async () => {
    console.log(`❌ Клиент отключился: ${socket.id}`)

    await redis.del(`status:${socket.id}`)
    // Здесь позже: очистка очереди и активных сессий
  })

  socket.on('endChat', async ({ roomId }) => {
    if (!roomId) return

      // Снимаем все статусы: пользователь больше не ищет и не в чате
  await redis.set(
    `status:${socket.id}`,
    'inactive',
    'EX',
    config.REDIS_STATUS_TTL_SECONDS // Например, 60 секунд
  );

    // Получаем участников комнаты
    const session = await redis.hgetall(`session:${roomId}`)
    if (session && (session.userA || session.userB)) {
      // Уведомляем обоих, что чат завершён
      if (session.userA) io.to(session.userA).emit('chatEnded')
      if (session.userB) io.to(session.userB).emit('chatEnded')
    }

    // Очищаем комнату и сессию
    await redis.del(`session:${roomId}`)
    // (дополнительно можешь очищать статус/очереди, если нужно)
    socket.leave(roomId)
    // (все остальные действия — по желанию)
    console.log(`Чат ${roomId} завершён`)
  })
})

// Запуск сервера
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`✅ Backend is running on port ${PORT}`)
})