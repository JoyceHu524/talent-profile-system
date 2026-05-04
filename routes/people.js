const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const config = require('../config');

// 认证中间件
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

// 计算画像完成度
function calcCompleteness(person, scores, report, files) {
  let total = 0;
  let filled = 0;

  // 基础信息（占30%）
  const basicFields = ['name', 'gender', 'age', 'education', 'position', 'business_line', 'cohort'];
  basicFields.forEach(f => {
    total += 1;
    if (person[f]) filled += 1;
  });

  // 维度评分（占40%）
  total += config.dimensions.length;
  const scoredDims = scores.filter(s => s.score > 0).length;
  filled += scoredDims;

  // 报告（占20%）
  total += 2;
  if (report && report.overall_report) filled += 1;
  if (report && report.development_suggestions) filled += 1;

  // 文件上传（占10%）
  total += 2;
  if (files && files.length > 0) filled += 1;
  if (files && files.length >= 2) filled += 1;

  return Math.round((filled / total) * 100);
}

// 获取所有人员列表
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { year, business_line, status, search } = req.query;

    let query = 'SELECT * FROM people WHERE 1=1';
    const params = [];

    if (year) {
      query += ' AND cohort LIKE ?';
      params.push(`%${year}%`);
    }
    if (business_line) {
      query += ' AND business_line = ?';
      params.push(business_line);
    }
    if (search) {
      query += ' AND (name LIKE ? OR position LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const people = db.prepare(query).all(...params);

    // 获取每个人的完成度
    const result = people.map(person => {
      const scores = db.prepare('SELECT * FROM dimension_scores WHERE person_id = ?').all(person.id);
      const report = db.prepare('SELECT * FROM reports WHERE person_id = ?').get(person.id);
      const files = db.prepare('SELECT id FROM files WHERE person_id = ?').all(person.id);
      const completeness = calcCompleteness(person, scores, report, files);

      return {
        ...person,
        completeness,
        has_scores: scores.filter(s => s.score > 0).length > 0
      };
    });

    // 按状态筛选
    let filtered = result;
    if (status === 'complete') {
      filtered = result.filter(p => p.completeness >= 80);
    } else if (status === 'partial') {
      filtered = result.filter(p => p.completeness > 0 && p.completeness < 80);
    } else if (status === 'empty') {
      filtered = result.filter(p => p.completeness === 0 || !p.has_scores);
    }

    res.json({ success: true, data: filtered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 获取单个人员详情
router.get('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!person) return res.status(404).json({ error: '未找到该人员' });

    const scores = db.prepare('SELECT * FROM dimension_scores WHERE person_id = ?').all(req.params.id);
    const report = db.prepare('SELECT * FROM reports WHERE person_id = ?').get(req.params.id);
    const files = db.prepare('SELECT * FROM files WHERE person_id = ? ORDER BY uploaded_at DESC').all(req.params.id);
    const completeness = calcCompleteness(person, scores, report, files);

    res.json({
      success: true,
      data: {
        ...person,
        scores,
        report: report || {},
        files,
        completeness
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增人员
router.post('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const {
      name, gender, age, education, position, business_line,
      cohort, total_years, meituan_years, leader_name, notes
    } = req.body;

    if (!name) return res.status(400).json({ error: '姓名不能为空' });

    const stmt = db.prepare(`
      INSERT INTO people (name, gender, age, education, position, business_line,
        cohort, total_years, meituan_years, leader_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name, gender || null, age || null, education || null,
      position || null, business_line || null, cohort || null,
      total_years || null, meituan_years || null,
      leader_name || null, notes || null
    );

    // 初始化维度评分
    const insertScore = db.prepare(`
      INSERT OR IGNORE INTO dimension_scores (person_id, dimension, score, ai_score)
      VALUES (?, ?, 0, 0)
    `);
    config.dimensions.forEach(dim => {
      insertScore.run(result.lastInsertRowid, dim);
    });

    // 初始化报告
    db.prepare(`
      INSERT OR IGNORE INTO reports (person_id, overall_report, development_suggestions)
      VALUES (?, '', '')
    `).run(result.lastInsertRowid);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新人员信息
router.put('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const {
      name, gender, age, education, position, business_line,
      cohort, total_years, meituan_years, leader_name, notes
    } = req.body;

    db.prepare(`
      UPDATE people SET
        name = ?, gender = ?, age = ?, education = ?,
        position = ?, business_line = ?, cohort = ?,
        total_years = ?, meituan_years = ?, leader_name = ?,
        notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, gender || null, age || null, education || null,
      position || null, business_line || null, cohort || null,
      total_years || null, meituan_years || null,
      leader_name || null, notes || null, req.params.id
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除人员
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新维度评分
router.put('/:id/scores', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { scores } = req.body; // [{dimension, score, summary}]

    const stmt = db.prepare(`
      UPDATE dimension_scores SET score = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
      WHERE person_id = ? AND dimension = ?
    `);

    scores.forEach(s => {
      stmt.run(s.score, s.summary || '', req.params.id, s.dimension);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新综合报告
router.put('/:id/report', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { overall_report, development_suggestions } = req.body;

    db.prepare(`
      INSERT INTO reports (person_id, overall_report, development_suggestions, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(person_id) DO UPDATE SET
        overall_report = excluded.overall_report,
        development_suggestions = excluded.development_suggestions,
        updated_at = CURRENT_TIMESTAMP
    `).run(req.params.id, overall_report || '', development_suggestions || '');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取群体分析数据
router.get('/group/analysis', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { cohort, business_line } = req.query;

    let query = 'SELECT * FROM people WHERE 1=1';
    const params = [];

    if (cohort) {
      query += ' AND cohort LIKE ?';
      params.push(`%${cohort}%`);
    }
    if (business_line) {
      query += ' AND business_line = ?';
      params.push(business_line);
    }

    const people = db.prepare(query).all(...params);

    const result = people.map(person => {
      const scores = db.prepare('SELECT * FROM dimension_scores WHERE person_id = ?').all(person.id);
      const scoresMap = {};
      scores.forEach(s => { scoresMap[s.dimension] = s.score; });
      return { ...person, scores: scoresMap };
    });

    // 计算各维度均值
    const avgScores = {};
    config.dimensions.forEach(dim => {
      const vals = result.map(p => p.scores[dim] || 0).filter(v => v > 0);
      avgScores[dim] = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0;
    });

    res.json({
      success: true,
      data: {
        people: result,
        avgScores,
        total: result.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
