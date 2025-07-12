// server/matchmaking.js

import { config } from './config.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Регистрирует нового клиента в очереди поиска
 * @param {object} socket - объект socket.io клиента
 * @param {object} redis - Redis клиент
 * @param {object} payload - параметры поиска: возраст, пол, кого ищем
 */
export async function handleJoin(socket, redis, payload) {
  const {
    ageGroup,        // Например: '18-25'
    gender,          // Например: 'm'
    seekingGender,   // Например: 'f'
    seekingAgeGroup  // Например: '18+'
  } = payload

  // Создаём ключ очереди по критериям (например, "queue:f:18+")
  const queueKey = `queue:${seekingGender}:${seekingAgeGroup}`

  // Проверка очереди: есть ли подходящий собеседник
  const candidateRaw = await redis.rpop(queueKey)

  if (candidateRaw) {
    // Нашли кого-то! Подключаем их в комнату
    const candidate = JSON.parse(candidateRaw)
    const roomId = uuidv4()

    // Сохраняем инфу о сессии
    await redis.hset(`session:${roomId}`, {
      userA: socket.id,
      userB: candidate.socketId,
      created: Date.now()
    })

    // Обновляем статус обоих
    await redis.set(`status:${socket.id}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS)
    await redis.set(`status:${candidate.socketId}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS)

    // Присоединяем в комнату
    socket.join(roomId)
    socket.to(candidate.socketId).emit('joinRoom', { roomId })
    socket.emit('joinRoom', { roomId })

    console.log(`💬 Room created: ${roomId} between ${socket.id} and ${candidate.socketId}`)

  } else {
    // Никого не нашли → ставим в очередь
    const entry = JSON.stringify({
      socketId: socket.id,
      ageGroup,
      gender,
      seekingGender,
      seekingAgeGroup,
      joined: Date.now()
    })

    await redis.lpush(queueKey, entry)

    // Обновляем статус и TTL
    await redis.set(`status:${socket.id}`, 'waiting', 'EX', config.REDIS_STATUS_TTL_SECONDS)

    console.log(`🕓 ${socket.id} added to queue ${queueKey}`)
  }
}