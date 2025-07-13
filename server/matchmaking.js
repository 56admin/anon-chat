import { config } from './config.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Алгоритм поиска собеседника и регистрации в очереди.
 * 
 * 1. Пользователь ВСЕГДА становится в свою очередь (по полу и возрасту).
 * 2. Перебираются кандидаты из очереди “кого ищу” (по критериям поиска).
 * 3. Для каждого кандидата:
 *    - Проверяем, не сам ли я себе собеседник (anti self-join).
 *    - Проверяем, онлайн ли он сейчас.
 *    - Проверяем, что и я ему подхожу (встречный поиск).
 *    - Если всё ок — создаём комнату, сохраняем статус, соединяем.
 *    - Если не подошёл — возвращаем в очередь.
 * 4. Если никого не нашли — ставим себя в свою очередь.
 */
export async function handleJoin(socket, io, redis, payload) {
  // 1. Извлекаем параметры поиска из запроса пользователя (payload)
  const {
    ageGroup,        // Мой возраст (например: '18-25')
    gender,          // Мой пол (например: 'm')
    seekingGender,   // Кого ищу (например: 'f')
    seekingAgeGroup  // Какой возраст ищу (например: '18-25')
  } = payload

  // 2. Ключ моей очереди (где стою Я)
  // Пример: если я мужчина 18-25, то это 'queue:m:18-25'
  const myKey = `queue:${gender}:${ageGroup}`

  // 3. Ключ очереди кандидатов (тех, кого я ищу)
  // Пример: если я ищу девушку 18-25 — 'queue:f:18-25'
  const theirKey = `queue:${seekingGender}:${seekingAgeGroup}`

  let candidateRaw

  /**
   * 4. Перебираем очередь кандидатов (старых), ищем подходящего.
   *    — Для каждого кандидата в целевой очереди:
   */
  while ((candidateRaw = await redis.rpop(theirKey))) {
    const candidate = JSON.parse(candidateRaw)

    // [A] ⚠️ Проверяем, не сам ли я себе собеседник (например, после обновления страницы)
    if (candidate.socketId === socket.id) {
      // Если так — просто пропускаем и берём следующего из очереди
      continue
    }

    // [B] ❌ Проверяем, онлайн ли кандидат (не отвалился ли у него браузер/интернет)
    if (!io.sockets.sockets.has(candidate.socketId)) {
      // Если кандидат оффлайн — пропускаем и ищем дальше
      console.log(`❌ Кандидат ${candidate.socketId} оффлайн, ищем дальше...`)
      continue
    }

    // [C] ✅ Проверяем “встречное” совпадение
    //    Кандидат должен искать пользователя ТВОЕГО пола и возраста!
    //    (то есть у него должен быть такой же запрос как у тебя, но наоборот)
    if (
      candidate.seekingGender === gender &&
      candidate.seekingAgeGroup === ageGroup
    ) {
      // Всё совпало! Можно соединять пользователей.

      // Генерируем уникальный id комнаты
      const roomId = uuidv4()

      // Сохраняем информацию о сессии в Redis (для возможной аналитики/логов)
      await redis.hset(`session:${roomId}`, {
        userA: socket.id,
        userB: candidate.socketId,
        created: Date.now()
      })

      // Обновляем статус ОТКРЫТОЙ комнаты у обоих пользователей (matched)
      // TTL (время жизни ключа) нужен, чтобы Redis сам чистил неактуальные статусы
      await redis.set(
        `status:${socket.id}`,
        'matched',
        'EX',                           // "expire" — истекает через ...
        config.REDIS_STATUS_TTL_SECONDS // ... столько секунд (например, 120)
      )
      await redis.set(
        `status:${candidate.socketId}`,
        'matched',
        'EX',
        config.REDIS_STATUS_TTL_SECONDS
      )

      // Оба пользователя присоединяются к одной комнате (roomId)
      socket.join(roomId) // Подключаем текущего пользователя к комнате
      socket.emit('joinRoom', { roomId }) // Сообщаем ему номер комнаты
      socket.to(candidate.socketId).emit('joinRoom', { roomId }) // Сообщаем кандидату

      // Оповещаем обоих, что чат можно начинать ("roomReady")
      socket.server.to(roomId).emit("roomReady")
      console.log(`💬 Room created: ${roomId} between ${socket.id} and ${candidate.socketId}`)
      return // Останавливаем функцию: соединение создано
    } else {
      // [D] Не подошёл встречный критерий — возвращаем кандидата обратно в его очередь (не теряем его!)
      await redis.lpush(theirKey, candidateRaw)
    }
  }

  // 5. Если никого не нашли (или все были невалидны/оффлайн/неподходящие) — кладём себя в свою очередь
  const entry = JSON.stringify({
    socketId: socket.id,
    ageGroup,
    gender,
    seekingGender,
    seekingAgeGroup,
    joined: Date.now()
  })

  await redis.lpush(myKey, entry) // Ставим себя в начало своей очереди
  await redis.set(
    `status:${socket.id}`,
    'waiting',                       // статус: ищет!
    'EX',
    config.REDIS_STATUS_TTL_SECONDS
  )
  console.log(`🕓 ${socket.id} added to queue ${myKey}`)
}