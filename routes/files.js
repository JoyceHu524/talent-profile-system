const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database');
const config = require('../config');

// 认证中间件
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '请先登录' });
  next();
}

// 配置multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const personId = req.params.id;
    const dir = path.join(config.uploadDir, personId.toString());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const safeName = `${timestamp}_${Math.random().toString(36).substr(2, 6)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      '.xlsx', '.csv', '.pdf', '.docx', '.txt',
      '.mp3', '.wav', '.m4a', '.mp4'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`不支持的文件类型: ${ext}`));
  }
});

// 判断文件类型分类
function getFileCategory(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.xlsx', '.csv'].includes(ext)) return 'excel';
  if (ext === '.pdf') return 'pdf';
  if (['.mp3', '.wav', '.m4a', '.mp4'].includes(ext)) return 'audio';
  if (['.docx', '.txt'].includes(ext)) return 'doc';
  return 'other';
}

// 上传文件
router.post('/:id/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有上传文件' });

    const db = getDb();
    const person = db.prepare('SELECT id FROM people WHERE id = ?').get(req.params.id);
    if (!person) return res.status(404).json({ error: '人员不存在' });

    const fileCategory = req.body.file_type || getFileCategory(req.file.originalname);
    let extractedText = '';

    // 尝试提取文本内容
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(dataBuffer);
        extractedText = pdfData.text.substring(0, 5000); // 最多5000字
      } catch (e) {
        console.log('PDF解析失败:', e.message);
        extractedText = '(PDF解析失败)';
      }
    } else if (ext === '.txt') {
      try {
        extractedText = fs.readFileSync(req.file.path, 'utf8').substring(0, 5000);
      } catch (e) {
        extractedText = '';
      }
    } else if (['.mp3', '.wav', '.m4a'].includes(ext)) {
      extractedText = '(音频转写功能待接入)';
    }

    const result = db.prepare(`
      INSERT INTO files (person_id, file_type, original_name, stored_name, file_path, file_size, extracted_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      fileCategory,
      req.file.originalname,
      req.file.filename,
      req.file.path,
      req.file.size,
      extractedText
    );

    res.json({
      success: true,
      file: {
        id: result.lastInsertRowid,
        original_name: req.file.originalname,
        file_type: fileCategory,
        file_size: req.file.size,
        uploaded_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 获取人员的文件列表
router.get('/:id/files', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const files = db.prepare(
      'SELECT id, file_type, original_name, file_size, uploaded_at FROM files WHERE person_id = ? ORDER BY uploaded_at DESC'
    ).all(req.params.id);
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除文件
router.delete('/:personId/files/:fileId', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND person_id = ?').get(
      req.params.fileId, req.params.personId
    );
    if (!file) return res.status(404).json({ error: '文件不存在' });

    // 删除物理文件
    try {
      fs.unlinkSync(file.file_path);
    } catch (e) {
      console.log('物理文件删除失败:', e.message);
    }

    db.prepare('DELETE FROM files WHERE id = ?').run(req.params.fileId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 下载文件
router.get('/:personId/files/:fileId/download', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND person_id = ?').get(
      req.params.fileId, req.params.personId
    );
    if (!file) return res.status(404).json({ error: '文件不存在' });

    res.download(file.file_path, file.original_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
