// src/config/redis.ts
import Redis from 'ioredis';

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

//log
redisClient.on('connect', () => console.log('✅ Connected to Redis'));
redisClient.on('error', err => console.error('❌ Ошибка Redis:', err));
