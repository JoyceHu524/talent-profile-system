const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const config = require('../config');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '请先登录' });
  next();
}

// Mock AI分析 - 生成随机分值和模板文字
function mockAiAnalysis(person, files, existingScores) {
  const dimensions = config.dimensions;

  // 生成各维度分值（2.5-4.5之间，模拟真实评分）
  const scores = dimensions.map(dim => {
    const base = 2.5 + Math.random() * 2;
    const score = parseFloat(base.toFixed(1));

    const summaries = {
      '自驱力': `${person.name}在自驱力方面表现${score >= 3.5 ? '突出' : '良好'}，能够主动识别工作中的机会和挑战，不依赖外部驱动力。在${person.position || '工作'}中展现出较强的主动性和内驱力。`,
      '学习速度': `${person.name}的学习速度${score >= 4 ? '非常快' : '较快'}，能够快速吸收新知识并应用到实际工作中。对新领域有较强的适应能力，善于从实践中总结经验。`,
      '跨界影响力': `在跨部门合作和影响力建设方面，${person.name}${score >= 3.5 ? '表现出色' : '有一定基础'}，能够在不同业务条线之间有效沟通协调，建立广泛的合作关系。`,
      '战略视角': `${person.name}展现出${score >= 4 ? '较强的' : '初步的'}战略思维能力，能够从全局角度看待问题，理解业务发展方向，在日常决策中有一定的前瞻性。`,
      '带人与激励': `在团队管理方面，${person.name}${score >= 3.5 ? '具备较好的' : '正在培养'}带人能力，能够有效激励团队成员，关注下属的发展，帮助团队成员成长。`,
      '抗压韧性': `面对压力和挑战时，${person.name}表现${score >= 3.5 ? '出色' : '稳定'}，能够保持积极心态，在高强度工作环境下维持稳定的输出质量，具备良好的情绪调节能力。`,
      '业务洞察': `${person.name}对所在业务有${score >= 4 ? '深入' : '较好'}的理解，能够洞察业务关键驱动因素，从数据和现象中发现问题本质，提出有价值的业务改进建议。`,
      '主动向上对齐': `在向上管理方面，${person.name}${score >= 3.5 ? '表现优秀' : '表现良好'}，能够主动与上级沟通汇报，理解组织目标，确保个人工作方向与团队目标一致。`
    };

    return {
      dimension: dim,
      ai_score: score,
      score: score,
      summary: summaries[dim] || `${person.name}在${dim}维度表现良好。`
    };
  });

  const avgScore = (scores.reduce((sum, s) => sum + s.score, 0) / scores.length).toFixed(2);
  const topDims = scores.sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.dimension);
  const weakDims = [...scores].sort((a, b) => a.score - b.score).slice(0, 2).map(s => s.dimension);

  const overallReport = `## ${person.name} 综合人才画像分析报告

**基本信息**：${person.name}，${person.gender || '—'}，${person.age ? person.age + '岁' : '—'}，${person.education || '—'}学历，现任${person.position || '—'}，所属${person.business_line || '—'}业务线，入池期次：${person.cohort || '—'}。

**综合评估**：综合各维度评估，${person.name}整体画像评分为 **${avgScore}/5.0**，在高潜人才群体中处于${avgScore >= 3.8 ? '较高' : avgScore >= 3.2 ? '中等' : '待发展'}水平。

**核心优势**：${person.name}在 **${topDims.join('、')}** 等维度表现突出，展现出高潜人才的核心特质。特别是在${topDims[0]}方面，已达到优秀管理者的素质要求。

**发展空间**：在 **${weakDims.join('、')}** 维度仍有较大提升空间，建议重点关注并提供针对性的发展支持。

**潜力评估**：综合判断，${person.name}具有${avgScore >= 3.8 ? '较强' : '一定'}的领导力发展潜力，建议${avgScore >= 3.8 ? '加大培养投入，考虑加速发展计划' : '持续关注成长，提供有针对性的发展机会'}。`;

  const developmentSuggestions = `## 发展建议

### 近期行动计划（0-6个月）
1. **强化${weakDims[0]}能力**：建议参加专项培训课程，同时在日常工作中主动寻找相关锻炼机会
2. **深化${topDims[0]}优势**：在现有基础上进一步强化，可考虑承担导师角色，辐射影响团队
3. **跨部门轮岗**：建议安排1-2次跨业务线的项目协作，拓宽视野和人际网络

### 中期发展计划（6-18个月）
1. **承担更大范围的领导责任**：可考虑在下期周期内给予更大业务模块的管理职责
2. **战略项目历练**：参与或主导公司级战略项目，提升战略视角和全局思维
3. **建立外部影响力**：鼓励参与行业交流、内部分享等活动，建立更广泛的影响力

### 发展支持建议
- **上级支持**：${person.leader_name || '上级'}需加强1对1辅导频率，重点在${weakDims[0]}方面给予反馈
- **培训资源**：推荐参加领导力发展项目，重点模块：${weakDims.join('、')}
- **里程碑评估**：建议在6个月后进行阶段性评估，验证发展成效`;

  return {
    scores: scores.map(s => ({ ...s, score: s.ai_score })),
    overallReport,
    developmentSuggestions
  };
}

// 触发AI分析
router.post('/:id/analyze', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!person) return res.status(404).json({ error: '人员不存在' });

    const files = db.prepare('SELECT * FROM files WHERE person_id = ?').all(req.params.id);
    const existingScores = db.prepare('SELECT * FROM dimension_scores WHERE person_id = ?').all(req.params.id);

    // 模拟分析延迟（1.5秒）
    await new Promise(resolve => setTimeout(resolve, 1500));

    const analysis = mockAiAnalysis(person, files, existingScores);

    // 保存维度评分
    const updateScore = db.prepare(`
      INSERT INTO dimension_scores (person_id, dimension, score, ai_score, summary, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(person_id, dimension) DO UPDATE SET
        ai_score = excluded.ai_score,
        score = excluded.score,
        summary = excluded.summary,
        updated_at = CURRENT_TIMESTAMP
    `);

    analysis.scores.forEach(s => {
      updateScore.run(req.params.id, s.dimension, s.score, s.ai_score, s.summary);
    });

    // 保存综合报告
    db.prepare(`
      INSERT INTO reports (person_id, overall_report, development_suggestions, ai_analyzed_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(person_id) DO UPDATE SET
        overall_report = excluded.overall_report,
        development_suggestions = excluded.development_suggestions,
        ai_analyzed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(req.params.id, analysis.overallReport, analysis.developmentSuggestions);

    res.json({
      success: true,
      message: 'AI分析完成',
      data: {
        scores: analysis.scores,
        overallReport: analysis.overallReport,
        developmentSuggestions: analysis.developmentSuggestions
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
