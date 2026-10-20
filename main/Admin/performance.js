// Performance dashboard: polls GET /api/metrics (admin only) every 5s and
// renders stat cards + Chart.js charts. Same auth/JSON helpers as admin.js.
const METRICS_API = `${window.location.origin}/api/metrics`;
const REFRESH_MS = 5000;

function adminHeaders() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../verify/login.html';
    throw new Error('Not logged in as admin.');
  }
  return { Authorization: `Bearer ${token}` };
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (HTTP ${res.status}). Is 'node server.js' running?`);
  }
}

function setStat(id, value, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.v').innerHTML = value;
  el.className = 'stat' + (cls ? ` ${cls}` : '');
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
        m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// --- Charts (history kept client-side across polls) ---------------------------
const MAX_POINTS = 30; // 30 * 5s = 2.5 min of history
const history = { labels: [], avg: [], p95: [], rss: [], heap: [] };

Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--mute').trim() || '#98a2bd';
Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#26304d';

const statusChart = new Chart(document.getElementById('statusChart'), {
  type: 'doughnut',
  data: {
    labels: ['2xx', '3xx', '4xx', '5xx'],
    datasets: [{
      data: [0, 0, 0, 0],
      backgroundColor: ['#1db954', '#4a9eff', '#e0a63a', '#ff5a7d'],
      borderWidth: 0
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: { legend: { position: 'bottom' } }
  }
});

const latencyChart = new Chart(document.getElementById('latencyChart'), {
  type: 'line',
  data: {
    labels: history.labels,
    datasets: [
      { label: 'avg', data: history.avg, borderColor: '#4a9eff', backgroundColor: '#4a9eff22', fill: true, tension: .35, pointRadius: 0 },
      { label: 'p95', data: history.p95, borderColor: '#ff5a7d', backgroundColor: 'transparent', tension: .35, pointRadius: 0 }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: true } },
    plugins: { legend: { display: true, labels: { boxWidth: 12 } } }
  }
});

const memChart = new Chart(document.getElementById('memChart'), {
  type: 'line',
  data: {
    labels: history.labels,
    datasets: [
      { label: 'RSS', data: history.rss, borderColor: '#9b6dff', backgroundColor: '#9b6dff22', fill: true, tension: .35, pointRadius: 0 },
      { label: 'Heap used', data: history.heap, borderColor: '#1db954', backgroundColor: 'transparent', tension: .35, pointRadius: 0 }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: true } },
    plugins: { legend: { display: true, labels: { boxWidth: 12 } } }
  }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function renderRoutes(routes) {
  const body = document.getElementById('routesBody');
  if (!routes || !routes.length) {
    body.innerHTML = '<tr><td colspan="4" class="m">No requests recorded yet.</td></tr>';
    return;
  }
  body.innerHTML = routes.map((r) => `
    <tr>
      <td>${escapeHtml(r.route)}</td>
      <td>${r.count.toLocaleString()}</td>
      <td>${r.avgMs}</td>
      <td>${r.errors ? `<span class="badge off">${r.errors}</span>` : '0'}</td>
    </tr>`).join('');
}

function pushHistory(m) {
  const now = new Date().toLocaleTimeString();
  history.labels.push(now);
  history.avg.push(m.requests.avgMs);
  history.p95.push(m.requests.p95Ms);
  history.rss.push(m.memory.rssMB);
  history.heap.push(m.memory.heapUsedMB);
  if (history.labels.length > MAX_POINTS) {
    for (const arr of Object.values(history)) arr.shift();
  }
  latencyChart.update('none');
  memChart.update('none');
}

function render(m) {
  // Stat cards
  setStat('st-uptime', fmtUptime(m.uptimeSec));
  setStat('st-req', m.requests.total.toLocaleString() + ` <small>${m.requests.inWindow} in window</small>`);
  const avgCls = m.requests.avgMs > 500 ? 'err' : m.requests.avgMs > 200 ? 'warn' : 'ok';
  setStat('st-avg', m.requests.avgMs + ' <small>ms</small>', avgCls);
  const p95Cls = m.requests.p95Ms > 1000 ? 'err' : m.requests.p95Ms > 500 ? 'warn' : 'ok';
  setStat('st-p95', m.requests.p95Ms + ' <small>ms</small>', p95Cls);
  const errTotal = m.requests['4xx'] + m.requests['5xx'];
  setStat('st-errs', `${m.requests['4xx']} / ${m.requests['5xx']}`, errTotal ? 'warn' : 'ok');
  setStat('st-mem', `${m.memory.heapUsedMB} <small>/ ${m.memory.heapTotalMB} MB</small>`);

  const c = m.cache;
  setStat('st-cache', c.enabled ? `${c.backend} <small>${c.hitRate}% hit</small>` : `<small>disabled</small>`, c.enabled ? 'ok' : '');
  setStat('st-db', `<small>${m.db.state}</small>`, m.db.state === 'connected' ? 'ok' : 'err');

  // Charts + table
  statusChart.data.datasets[0].data = [m.requests['2xx'], m.requests['3xx'], m.requests['4xx'], m.requests['5xx']];
  statusChart.update('none');
  pushHistory(m);
  renderRoutes(m.topRoutes);

  document.getElementById('lastUpdate').textContent =
    `updated ${new Date().toLocaleTimeString()} · pid ${m.process.pid} · node ${m.process.node}`;
}

const perfMsg = document.getElementById('perfMsg');
let timer = null;
let firstLoad = true;

async function load() {
  try {
    const res = await fetch(METRICS_API, { headers: adminHeaders() });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    render(data);
    perfMsg.textContent = '';
    if (firstLoad) {
      firstLoad = false;
      timer = setInterval(load, REFRESH_MS); // start polling only after 1st success
    }
  } catch (err) {
    perfMsg.textContent = err.message;
    perfMsg.style.color = '#ff5a7d';
    if (err.message.includes('Admin role required') || err.message.includes('Invalid token')) {
      window.location.href = '../verify/login.html';
    }
  }
}

document.getElementById('refreshBtn').addEventListener('click', load);
load();
