import { config } from './config.js'
import { v4 as uuidv4 } from 'uuid'

import { isIgnored } from './redisIgnore.js';

/**
 * Алгоритм подбора пары для чата (по параметрам и с учетом игнора).
 * socket.data.anonClientId — теперь гарантировано всегда есть.
 */
export async function handleJoin(socket, io, redis, payload) {
  const {
    ageGroup,        // твой возраст (например: '19-25')
    gender,          // твой пол (например: 'm')
    seekingGender,   // кого ищешь (например: 'f')
    seekingAgeGroups // массив возрастов для поиска (например: ['19-25','26-35'])
  } = payload;

  const myAnonId = socket.data.anonClientId;

  // 1. Чистим себя из всех очередей (по socketId)
  for (const g of ["m", "f"]) {
    for (const a of ["18", "19-25", "26-35", "36+"]) {
      const q = `queue:${g}:${a}`;
      // Чистим по socketId
      const entries = await redis.lrange(q, 0, -1);
      for (const entryRaw of entries) {
        try {
          const entry = JSON.parse(entryRaw);
          if (entry.socketId === socket.id) {
            await redis.lrem(q, 0, entryRaw);
            console.log(`🧹 Удалили старое подключение ${socket.id} из ${q}`);
          }
        } catch {}
      }
    }
  }

  // 2. Добавляем себя в свою очередь
  const myEntry = JSON.stringify({
    socketId: socket.id,
    anonClientId: myAnonId,
    ageGroup,
    gender,
    seekingGender,
    seekingAgeGroups,
    joined: Date.now()
  });
  const myQueue = `queue:${gender}:${ageGroup}`;
  await redis.lpush(myQueue, myEntry);

  // 3. Ставим статус "active"
  await redis.set(
    `status:${socket.id}`,
    'active',
    'EX',
    config.REDIS_STATUS_TTL_SECONDS // Например, 300
  );

  // 4. Перебираем всех возможных кандидатов
  for (const group of seekingAgeGroups) {
    const queueKey = `queue:${seekingGender}:${group}`;
    let candidateRaw;
    let checkedCandidates = 0;
    const tempCandidates = [];

    // Собираем всех кандидатов в tempCandidates, чтобы обработать корректно очередь
    while ((candidateRaw = await redis.rpop(queueKey))) {
      let candidate;
      try { candidate = JSON.parse(candidateRaw); } catch { continue; }
      checkedCandidates++;

      // 4.1. Пропуск самого себя
      if (candidate.socketId === socket.id) {
        console.log(`👤 Пропущен self: ${candidate.socketId}`);
        tempCandidates.push(candidateRaw);
        continue;
      }

      // 4.2. Только ONLINE
      if (!io.sockets.sockets.has(candidate.socketId)) {
        console.log(`👻 Пропущен offline: ${candidate.socketId}`);
        continue; // offline не возвращаем — чистим очередь!
      }

      // 4.3. Проверка встречных требований
      const candidateSeekingAges = Array.isArray(candidate.seekingAgeGroups)
        ? candidate.seekingAgeGroups
        : [candidate.seekingAgeGroups];

      if (
        candidate.seekingGender === gender &&
        candidateSeekingAges.includes(ageGroup)
      ) {
        // 4.4. Проверка статуса
        const candidateStatus = await redis.get(`status:${candidate.socketId}`);
        if (candidateStatus !== 'active') {
          console.log(`⚪️ Пропущен: ${candidate.socketId} статус не active`);
          tempCandidates.push(candidateRaw);
          continue;
        }

        // 4.5. Проверка игнора
        if (await isIgnored(redis, myAnonId, candidate.anonClientId)) {
          console.log(`⛔️ Игнор между ${myAnonId} и ${candidate.anonClientId}, пропускаю пару`);
          tempCandidates.push(candidateRaw);
          continue;
        }

        // 4.6. УСПЕШНЫЙ МАТЧ! Не возвращаем кандидата в очередь
        const roomId = uuidv4();
        await redis.hset(`session:${roomId}`, {
          userA: socket.id,
          userB: candidate.socketId,
          anonA: socket.data.anonClientId,
          anonB: candidate.anonClientId,
          created: Date.now()
        });

        await redis.set(`status:${socket.id}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);
        await redis.set(`status:${candidate.socketId}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);

        socket.join(roomId);
        socket.emit('joinRoom', { roomId });
        socket.to(candidate.socketId).emit('joinRoom', { roomId });
        socket.server.to(roomId).emit('roomReady');
        console.log(`✅ Матч: ${myAnonId} <-> ${candidate.anonClientId} (room: ${roomId})`);
        return;
      }

      // Если не mutual match — возвращаем кандидата в очередь
      tempCandidates.push(candidateRaw);
    }

    // Вернём всех неиспользованных кандидатов обратно в очередь
    if (tempCandidates.length > 0) {
      await redis.lpush(queueKey, ...tempCandidates.reverse()); // reverse — чтобы сохранить порядок
    }
    if (checkedCandidates > 0) {
      console.log(`🧾 Проверено кандидатов в очереди ${queueKey}: ${checkedCandidates}`);
    }
  }

  // --- Если никого не нашли, ждём (уже стоим в своей очереди)
  console.log(`🕓 ${myAnonId} added to queue:${gender}:${ageGroup}`);
}