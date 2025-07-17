import { config } from './config.js'
import { v4 as uuidv4 } from 'uuid'

import { isIgnored } from './redisIgnore.js';


export async function handleJoin(socket, io, redis, payload) {
  const {
    ageGroup,        // твой возраст (например: '18-25')
    gender,          // твой пол (например: 'm')
    seekingGender,   // кого ищешь (например: 'f')
    seekingAgeGroups // массив возрастов для поиска (например: ['18-25','25-35'])
  } = payload;

  // --- 1. Чистим себя из всех очередей (safety: по всем полам и возрастам)
  for (const g of ["m", "f"]) {
    for (const a of ["18-25", "25-35", "35+"]) {
      const q = `queue:${g}:${a}`;
      // Пробуем удалить старые версии себя (по socketId)
      // Храним в очереди JSON с socketId, поэтому удаляем по строке:
      const fakeEntry = JSON.stringify({ socketId: socket.id });
      await redis.lrem(q, 0, fakeEntry); // Если формат entry другой, надо json-парсить каждый элемент и сравнивать socketId
    }
  }

  // --- 2. Добавляем себя ТОЛЬКО в свою очередь
  const myEntry = JSON.stringify({
    socketId: socket.id,
    anonClientId: socket.data.anonClientId,
    ageGroup,
    gender,
    seekingGender,
    seekingAgeGroups,
    joined: Date.now()
  });
  const myQueue = `queue:${gender}:${ageGroup}`;
  await redis.lpush(myQueue, myEntry);

  // --- 3. Ставим статус "active" (ищет!)
  await redis.set(
    `status:${socket.id}`,
    'active',
    'EX',
    config.REDIS_STATUS_TTL_SECONDS // Например, 300
  );

  // --- 4. Ищем кандидатов по ВСЕМ выбранным возрастам
  for (const group of seekingAgeGroups) {
    const queueKey = `queue:${seekingGender}:${group}`;
    let candidateRaw;
    while ((candidateRaw = await redis.rpop(queueKey))) {
      let candidate;
      try { candidate = JSON.parse(candidateRaw); } catch { continue; }

      // --- Не self-join
      if (candidate.socketId === socket.id) continue;
      // --- Только ONLINE
      if (!io.sockets.sockets.has(candidate.socketId)) continue;

      // --- Встречная проверка
      // Мы должны быть интересны кандидату
      const candidateSeekingAges = Array.isArray(candidate.seekingAgeGroups)
        ? candidate.seekingAgeGroups
        : [candidate.seekingAgeGroups];

      if (
        candidate.seekingGender === gender &&
        candidateSeekingAges.includes(ageGroup)
      ) {
        // --- Проверяем его статус (ищет ли!)
        const candidateStatus = await redis.get(`status:${candidate.socketId}`);
        if (candidateStatus !== 'active') {
          // Вернём кандидата обратно в его очередь
          await redis.lpush(queueKey, candidateRaw);
          continue;
        }

        // Найден кандидат
        if (await isIgnored(redis, socket.data.anonClientId, candidate.anonClientId)) {
        // Эти двое друг друга игнорят, пропускаем!
        return; // Или continue; если будет цикл (у тебя сейчас один кандидат)
        }

        // --- Есть совпадение! Матчим:
        const roomId = uuidv4();

        await redis.hset(`session:${roomId}`, {
          userA: socket.id,
          userB: candidate.socketId,
          created: Date.now()
        });

        // Обновляем статус обоих
        await redis.set(`status:${socket.id}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);
        await redis.set(`status:${candidate.socketId}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);

        // Соединяем в комнату
        socket.join(roomId);
        socket.emit('joinRoom', { roomId });
        socket.to(candidate.socketId).emit('joinRoom', { roomId });
        socket.server.to(roomId).emit('roomReady');
        console.log(`💬 Room created: ${roomId} between ${socket.id} and ${candidate.socketId}`);
        return;
      }

      // --- Не подошёл: возвращаем обратно кандидата в очередь
      await redis.lpush(queueKey, candidateRaw);
    }
  }

  // --- Если никого не нашли, ждём (уже стоим в своей очереди)
  console.log(`🕓 ${socket.id} added to queue:${gender}:${ageGroup}`);
}