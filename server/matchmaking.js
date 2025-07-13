import { config } from './config.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Ищет собеседника, защищает от self-join, от оффлайн-клиентов,  
 * и кладёт пользователя в очередь, если никого нет.
 * 
 * @param {object} socket - Текущий клиент (его сессия WebSocket)
 * @param {object} io - Сервер socket.io (для проверки, кто онлайн)
 * @param {object} redis - Redis-клиент для очередей/статусов
 * @param {object} payload - Кто кого ищет (пол, возраст и т.п.)
 */
export async function handleJoin(socket, io, redis, payload) {
  // Извлекаем параметры поиска из payload (то, что выбрал клиент)
  const { ageGroup, gender, seekingGender, seekingAgeGroup } = payload

  // Ключ очереди — например, queue:f:18-25 (ищем девушек 18–25)
  const queueKey = `queue:${seekingGender}:${seekingAgeGroup}`

  // rpop — достаём кандидата с "конца" очереди (старого)
  let candidateRaw = await redis.rpop(queueKey)

  // Цикл: перебираем всех, кто подходит, пока не найдём валидного кандидата
  while (candidateRaw) {
    const candidate = JSON.parse(candidateRaw)

    // [A] Проверяем, не сам ли я себе собеседник (например, после F5)
    if (candidate.socketId === socket.id) {
      // ⚠️ Просто пропускаем такого кандидата (не возвращаем в очередь)
      console.log("⚠️ Сам себе не собеседник! Возврат в очередь.")
      candidateRaw = await redis.rpop(queueKey) // пробуем следующего
      continue
    }

    // [B] Проверяем, онлайн ли вообще этот кандидат (живой ли сокет)
    if (!io.sockets.sockets.has(candidate.socketId)) {
      // ❌ Он уже оффлайн, пропускаем
      console.log(`❌ Кандидат ${candidate.socketId} оффлайн, ищем дальше...`)
      candidateRaw = await redis.rpop(queueKey)
      continue
    }

    // [C] Нашли нормального кандидата!
    const roomId = uuidv4() // Генерим уникальный id комнаты

    // — Сохраняем эту сессию в Redis (можно для модерации/аналитики)
    await redis.hset(`session:${roomId}`, {
      userA: socket.id,
      userB: candidate.socketId,
      created: Date.now()
    })

    // — Обновляем статус обоих как “matched” (нашёлся собеседник)
    // Статус живёт N секунд (TTL)
    await redis.set(
      `status:${socket.id}`,           // ключ статуса для этого клиента
      'matched',                       // значение (что найден собеседник)
      'EX',                            // “expire” (ключ устаревает)
      config.REDIS_STATUS_TTL_SECONDS  // TTL в секундах (например, 120)
    )
    await redis.set(
      `status:${candidate.socketId}`,
      'matched',
      'EX',
      config.REDIS_STATUS_TTL_SECONDS
    )

    // — Оба присоединяются к комнате (roomId)
    socket.join(roomId) // Текущий
    socket.emit('joinRoom', { roomId }) // Сообщаем текущему
    socket.to(candidate.socketId).emit('joinRoom', { roomId }) // Второму

    // — Шлём обоим сигнал “roomReady”: теперь чат активен
    socket.server.to(roomId).emit("roomReady")
    console.log(`💬 Room created: ${roomId} between ${socket.id} and ${candidate.socketId}`)
    return // Останавливаем функцию (закончили)
  }

  // Если никого не нашли (или все были оффлайн/сам себе) — кладём себя в очередь
  const entry = JSON.stringify({
    socketId: socket.id,
    ageGroup,
    gender,
    seekingGender,
    seekingAgeGroup,
    joined: Date.now()
  })

  await redis.lpush(queueKey, entry) // В начало очереди (новый)
  await redis.set(
    `status:${socket.id}`,
    'waiting',                       // ещё ищет!
    'EX',
    config.REDIS_STATUS_TTL_SECONDS
  )
  console.log(`🕓 ${socket.id} added to queue ${queueKey}`)
}