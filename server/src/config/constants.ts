export const config = {
    AFK_TIMEOUT_SECONDS: 300,       // Через сколько секунд считаем пользователя "AFK"
    REDIS_STATUS_TTL_SECONDS: 300,  // TTL для статуса подключения в Redis
    SEARCH_RETRY_INTERVAL_MS: 1000, // Интервал повторного поиска пары (непосредственно не используется в коде)
    MAX_QUEUE_LIFETIME_SECONDS: 600, // Через сколько секунд очищать старые очереди (непосредственно не используется)
    IGNORE_TTL_SECONDS: 3600       // Время игнорирования собеседника (секунд)
  };