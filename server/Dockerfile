# Используем официальный Node.js образ
FROM node:20

# Устанавливаем рабочую директорию в контейнере
WORKDIR /app

# Копируем package.json и package-lock.json (если есть) для установки зависимостей
COPY package*.json ./

# Устанавливаем зависимости через npm
RUN npm install

# Копируем остальной код (index.js и т.д.) в контейнер
COPY . .

# Открываем порт (для документации и дебага)
EXPOSE 3001

# Запускаем приложение
CMD ["npm", "run", "dev"]