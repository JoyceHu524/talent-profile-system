const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { initDatabase } = require('./database');

// 确保上传目录存在
fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session配置
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/people', require('./routes/people'));
app.use('/api/people', require('./routes/files'));
app.use('/api/analysis', require('./routes/analysis'));

// 根路径重定向到登录页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA路由支持
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});
app.get('/group', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'group.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 启动服务器（先初始化数据库）
initDatabase().then(() => {
  app.listen(config.port, () => {
    console.log(`✅ 高潜人才画像系统已启动`);
    console.log(`📍 访问地址: http://localhost:${config.port}`);
    console.log(`🔑 登录账号: ${config.admin.username} / ${config.admin.password}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

module.exports = app;
