import { Request, Response } from 'express';
import path from 'path';

class FileController {
  /** POST /api/upload – загрузка файла (обработка через multer) */
  async uploadFile(req: Request, res: Response) {
    // Файл уже сохранён multer-ом в папку 'uploads/'
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Возвращаем клиенту идентификатор файла (имя файла на сервере)
    return res.json({ fileId: file.filename });
  }

  /** GET /api/file/:fileId – получение файла по ID */
  async getFile(req: Request, res: Response) {
    try {
      const fileId = req.params.fileId;
      const filePath = path.join(process.cwd(), 'uploads', fileId);
      return res.sendFile(filePath);
    } catch (err) {
      console.error('❌ Файл не найден:', err);
      return res.status(404).json({ error: 'File not found' });
    }
  }
}

export default new FileController();