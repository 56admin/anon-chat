import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
//import sharp from 'sharp';
import { Conversation } from '../models/conversation.model';

class FileController {
  /**
   * Загрузка изображения в чат
   * Если чат не 18+ — применяем размытие через sharp
   */
  static async uploadPhoto(req: Request, res: Response) {
    const { conversationId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Нет файла' });
    }

    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const isAdult = conv.isAdult;
    const originalPath = file.path;

    // если чат не 18+ — цензура
    if (!isAdult) {
      const blurredPath = file.path + '_blurred.jpg';
      //await sharp(file.path).blur(20).toFile(blurredPath);
      await fs.unlink(file.path); // удаляем оригинал
      await fs.rename(blurredPath, originalPath); // сохраняем замыленное
    }

    return res.json({ fileId: path.basename(originalPath) });
  }

  /**
   * Отдача файла по ID
   */
  static async getFile(req: Request, res: Response) {
    const { fileId } = req.params;
    const fullPath = path.resolve('uploads', fileId);
    res.sendFile(fullPath);
  }
}

export default FileController;
