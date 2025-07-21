// server/redisIgnore.js

import { config } from './config.js'

/**
 * Помещает пару пользователей в игнор друг к другу на время TTL.
 * Использует отсортированные anonClientId, чтобы не было дублей для пары.
 * 
 * @param {Redis} redis      - клиент Redis
 * @param {string} idA       - anonClientId первого пользователя
 * @param {string} idB       - anonClientId второго пользователя
 * @returns {string}         - ключ, по которому хранится игнор в Redis
 */
export async function ignoreUser(redis, idA, idB) {
  // Сортируем ID, чтобы ключ был одинаковым для (A,B) и (B,A)
  const [id1, id2] = [idA, idB].sort();
  const key = `chat:ignore:${id1}:${id2}`;
  // Сохраняем ключ с TTL (автоматически исчезнет через config.IGNORE_TTL_SECONDS)
  await redis.set(key, "1", "EX", config.IGNORE_TTL_SECONDS);
  return key;
}

/**
 * Проверяет, находится ли пара пользователей в режиме игнора.
 * 
 * @param {Redis} redis      - клиент Redis
 * @param {string} idA       - anonClientId первого пользователя
 * @param {string} idB       - anonClientId второго пользователя
 * @returns {boolean}        - true (1), если есть игнор, иначе false (0)
 */
export async function isIgnored(redis, idA, idB) {
    const [id1, id2] = [idA, idB].sort();
    const key = `chat:ignore:${id1}:${id2}`;
    const exists = await redis.exists(key);
    console.log(`🔍 Проверка игнора: ${id1} и ${id2} → exists=${exists}`);
    return exists;
  }