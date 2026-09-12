const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginButton = document.querySelector('#loginButton');
const loginError = document.querySelector('#loginError');
const dashboardError = document.querySelector('#dashboardError');
const refreshButton = document.querySelector('#refreshButton');
const logoutButton = document.querySelector('#logoutButton');
let refreshTimer;
let refreshing = false;

const statusLabels = {
  ready: ['就绪', 'is-good'],
  connected: ['已连接', 'is-good'],
  connecting: ['连接中', 'is-warn'],
  unavailable: ['不可用', 'is-bad'],
  stopped: ['已停止', 'is-bad'],
  not_configured: ['未配置', 'is-muted'],
  unknown: ['未知', 'is-muted'],
};

loginForm.addEventListener('submit', event => { event.preventDefault(); login(); });
refreshButton.addEventListener('click', () => refreshStatus(true));
logoutButton.addEventListener('click', logout);
restoreSession();

async function restoreSession() {
  try {
    const data = await request('/admin/api/status');
    showDashboard();
    renderStatus(data);
    startRefreshTimer();
  } catch (error) {
    if (error.status === 503) showLoginError(error.message);
  }
}

async function login() {
  setBusy(loginButton, true, '登录中…');
  clearNotice(loginError);
  try {
    await request('/admin/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: document.querySelector('#username').value, password: document.querySelector('#password').value }),
    });
    document.querySelector('#password').value = '';
    showDashboard();
    await refreshStatus();
    startRefreshTimer();
  } catch (error) {
    showLoginError(error.message);
  } finally { setBusy(loginButton, false, '登录后台'); }
}

async function refreshStatus(manual = false) {
  if (refreshing) return;
  refreshing = true;
  if (manual) setBusy(refreshButton, true, '刷新中…');
  clearNotice(dashboardError);
  try {
    const data = await request('/admin/api/status');
    renderStatus(data);
  } catch (error) {
    if (error.status === 401) { stopRefreshTimer(); showLogin(); showLoginError(error.message); }
    else showDashboardError(error.message);
  } finally {
    if (manual) setBusy(refreshButton, false, '刷新状态');
    refreshing = false;
  }
}

async function logout() {
  stopRefreshTimer();
  setBusy(logoutButton, true, '退出中…');
  try {
    await request('/admin/api/logout', { method: 'POST' });
    showLogin();
  } catch (error) {
    showDashboardError(error.message || '退出登录失败');
    startRefreshTimer();
  } finally { setBusy(logoutButton, false, '退出'); }
}

function renderStatus(data) {
  setText('#appVersion', data.application?.version);
  setText('#appBuild', data.application?.build);
  setText('#appBuildTime', formatDate(data.application?.buildTime));
  setText('#appCommit', data.application?.commit);
  setText('#startedAt', formatDate(data.instance?.startedAt));
  setText('#uptime', formatDuration(data.instance?.uptimeSeconds));
  setText('#realtimeConnections', data.instance?.realtimeConnections == null ? null : `${data.instance.realtimeConnections} 条`);
  setStatus('#databaseConnection', data.database?.connection);
  setStatus('#databaseRead', data.database?.read);
  setText('#blessingCount', data.blessings?.totalCount == null ? null : `${data.blessings.totalCount} 条`);
  setText('#lastSavedAt', data.blessings?.lastSavedAt == null ? '暂无保存记录' : formatDate(data.blessings.lastSavedAt));
  setStatus('#sseListener', data.notifications?.sseListener);
  setText('#lastRefresh', formatDate(data.generatedAt));
  document.querySelector('#lastRefresh').dateTime = data.generatedAt || '';
  clearNotice(dashboardError);
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showLoginError(message) {
  loginError.textContent = message || '请求无法完成';
  loginError.hidden = false;
}

function showDashboardError(message) {
  dashboardError.textContent = message || '状态读取失败';
  dashboardError.hidden = false;
}

function clearNotice(node) { node.textContent = ''; node.hidden = true; }

function setStatus(selector, state) {
  const node = document.querySelector(selector);
  const [label, className] = statusLabels[state] || statusLabels.unknown;
  node.textContent = label;
  node.className = `status-badge ${className}`;
}

function setText(selector, value) { document.querySelector(selector).textContent = value == null || value === '' ? '未知' : value; }

function formatDate(value) {
  if (value === 'unknown' || value == null) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '未知';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = Math.floor(seconds % 60);
  return `${days ? `${days}天 ` : ''}${hours}小时 ${minutes}分 ${remainder}秒`;
}

function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }

function startRefreshTimer() { stopRefreshTimer(); refreshTimer = setInterval(() => refreshStatus(), 30000); }
function stopRefreshTimer() { clearInterval(refreshTimer); refreshTimer = undefined; }

async function request(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  let data = {};
  try { data = await response.json(); } catch { /* 非 JSON 错误由状态码处理。 */ }
  if (!response.ok) { const error = new Error(data.message || '请求无法完成'); error.status = response.status; throw error; }
  return data;
}
