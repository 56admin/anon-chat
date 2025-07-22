import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import FileController from '../controllers/file.controller';

// Настраиваем хранилище для multer: сохранять в папку 'uploads' с уникальным именем
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  // папка хранения (относительно корня сервера)
  },
  filename: (req, file, cb) => {
    // Генерируем уникальный файлнейм (UUID + оригинальное расширение)
    const ext = path.extname(file.originalname);
    const filename = uuidv4() + ext;
    cb(null, filename);
  }
});
const upload = multer({ storage });

const router = Router();

// Загрузка файла (ожидается поле 'file' в форме)
router.post('/upload', upload.single('file'), FileController.uploadFile);

// Получение файла по ID (имя файла)
router.get('/file/:fileId', FileController.getFile);

export default router;