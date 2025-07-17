// server/config.js

export const config = {
    AFK_TIMEOUT_SECONDS: 300,              // Через сколько секунд считаем пользователя "мертвым" (TTL в Redis)
    REDIS_STATUS_TTL_SECONDS: 300,         // Сколько хранить статус подключения (matching, waiting, etc.)
    SEARCH_RETRY_INTERVAL_MS: 1000,        // Интервал повторного поиска пары, если сразу не нашлось
    MAX_QUEUE_LIFETIME_SECONDS: 600,       // Через сколько автоочищать старые очереди
    IGNORE_TTL_SECONDS: 3600,              // Сколько секунд игнорируем через кнопку "Игнорировать собеседника"
  }