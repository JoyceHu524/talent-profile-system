module.exports = {
  port: process.env.PORT || 3000,
  sessionSecret: 'talent-profile-secret-2024',
  admin: {
    username: 'admin',
    password: 'talent2024'
  },
  uploadDir: './uploads',
  dbPath: './talent.db',
  dimensions: [
    '自驱力',
    '学习速度',
    '跨界影响力',
    '战略视角',
    '带人与激励',
    '抗压韧性',
    '业务洞察',
    '主动向上对齐'
  ]
};
