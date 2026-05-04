// ============================================
// app.js - 公共工具函数
// ============================================

// 检查登录态，未登录跳转到登录页
function checkAuth(callback) {
  fetch('/api/auth/status')
    .then(r => r.json())
    .then(data => {
      if (!data.loggedIn) {
        window.location.href = '/';
      } else {
        if (callback) callback(data.user);
      }
    })
    .catch(() => {
      window.location.href = '/';
    });
}

// Toast 通知
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn .25s ease reverse';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// 获取分数对应的颜色 class
function getScoreClass(score) {
  if (score >= 4) return 'score-high';
  if (score >= 3) return 'score-mid';
  return 'score-low';
}

// 获取分数对应的颜色
function getScoreColor(score) {
  if (score >= 4) return '#10B981';
  if (score >= 3) return '#F59E0B';
  return '#EF4444';
}

// URL参数解析
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}
