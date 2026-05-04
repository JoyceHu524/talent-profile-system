// ============================================
// group.js - 群体分析页逻辑
// ============================================

const DIMENSIONS = ['自驱力','学习速度','跨界影响力','战略视角','带人与激励','抗压韧性','业务洞察','主动向上对齐'];
const CHART_COLORS = [
  'rgba(37,99,235,0.7)','rgba(16,185,129,0.7)','rgba(245,158,11,0.7)',
  'rgba(239,68,68,0.7)','rgba(139,92,246,0.7)','rgba(236,72,153,0.7)',
  'rgba(14,165,233,0.7)','rgba(234,179,8,0.7)'
];

let groupRadarChart = null;
let avgBarChart = null;
let crossChart = null;
let groupData = null;

// 初始化
checkAuth(() => {
  // 填充交叉分析维度选项
  const dimSelect = document.getElementById('crossDimension');
  DIMENSIONS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    dimSelect.appendChild(opt);
  });
  loadGroupData();
});

// 加载群体数据
async function loadGroupData() {
  const cohort = document.getElementById('filterCohort').value;
  const bl = document.getElementById('filterBL').value;

  const params = new URLSearchParams();
  if (cohort) params.set('cohort', cohort);
  if (bl) params.set('business_line', bl);

  try {
    const res = await fetch('/api/people/group/analysis?' + params.toString());
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    groupData = data.data;
    // 只保留有评分数据的人
    groupData.people = groupData.people.filter(p => {
      const scores = Object.values(p.scores || {});
      return scores.some(s => s > 0);
    });
    groupData.total = groupData.people.length;

    // 重新计算均值
    groupData.avgScores = {};
    DIMENSIONS.forEach(dim => {
      const vals = groupData.people.map(p => p.scores[dim] || 0).filter(v => v > 0);
      groupData.avgScores[dim] = vals.length > 0
        ? parseFloat((vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(2))
        : 0;
    });

    document.getElementById('groupSubtitle').textContent = `共 ${groupData.total} 人（已有评分）`;

    renderGroupRadar(groupData);
    renderAvgBar(groupData);
    renderCompareTable(groupData);
    renderCrossAnalysis();
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
  }
}

// 群体雷达图
function renderGroupRadar(data) {
  const ctx = document.getElementById('groupRadarChart').getContext('2d');

  const datasets = [];

  // 均值线
  datasets.push({
    label: '群体均值',
    data: DIMENSIONS.map(d => data.avgScores[d] || 0),
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderColor: '#2563EB',
    borderWidth: 2.5,
    pointBackgroundColor: '#2563EB',
    pointRadius: 4
  });

  // 个人线（最多显示5人，避免图表太乱）
  data.people.slice(0, 5).forEach((p, i) => {
    const color = CHART_COLORS[i + 1] || CHART_COLORS[i % CHART_COLORS.length];
    datasets.push({
      label: p.name,
      data: DIMENSIONS.map(d => p.scores[d] || 0),
      backgroundColor: 'transparent',
      borderColor: color,
      borderWidth: 1,
      borderDash: [4, 3],
      pointRadius: 2,
      pointBackgroundColor: color
    });
  });

  if (groupRadarChart) groupRadarChart.destroy();
  groupRadarChart = new Chart(ctx, {
    type: 'radar',
    data: { labels: DIMENSIONS, datasets },
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
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12 }
        }
      }
    }
  });
}

// 均值柱状图
function renderAvgBar(data) {
  const ctx = document.getElementById('avgBarChart').getContext('2d');
  const values = DIMENSIONS.map(d => data.avgScores[d] || 0);
  const colors = values.map(v =>
    v >= 4 ? 'rgba(16,185,129,0.7)' : v >= 3 ? 'rgba(245,158,11,0.7)' : 'rgba(239,68,68,0.7)'
  );

  if (avgBarChart) avgBarChart.destroy();
  avgBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: DIMENSIONS,
      datasets: [{
        label: '群体均值',
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.7', '1')),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { min: 0, max: 5, ticks: { stepSize: 1 }, grid: { color: '#F1F5F9' } },
        x: { ticks: { font: { size: 11 } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `均值: ${ctx.raw} / 5`
          }
        }
      }
    }
  });
}

// 交叉分析图
function renderCrossAnalysis() {
  if (!groupData) return;
  const groupField = document.getElementById('crossGroup1').value;
  const dimension = document.getElementById('crossDimension').value;
  if (!dimension) return;

  // 按分组聚合
  const groups = {};
  groupData.people.forEach(p => {
    const key = p[groupField] || '未知';
    if (!groups[key]) groups[key] = [];
    const score = p.scores[dimension] || 0;
    if (score > 0) groups[key].push(score);
  });

  const labels = Object.keys(groups);
  const avgValues = labels.map(k => {
    const vals = groups[k];
    return vals.length > 0 ? parseFloat((vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(2)) : 0;
  });

  const ctx = document.getElementById('crossChart').getContext('2d');
  if (crossChart) crossChart.destroy();

  crossChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `${dimension} 均值`,
        data: avgValues,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          min: 0, max: 5,
          ticks: { stepSize: 1 },
          grid: { color: '#F1F5F9' },
          title: { display: true, text: dimension + ' 均值' }
        },
        x: {
          title: {
            display: true,
            text: { cohort: '入池期次', business_line: '业务线', education: '学历', gender: '性别' }[groupField] || groupField
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${dimension}: ${ctx.raw} / 5（${groups[ctx.label]?.length || 0}人）`
          }
        }
      }
    }
  });
}

// 渲染对比表格
function renderCompareTable(data) {
  const head = document.getElementById('compareTableHead');
  const body = document.getElementById('compareTableBody');

  // 表头
  head.innerHTML = `<tr>
    <th>姓名</th>
    <th>期次</th>
    <th>业务线</th>
    ${DIMENSIONS.map(d => `<th style="min-width:64px;text-align:center;">${d}</th>`).join('')}
  </tr>`;

  // 均值行
  const avgRow = `<tr style="background:#EFF6FF;font-weight:600;">
    <td>群体均值</td>
    <td>—</td>
    <td>—</td>
    ${DIMENSIONS.map(d => {
      const v = data.avgScores[d] || 0;
      return `<td class="score-cell"><span class="score-badge ${getScoreClass(v)}">${v || '—'}</span></td>`;
    }).join('')}
  </tr>`;

  // 人员行
  const rows = data.people.map(p => `
    <tr onclick="window.location.href='/profile?id=${p.id}'" style="cursor:pointer;">
      <td><a href="/profile?id=${p.id}" style="color:var(--primary);text-decoration:none;font-weight:500;">${p.name}</a></td>
      <td>${p.cohort || '—'}</td>
      <td>${p.business_line || '—'}</td>
      ${DIMENSIONS.map(d => {
        const v = p.scores[d] || 0;
        return `<td class="score-cell"><span class="score-badge ${v ? getScoreClass(v) : ''}">${v || '—'}</span></td>`;
      }).join('')}
    </tr>
  `).join('');

  body.innerHTML = avgRow + rows;
}

// 复制表格数据
function copyTableData() {
  if (!groupData) return;
  const header = ['姓名', '期次', '业务线', ...DIMENSIONS].join('\t');
  const rows = groupData.people.map(p =>
    [p.name, p.cohort || '', p.business_line || '', ...DIMENSIONS.map(d => p.scores[d] || '')].join('\t')
  );
  const text = [header, ...rows].join('\n');

  navigator.clipboard.writeText(text).then(() => {
    showToast('数据已复制到剪贴板（可直接粘贴到Excel）', 'success');
  }).catch(() => {
    showToast('复制失败，请手动复制', 'error');
  });
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}
