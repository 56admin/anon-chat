FROM node:20

# Рабочая директория
WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm install

# Копируем остальное
COPY . .

# Открываем порт для dev-сервера
EXPOSE 3000

# Запуск приложения
CMD ["npm", "start"]