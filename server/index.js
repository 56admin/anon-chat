import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import Redis from 'ioredis'
import cors from 'cors'

import { handleJoin } from './matchmaking.js'
import { config } from './config.js'

import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import { serialize, parse } from 'cookie';

import { ignoreUser } from './redisIgnore.js';

const app = express()

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
      httpOnly: true,                         // false — cookie доступна на клиенте через JS (если true — безопасней, но фронт не увидит)
      sameSite: 'lax',                         // Lax — защита от CSRF, но работает из большинства сценариев
      maxAge: 1000 * 3600 * 24 * 365,          // Cookie живёт 1 год (в миллисекундах)
      //secure: process.env.NODE_ENV === 'production', // Secure только для HTTPS в проде
    });
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
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // или домен в продакшене
    methods: ['GET', 'POST'],
    credentials: true
  }
})

io.engine.on('headers', (headers, req) => {
  const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
  if (!cookies.anonClientId) {
    const newId = uuidv4();
    headers['set-cookie'] = serialize('anonClientId', newId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === 'production'
    });
    req._anonClientId = newId;
  }
});

const joinedCount = {};

// Когда клиент подключается через socket.io
io.on('connection', (socket) => {
  let anonId = null;
  if (socket.handshake.headers.cookie) {
    const cookies = parse(socket.handshake.headers.cookie);
    anonId = cookies.anonClientId;
  }
  // ВНИМАНИЕ: socket.handshake.request иногда undefined!
  if (!anonId && socket.handshake.request && socket.handshake.request._anonClientId) {
    anonId = socket.handshake.request._anonClientId;
  }
  socket.data.anonClientId = anonId || null;
  console.log(`🔌 Клиент подключился: ${socket.id}`)
  console.log(`anonClientId для ${socket.id}: ${socket.data.anonClientId}`);


  // Клиент отправляет 'join' — хочет искать собеседника
  socket.on('join', async (payload) => {
    if (!socket.data.anonClientId) {
      socket.emit('error', { message: 'Ошибка идентификации. Перезагрузите страницу.' });
      return;
    }
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
  const myAnonId = socket.data.anonClientId;
  let partnerAnonId = null;
  if (session.userA === socket.id && session.anonB) partnerAnonId = session.anonB;
  if (session.userB === socket.id && session.anonA) partnerAnonId = session.anonA;
  if (!myAnonId || !partnerAnonId) {
      console.log(`❗️ Не удалось определить anonClientId для игнора:`, { myAnonId, partnerAnonId, session });
      return;
  }
  await ignoreUser(redis, myAnonId, partnerAnonId);
  console.log(`🛑 Игнорируем пару: ${myAnonId} и ${partnerAnonId}`);

  // Завершить чат для обоих
  if (session.userA) io.to(session.userA).emit('chatEnded');
  if (session.userB) io.to(session.userB).emit('chatEnded');
  await redis.del(`session:${roomId}`);
  socket.leave(roomId);
});


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