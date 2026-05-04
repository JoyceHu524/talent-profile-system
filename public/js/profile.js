// ============================================
// profile.js - 个人档案页逻辑
// ============================================

const DIMENSIONS = ['自驱力','学习速度','跨界影响力','战略视角','带人与激励','抗压韧性','业务洞察','主动向上对齐'];
let personId = null;
let personData = null;
let radarChart = null;
let currentScores = {};

// 初始化
checkAuth(() => {
  personId = getUrlParam('id');
  if (!personId) {
    showToast('缺少人员ID', 'error');
    setTimeout(() => window.location.href = '/dashboard', 1500);
    return;
  }
  loadProfile();
});

// 加载个人档案
async function loadProfile() {
  try {
    const res = await fetch(`/api/people/${personId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    personData = data.data;
    renderBasicInfo(personData);
    renderFiles(personData.files || []);
    renderDimensions(personData.scores || []);
    renderReport(personData.report || {});
    initRadarChart(personData.scores || []);

    document.getElementById('breadcrumbName').textContent = personData.name;

    if (personData.report && personData.report.ai_analyzed_at) {
      const d = new Date(personData.report.ai_analyzed_at);
      document.getElementById('lastAnalyzedAt').textContent =
        `上次分析：${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
  }
}

// 渲染基础信息
function renderBasicInfo(p) {
  document.getElementById('avatarInitial').textContent = p.name ? p.name[0] : '?';
  document.getElementById('infoName').textContent = p.name || '—';
  document.getElementById('infoPosition').textContent = p.position || '—';

  const items = [
    { label: '性别', value: p.gender },
    { label: '年龄', value: p.age ? p.age + '岁' : null },
    { label: '学历', value: p.education },
    { label: '业务线', value: p.business_line },
    { label: '入池期次', value: p.cohort },
    { label: '总工龄', value: p.total_years ? p.total_years + '年' : null },
    { label: '美团工龄', value: p.meituan_years ? p.meituan_years + '年' : null },
    { label: 'Leader', value: p.leader_name },
    { label: '备注', value: p.notes },
  ];

  document.getElementById('infoList').innerHTML = items
    .filter(i => i.value)
    .map(i => `
      <div class="info-item">
        <span class="info-label">${i.label}</span>
        <span class="info-value">${i.value}</span>
      </div>
    `).join('');
}

// 渲染文件列表
function renderFiles(files) {
  const byType = { excel: [], pdf: [], audio: [], doc: [] };
  files.forEach(f => {
    const t = f.file_type;
    if (byType[t]) byType[t].push(f);
    else byType['doc'].push(f);
  });

  Object.keys(byType).forEach(type => {
    const el = document.getElementById('fileList-' + type);
    if (!el) return;
    if (byType[type].length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = byType[type].map(f => `
      <div class="file-item" id="file-${f.id}">
        <span class="file-item-name" title="${f.original_name}">${f.original_name}</span>
        <span class="file-item-date">${formatDate(f.uploaded_at)}</span>
        <span class="file-size">${formatFileSize(f.file_size)}</span>
        <button class="file-item-del" onclick="deleteFile(${f.id})" title="删除">✕</button>
      </div>
    `).join('');
  });
}

// 渲染维度分值卡片
function renderDimensions(scores) {
  const scoreMap = {};
  scores.forEach(s => { scoreMap[s.dimension] = s; });

  document.getElementById('dimensionsGrid').innerHTML = DIMENSIONS.map(dim => {
    const s = scoreMap[dim] || { score: 0, ai_score: 0, summary: '' };
    currentScores[dim] = s.score;
    const pct = (s.score / 5) * 100;
    const color = getScoreColor(s.score);

    return `
      <div class="dim-card">
        <div class="dim-header">
          <span class="dim-name">${dim}</span>
        </div>
        <div class="dim-score-area">
          <span class="dim-score-current" style="color:${color}" id="scoreDisplay-${dim}">${s.score || '—'}</span>
          <span class="dim-score-sep">/ 5</span>
          ${s.ai_score > 0 ? `<span class="dim-score-ai">AI建议: ${s.ai_score}</span>` : ''}
          <span style="margin-left:auto;">
            <input type="number" class="score-input" id="scoreInput-${dim}"
              value="${s.score || ''}" min="1" max="5" step="0.5"
              placeholder="—"
              onchange="updateScoreDisplay('${dim}', this.value)"
              onblur="saveScore('${dim}', this.value)">
          </span>
        </div>
        <div class="dim-bar">
          <div class="dim-bar-fill" id="scoreBar-${dim}" style="width:${pct}%; background:${color}"></div>
        </div>
        <div class="dim-summary" id="scoreSummary-${dim}">${s.summary || '暂无分析'}</div>
      </div>
    `;
  }).join('');
}

// 更新分数显示
function updateScoreDisplay(dim, val) {
  const score = parseFloat(val) || 0;
  const color = getScoreColor(score);
  const el = document.getElementById('scoreDisplay-' + dim);
  const bar = document.getElementById('scoreBar-' + dim);
  if (el) { el.textContent = score || '—'; el.style.color = color; }
  if (bar) { bar.style.width = (score / 5 * 100) + '%'; bar.style.background = color; }
  currentScores[dim] = score;
  updateRadarChart();
}

// 保存单个维度分值
async function saveScore(dim, val) {
  const score = parseFloat(val);
  if (isNaN(score) || score < 1 || score > 5) return;

  try {
    const allScores = DIMENSIONS.map(d => ({
      dimension: d,
      score: d === dim ? score : (currentScores[d] || 0),
      summary: document.getElementById('scoreSummary-' + d)?.textContent || ''
    }));

    await fetch(`/api/people/${personId}/scores`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores: allScores })
    });
    showToast(`${dim} 已保存`, 'success', 1500);
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

// 渲染报告
function renderReport(report) {
  document.getElementById('overallReport').value = report.overall_report || '';
  document.getElementById('developmentSuggestions').value = report.development_suggestions || '';
}

// 保存报告
async function saveReport() {
  try {
    await fetch(`/api/people/${personId}/report`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overall_report: document.getElementById('overallReport').value,
        development_suggestions: document.getElementById('developmentSuggestions').value
      })
    });
    showToast('报告已保存', 'success');
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

// 初始化雷达图
function initRadarChart(scores) {
  const scoreMap = {};
  scores.forEach(s => { scoreMap[s.dimension] = s.score; });
  const values = DIMENSIONS.map(d => scoreMap[d] || 0);

  const ctx = document.getElementById('radarChart').getContext('2d');
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: DIMENSIONS,
      datasets: [{
        label: '当前评分',
        data: values,
        backgroundColor: 'rgba(37,99,235,0.15)',
        borderColor: '#2563EB',
        borderWidth: 2,
        pointBackgroundColor: '#2563EB',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0, max: 5,
          ticks: { stepSize: 1, font: { size: 10 } },
          pointLabels: { font: { size: 11 } },
          grid: { color: '#E2E8F0' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// 更新雷达图
function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = DIMENSIONS.map(d => currentScores[d] || 0);
  radarChart.update();
}

// 触发上传
function triggerUpload(type) {
  document.getElementById('fileInput-' + type).click();
}

// 上传文件
async function uploadFile(input, type) {
  const files = input.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', type);

    try {
      showToast(`上传中: ${file.name}`, 'info', 2000);
      const res = await fetch(`/api/people/${personId}/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast(`上传成功: ${file.name}`, 'success');
        // 刷新文件列表
        loadFiles();
      } else {
        showToast('上传失败: ' + (data.error || '未知错误'), 'error');
      }
    } catch (err) {
      showToast('上传失败: ' + err.message, 'error');
    }
  }
  input.value = '';
}

// 加载文件列表
async function loadFiles() {
  try {
    const res = await fetch(`/api/people/${personId}/files`);
    const data = await res.json();
    if (data.success) renderFiles(data.data);
  } catch (err) {
    console.error(err);
  }
}

// 删除文件
async function deleteFile(fileId) {
  if (!confirm('确认删除该文件？')) return;
  try {
    const res = await fetch(`/api/people/${personId}/files/${fileId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('file-' + fileId)?.remove();
      showToast('文件已删除', 'success');
    }
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// 触发AI分析
async function triggerAnalysis() {
  const btn = document.getElementById('analyzeBtn');
  const indicator = document.getElementById('analyzingIndicator');

  btn.disabled = true;
  btn.style.display = 'none';
  indicator.style.display = 'flex';

  try {
    const res = await fetch(`/api/analysis/${personId}/analyze`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast('AI分析完成！', 'success');
      // 更新维度分值
      data.data.scores.forEach(s => {
        currentScores[s.dimension] = s.score;
        const input = document.getElementById('scoreInput-' + s.dimension);
        const summary = document.getElementById('scoreSummary-' + s.dimension);
        if (input) input.value = s.score;
        if (summary) summary.textContent = s.summary || '';
        updateScoreDisplay(s.dimension, s.score);
      });
      // 更新报告
      document.getElementById('overallReport').value = data.data.overallReport || '';
      document.getElementById('developmentSuggestions').value = data.data.developmentSuggestions || '';
      // 更新时间
      const now = new Date();
      document.getElementById('lastAnalyzedAt').textContent =
        `上次分析：${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    } else {
      showToast('分析失败: ' + (data.error || '未知错误'), 'error');
    }
  } catch (err) {
    showToast('分析失败: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.style.display = 'inline-flex';
    indicator.style.display = 'none';
  }
}

// 导出PDF
async function exportPDF() {
  showToast('正在生成PDF...', 'info', 3000);
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const p = personData;

    // 标题
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text(`${p.name || '—'} · 高潜人才画像报告`, 20, 25);

    // 基础信息
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    const info = [
      `岗位：${p.position || '—'}    业务线：${p.business_line || '—'}    入池期次：${p.cohort || '—'}`,
      `学历：${p.education || '—'}    年龄：${p.age ? p.age + '岁' : '—'}    工龄：${p.meituan_years ? p.meituan_years + '年(美团)' : '—'}`,
    ];
    info.forEach((line, i) => doc.text(line, 20, 36 + i * 7));

    // 雷达图
    const canvas = document.getElementById('radarChart');
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 20, 56, 80, 80);

    // 维度分值
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('维度评分', 110, 62);
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    DIMENSIONS.forEach((dim, i) => {
      const score = currentScores[dim] || 0;
      const row = Math.floor(i / 2);
      const col = i % 2;
      doc.text(`${dim}：${score}/5`, 110 + col * 45, 70 + row * 8);
    });

    // 综合报告
    const reportText = document.getElementById('overallReport').value;
    if (reportText) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text('综合分析报告', 20, 20);
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(reportText, 170);
      doc.text(lines, 20, 30);
    }

    // 发展建议
    const devText = document.getElementById('developmentSuggestions').value;
    if (devText) {
      const lastY = doc.lastAutoTable?.finalY || 30;
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text('发展建议', 20, lastY + 15);
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(devText, 170);
      doc.text(lines, 20, lastY + 25);
    }

    doc.save(`${p.name || '人才画像'}_画像报告.pdf`);
    showToast('PDF已导出', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}
