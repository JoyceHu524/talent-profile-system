const path = require('path');
const fs = require('fs');
const config = require('./config');

let db;

function getDb() {
  if (!db) {
    // 优先用 better-sqlite3，失败则用 sql.js
    try {
      const Database = require('better-sqlite3');
      db = new Database(config.dbPath);
      db._isBetterSqlite3 = true;
      initDb(db);
    } catch (e) {
      console.log('better-sqlite3 不可用，使用 sql.js:', e.message);
      db = createSqlJsDb();
      db._isBetterSqlite3 = false;
      initSqlJsDb(db);
    }
  }
  return db;
}

function createSqlJsDb() {
  const initSqlJs = require('sql.js');
  // sql.js 是同步加载，但 initSqlJs 是异步的——用同步包装
  // 实际上我们在启动时初始化，用一个简单的同步包装器
  throw new Error('请使用 initDbAsync()');
}

// 重新设计：统一使用异步初始化
let dbReady = false;
let dbInstance = null;
let dbQueue = [];

async function initDatabase() {
  if (dbInstance) return dbInstance;

  try {
    const Database = require('better-sqlite3');
    dbInstance = new Database(config.dbPath);
    setupSchema(dbInstance, 'better-sqlite3');
    dbReady = true;
    console.log('✅ 数据库启动 (better-sqlite3)');
    return dbInstance;
  } catch (e) {
    console.log('better-sqlite3 不可用，切换 sql.js:', e.message);
  }

  // 用 sql.js 作为 fallback
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  // 尝试从文件读取已有数据库
  let fileBuffer = null;
  if (fs.existsSync(config.dbPath)) {
    fileBuffer = fs.readFileSync(config.dbPath);
  }

  const sqlJsDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  
  // 包装成类似 better-sqlite3 的接口
  dbInstance = wrapSqlJs(sqlJsDb, config.dbPath);
  setupSchema(dbInstance, 'sql.js');
  dbReady = true;
  console.log('✅ 数据库启动 (sql.js)');
  return dbInstance;
}

function wrapSqlJs(sqlJsDb, dbPath) {
  // 定期保存到磁盘
  function persist() {
    try {
      const data = sqlJsDb.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch(e) { /* ignore */ }
  }

  return {
    _sqlJsDb: sqlJsDb,
    _isSqlJs: true,
    prepare(sql) {
      return {
        run(...args) {
          try {
            sqlJsDb.run(sql, args);
            persist();
            // 获取 lastInsertRowid
            const result = sqlJsDb.exec('SELECT last_insert_rowid() as id');
            const lastId = result[0] ? result[0].values[0][0] : 0;
            return { lastInsertRowid: lastId, changes: 1 };
          } catch(e) {
            throw e;
          }
        },
        get(...args) {
          try {
            const result = sqlJsDb.exec(sql, args);
            if (!result[0]) return undefined;
            const cols = result[0].columns;
            const vals = result[0].values[0];
            if (!vals) return undefined;
            const obj = {};
            cols.forEach((c, i) => obj[c] = vals[i]);
            return obj;
          } catch(e) { return undefined; }
        },
        all(...args) {
          try {
            const result = sqlJsDb.exec(sql, args);
            if (!result[0]) return [];
            const cols = result[0].columns;
            return result[0].values.map(vals => {
              const obj = {};
              cols.forEach((c, i) => obj[c] = vals[i]);
              return obj;
            });
          } catch(e) { return []; }
        }
      };
    },
    exec(sql) {
      sqlJsDb.run(sql);
      persist();
    },
    pragma(sql) {
      try { sqlJsDb.run(`PRAGMA ${sql}`); } catch(e) { /* ignore */ }
    }
  };
}

function setupSchema(db, type) {
  if (type === 'better-sqlite3') {
    db.pragma('journal_mode = WAL');
  }

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

  console.log('数据库 schema 初始化完成');
}

// 兼容旧的 getDb() 调用
function getDb() {
  if (!dbInstance) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return dbInstance;
}

module.exports = { getDb, initDatabase };
