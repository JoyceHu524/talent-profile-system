const Database = require('better-sqlite3');
const config = require('./config');

let db;

function getDb() {
  if (!db) {
    db = new Database(config.dbPath);
    initDb(db);
  }
  return db;
}

function initDb(db) {
  // 开启WAL模式提升性能
  db.pragma('journal_mode = WAL');

  // 人员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT,
      age INTEGER,
      education TEXT,
      position TEXT,
      business_line TEXT,
      cohort TEXT,
      total_years REAL,
      meituan_years REAL,
      leader_name TEXT,
      notes TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 维度评分表
  db.exec(`
    CREATE TABLE IF NOT EXISTS dimension_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      score REAL DEFAULT 0,
      ai_score REAL DEFAULT 0,
      summary TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      UNIQUE(person_id, dimension)
    )
  `);

  // 综合报告表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL UNIQUE,
      overall_report TEXT,
      development_suggestions TEXT,
      ai_analyzed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  // 文件表
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      extracted_text TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  console.log('数据库初始化完成');
}

module.exports = { getDb };
