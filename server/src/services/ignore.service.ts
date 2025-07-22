import { redisClient } from '../config/redis';
import { config } from '../config/constants';

/**
 * Помещает пару пользователей в игнор друг к другу на время TTL.
 * Ключ в Redis строится из отсортированных anonClientId (чтобы (A,B) и (B,A) не дублировались).
 */
export async function ignoreUser(idA: string, idB: string): Promise<string> {
  const [id1, id2] = [idA, idB].sort();
  const key = `chat:ignore:${id1}:${id2}`;
  // Устанавливаем ключ с TTL (секунды из config.IGNORE_TTL_SECONDS)
  await redisClient.set(key, '1', 'EX', config.IGNORE_TTL_SECONDS);
  return key;
}

/**
 * Проверяет, находится ли пара anonClientId в игноре.
 * Возвращает true, если ключ игнора существует в Redis.
 */
export async function isIgnored(idA: string, idB: string): Promise<boolean> {
  const [id1, id2] = [idA, idB].sort();
  const key = `chat:ignore:${id1}:${id2}`;
  const exists = await redisClient.exists(key);
  console.log(`🔍 Проверка игнора: ${id1} и ${id2} -> exists=${exists}`);
  return exists === 1;
}
