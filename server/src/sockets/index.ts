import { Server } from 'socket.io';
import { parse, serialize } from 'cookie';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../config/redis';
import { config } from '../config/constants';
import { handleJoin } from './matchmaking';
import { ignoreUser } from '../services/ignore.service';
import { ChatService } from '../services/chat.service';

export function registerSocketHandlers(io: Server) {
  // При установлении нового HTTP соединения Socket.IO – присваиваем anonClientId через cookie (если нет)
  io.engine.on('headers', (headers, req) => {
    const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
    if (!cookies.anonClientId) {
      const newId = uuidv4();
      // Устанавливаем cookie anonClientId в заголовки ответа handshake
      headers['set-cookie'] = serialize('anonClientId', newId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,   // 1 год
        secure: process.env.NODE_ENV === 'production'
      });
      // Сохраняем anonClientId во временное поле запроса, чтобы прочитать его ниже
      (req as any)._anonClientId = newId;
    }
  });

  io.on('connection', (socket) => {
    // При подключении сокета – определяем anonClientId пользователя
    let anonId: string | null = null;
    if (socket.handshake.headers.cookie) {
      const cookies = parse(socket.handshake.headers.cookie);
      anonId = cookies.anonClientId || null;
    }
    // Если при веб-сокет хэндшейке мы установили новый anonClientId, он будет доступен здесь
    if (!anonId && socket.handshake.request && (socket.handshake.request as any)._anonClientId) {
      anonId = (socket.handshake.request as any)._anonClientId;
    }
    socket.data.anonClientId = anonId;
    console.log(`🔌 Новый клиент подключился: socketId=${socket.id}, anonClientId=${socket.data.anonClientId}`);

    // Когда клиент запрашивает поиск ('join')
    socket.on('join', async (payload) => {
      if (!socket.data.anonClientId) {
        socket.emit('error', { message: 'Не удалось определить ваш anonClientId. Перезайдите.' });
        return;
      }
      console.log(`📥 JOIN от ${socket.id}:`, payload);
      try {
        await handleJoin(socket, io, payload);
      } catch (err) {
        console.error('❌ Ошибка в handleJoin:', err);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    // Когда клиент отправляет сообщение в чат
    socket.on('message', async ({ roomId, text }) => {
      console.log(`💬 Сообщение от ${socket.id} (anon=${socket.data.anonClientId}) в комнату ${roomId}: ${text}`);
      // Отправляем сообщение всем участникам комнаты (включая отправителя)
      io.to(roomId).emit('message', {
        text,
        from: socket.id
      });
      // Сохраняем сообщение в базе данных (история чата)
      const senderAnonId = socket.data.anonClientId;
      if (senderAnonId) {
        await ChatService.addMessage(roomId, senderAnonId, text);
      }
    });

    // Клиент нажал "Игнорировать пользователя"
    socket.on('ignoreUser', async ({ roomId }) => {
      const sessionKey = `session:${roomId}`;
      const session = await redisClient.hgetall(sessionKey);
      const myAnonId = socket.data.anonClientId;
      let partnerAnonId: string | null = null;
      if (session.userA === socket.id && session.anonB) partnerAnonId = session.anonB;
      if (session.userB === socket.id && session.anonA) partnerAnonId = session.anonA;
      if (!myAnonId || !partnerAnonId) {
        console.log(`❗️ Не удалось выполнить игнор: myAnonId=${myAnonId}, partnerAnonId=${partnerAnonId}`);
        return;
      }
      // Помещаем пару в игнор (Redis)
      await ignoreUser(myAnonId, partnerAnonId);
      console.log(`🛑 Пользователи ${myAnonId} и ${partnerAnonId} добавлены в игнор`);
      // Отключаем обоих от текущего чата
      if (session.userA) io.to(session.userA).emit('chatEnded');
      if (session.userB) io.to(session.userB).emit('chatEnded');
      await redisClient.del(sessionKey);
      socket.leave(roomId);
    });

    // Подтверждение присоединения к комнате (от клиента)
    socket.on('joinRoomAck', ({ roomId }) => {
      socket.join(roomId);
      console.log(`✅ Socket ${socket.id} подтвердил вход в комнату ${roomId}`);
      // Опционально: можно отслеживать, что оба клиента подтвердили, прежде чем начать
    });

    // Один из клиентов завершает чат (например, нажал "Завершить")
    socket.on('endChat', async ({ roomId }) => {
      if (!roomId) return;
      // Обновляем статус пользователя на "inactive" (не в поиске)
      await redisClient.set(`status:${socket.id}`, 'inactive', 'EX', config.REDIS_STATUS_TTL_SECONDS);
      // Оповещаем обоих участников, что чат завершен
      const sessionKey = `session:${roomId}`;
      const session = await redisClient.hgetall(sessionKey);
      if (session && (session.userA || session.userB)) {
        if (session.userA) io.to(session.userA).emit('chatEnded');
        if (session.userB) io.to(session.userB).emit('chatEnded');
      }
      // Удаляем запись сессии и покидаем комнату
      await redisClient.del(sessionKey);
      socket.leave(roomId);
      console.log(`🏁 Чат ${roomId} завершён пользователем ${socket.id}`);
    });

    // Обработка отключения пользователя
    socket.on('disconnect', async () => {
      console.log(`❌ Отключился клиент ${socket.id}`);
      await redisClient.del(`status:${socket.id}`);
      // Здесь можно добавить очистку из очередей (если пользователь покинул сайт, но остался в очереди)
    });
  });
}