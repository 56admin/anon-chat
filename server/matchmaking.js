import { config } from './config.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Алгоритм поиска собеседника с поддержкой мультивыбора возраста.
 */
export async function handleJoin(socket, io, redis, payload) {
  const {
    ageGroup,        // твой возраст (например: '18-25')
    gender,          // твой пол (например: 'm')
    seekingGender,   // кого ищешь (например: 'f')
    seekingAgeGroups // массив возрастов (например: ['18-25','25-35'])
  } = payload;

  // 1. Пытаемся найти подходящего кандидата среди всех выбранных возрастов
  for (const group of seekingAgeGroups) {
    const queueKey = `queue:${seekingGender}:${group}`;
    let candidateRaw;

    // Проверяем всех в этой очереди (ищем того, кто онлайн и подходит нам)
    while ((candidateRaw = await redis.rpop(queueKey))) {
      const candidate = JSON.parse(candidateRaw);

      // [A] Не допускаем self-join
      if (candidate.socketId === socket.id) continue;

      // [B] Проверяем, что кандидат онлайн
      if (!io.sockets.sockets.has(candidate.socketId)) {
        console.log(`❌ Кандидат ${candidate.socketId} оффлайн, ищем дальше...`);
        continue;
      }

      // [C] Проверяем, что МЫ попадаем в интересы кандидата (встречный поиск)
      // То есть мы должны быть в числе тех, кого ищет кандидат:
      //  - мой пол ∈ candidate.seekingGender
      //  - мой возраст ∈ candidate.seekingAgeGroups
      const candidateSeekingAges = Array.isArray(candidate.seekingAgeGroups)
        ? candidate.seekingAgeGroups
        : [candidate.seekingAgeGroups];
      if (
        candidate.seekingGender === gender &&
        candidateSeekingAges.includes(ageGroup)
      ) {
        // Найден идеальный матч!

        const roomId = uuidv4();

        // Сохраняем в Redis сессию
        await redis.hset(`session:${roomId}`, {
          userA: socket.id,
          userB: candidate.socketId,
          created: Date.now()
        });

        // Обновляем статус обоих
        await redis.set(`status:${socket.id}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);
        await redis.set(`status:${candidate.socketId}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);

        // Подключаем к комнате и отправляем уведомления
        socket.join(roomId);
        socket.emit('joinRoom', { roomId });
        socket.to(candidate.socketId).emit('joinRoom', { roomId });
        socket.server.to(roomId).emit("roomReady");

        console.log(`💬 Room created: ${roomId} between ${socket.id} and ${candidate.socketId}`);
        return;
      }

      // [D] Если не подошёл — возвращаем обратно в очередь
      await redis.lpush(queueKey, candidateRaw);
    }
  }

  // 2. Если никого не нашли — ставим себя в каждую соответствующую очередь (по всем своим возрастам)
  for (const group of seekingAgeGroups) {
    const myQueueKey = `queue:${gender}:${group}`;
    const entry = JSON.stringify({
      socketId: socket.id,
      ageGroup,
      gender,
      seekingGender,
      seekingAgeGroups,
      joined: Date.now()
    });
    await redis.lpush(myQueueKey, entry);
  }
  await redis.set(
    `status:${socket.id}`,
    'waiting',
    'EX',
    config.REDIS_STATUS_TTL_SECONDS
  );
  console.log(`🕓 ${socket.id} added to queue(s) for: ${seekingAgeGroups.join(', ')}`);
}