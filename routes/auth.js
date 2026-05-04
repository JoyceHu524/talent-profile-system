const express = require('express');
const router = express.Router();
const config = require('../config');

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.admin.username && password === config.admin.password) {
    req.session.user = { username, role: 'admin' };
    res.json({ success: true, message: '登录成功' });
  } else {
    res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 检查登录状态
router.get('/status', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;
