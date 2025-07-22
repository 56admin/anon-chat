import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../config/redis';
import { config } from '../config/constants';
import { isIgnored } from '../services/ignore.service';
import { Conversation } from '../models/conversation.model';

interface JoinPayload {
  ageGroup: string;
  gender: string;
  seekingGender: string;
  seekingAgeGroups: string[];
}

/**
 * Обработка запроса на поиск собеседника.
 * Добавляет пользователя в очередь и пытается подобрать ему пару.
 */
export async function handleJoin(socket: Socket, io: Server, payload: JoinPayload) {
  const { ageGroup, gender, seekingGender, seekingAgeGroups } = payload;
  const myAnonId = socket.data.anonClientId;

  // 1. Удаляем этого пользователя из всех очередей, где он мог остаться
  for (const g of ['m', 'f']) {
    for (const a of ['18', '19-25', '26-35', '36+']) {
      const queueKey = `queue:${g}:${a}`;
      const entries = await redisClient.lrange(queueKey, 0, -1);
      for (const entryRaw of entries) {
        try {
          const entry = JSON.parse(entryRaw);
          if (entry.socketId === socket.id) {
            await redisClient.lrem(queueKey, 0, entryRaw);
            console.log(`🧹 Очистили старое подключение ${socket.id} из ${queueKey}`);
          }
        } catch (e) {
          // пропускаем неверный JSON
        }
      }
    }
  }

  // 2. Добавляем себя в очередь в соответствии со своим полом и возрастной группой
  const myEntry = JSON.stringify({
    socketId: socket.id,
    anonClientId: myAnonId,
    ageGroup,
    gender,
    seekingGender,
    seekingAgeGroups,
    joined: Date.now()
  });
  const myQueueKey = `queue:${gender}:${ageGroup}`;
  await redisClient.lpush(myQueueKey, myEntry);

  // 3. Обновляем статус пользователя -> "active" (ищет собеседника)
  await redisClient.set(`status:${socket.id}`, 'active', 'EX', config.REDIS_STATUS_TTL_SECONDS);

  // 4. Перебираем очереди тех, кто подходит под условия поиска
  for (const group of seekingAgeGroups) {
    const queueKey = `queue:${seekingGender}:${group}`;
    let candidateRaw: string | null;
    const tempCandidates: string[] = [];
    let checkedCount = 0;

    // Извлекаем кандидатов из конца очереди (rpop) для проверки
    while ((candidateRaw = await redisClient.rpop(queueKey)) !== null) {
      let candidate;
      try {
        candidate = JSON.parse(candidateRaw);
      } catch {
        continue;  // если вдруг неправильный JSON
      }
      checkedCount++;

      // 4.1. Пропускаем себя (на всякий случай)
      if (candidate.socketId === socket.id) {
        tempCandidates.push(candidateRaw);
        console.log(`👤 Пропускаем self: ${candidate.socketId}`);
        continue;
      }

      // 4.2. Пропускаем офлайн-клиента (который уже отключился)
      if (!io.sockets.sockets.has(candidate.socketId)) {
        console.log(`👻 Пропускаем оффлайн: ${candidate.socketId}`);
        // Не возвращаем в очередь, фактически удаляя "призрака"
        continue;
      }

      // 4.3. Проверяем, удовлетворяем ли мы встречным условиям кандидата
      const candidateSeekingAges: string[] = Array.isArray(candidate.seekingAgeGroups)
        ? candidate.seekingAgeGroups
        : [candidate.seekingAgeGroups];
      if (candidate.seekingGender === gender && candidateSeekingAges.includes(ageGroup)) {
        // 4.4. Проверяем статус кандидата (всё ещё активен?)
        const candidateStatus = await redisClient.get(`status:${candidate.socketId}`);
        if (candidateStatus !== 'active') {
          // Кандидат уже не ищет, пропускаем
          tempCandidates.push(candidateRaw);
          console.log(`⚪️ Пропускаем ${candidate.socketId}: статус = ${candidateStatus}`);
          continue;
        }

        // 4.5. Проверяем, не игнорируют ли пользователи друг друга
        if (await isIgnored(myAnonId, candidate.anonClientId)) {
          tempCandidates.push(candidateRaw);
          console.log(`⛔️ Игнор: пара ${myAnonId} и ${candidate.anonClientId}`);
          continue;
        }

        // 4.6. УСПЕШНЫЙ МЭТЧ!
        const roomId = uuidv4();
        // Сохраняем сессию чата в Redis
        await redisClient.hset(`session:${roomId}`, {
          userA: socket.id,
          userB: candidate.socketId,
          anonA: myAnonId,
          anonB: candidate.anonClientId,
          created: Date.now()
        });
        // Обновляем статус обоих на "matched"
        await redisClient.set(`status:${socket.id}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);
        await redisClient.set(`status:${candidate.socketId}`, 'matched', 'EX', config.REDIS_STATUS_TTL_SECONDS);

        // Сохраняем разговор в MongoDB (для истории и жалоб)
        await Conversation.create({ _id: roomId, anonA: myAnonId, anonB: candidate.anonClientId });

        // Оповещаем клиентов о найденной паре и комнате
        socket.join(roomId);
        socket.emit('joinRoom', { roomId });
        io.to(candidate.socketId).emit('joinRoom', { roomId });
        socket.server.to(roomId).emit('roomReady');  // опционально: сигнал о готовности комнаты
        console.log(`✅ Матч! Комната ${roomId}: ${myAnonId} <-> ${candidate.anonClientId}`);
        return;
      }

      // Если кандидат не подошёл по условиям – возвращаем его обратно в очередь
      tempCandidates.push(candidateRaw);
    }

    // Возвращаем всех непросмотренных кандидатов обратно в очередь (сохранение порядка)
    if (tempCandidates.length > 0) {
      await redisClient.lpush(queueKey, ...tempCandidates.reverse());
    }
    if (checkedCount > 0) {
      console.log(`🧾 Проверено кандидатов в очереди ${queueKey}: ${checkedCount}`);
    }
  }

  // 5. Если пару не нашли – пользователь остаётся ждать в своей очереди
  console.log(`🕓 Пользователь ${socket.id} (${myAnonId}) ожидает в очереди ${myQueueKey}`);
}