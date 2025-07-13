import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import Redis from 'ioredis'
import cors from 'cors'

import { handleJoin } from './matchmaking.js'
import { config } from './config.js'

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