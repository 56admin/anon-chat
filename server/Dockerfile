# Используем официальный Node.js 20 образ
FROM node:20

WORKDIR /app

# Копируем package.json и tsconfig.json и устанавливаем зависимости
COPY package*.json tsconfig.json ./
#RUN npm install sharp
RUN npm install

# Копируем весь исходный код
COPY . .

# Создаем папку для загружаемых файлов
RUN mkdir -p uploads

EXPOSE 3001

# Запускаем сервер (ts-node)
CMD ["npm", "run", "dev"]