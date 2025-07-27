import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import FileController from '../controllers/file.controller';

const router = Router();

// Настраиваем хранилище для Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({ storage });

// Загрузка фото в чат (цензура по флагу isAdult)
router.post('/chat/:conversationId/upload-photo', upload.single('file'), FileController.uploadPhoto);

// Получение файла (для <img src="...">)
router.get('/file/:fileId', FileController.getFile);

export default router;
