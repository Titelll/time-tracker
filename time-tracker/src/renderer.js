'use strict';

/* ======================= helpers ======================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 86400000;

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOW_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const PALETTE = ['#f0b45a', '#3ecf8e', '#6aa7ff', '#c084fc', '#ef6461', '#2dd4bf', '#f472b6', '#a3e635', '#fb923c', '#94a3b8'];
const MARK_COLORS = ['#ff4d4d', '#ff9f1a', '#ffd60a', '#2f9bff', '#a35cff', '#ff4fa3', '#14d9e6', '#c3cee3'];

const fmtHMS = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const fmtDur = (ms) => {
  const m = Math.round(ms / 60000);
  if (m === 0) return ms > 0 ? '< 1 м' : '0 м';
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm} м`;
  return mm ? `${h} ч ${mm} м` : `${h} ч`;
};
const fmtShort = (ms) => {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? `${h}ч ${pad(mm)}м` : `${mm}м`;
};
const fmtDec = (ms) => (ms / 3600000).toFixed(2).replace('.', ',') + ' ч';
const fmtClock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const sod = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(sod(d), -((d.getDay() + 6) % 7));
const longDate = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ======================= state ======================= */
let db = { accounts: {}, lastLogin: '' };
let user = null;
let A = null; // data of current account
let view = 'tasks';
let selKey = dateKey(new Date());
let vm = { y: new Date().getFullYear(), m: new Date().getMonth() };
let weekStart = mondayOf(new Date());
let hoverSlice = -1;
let tickCount = 0;

const save = () => window.api.save(db);

function normalize(a) {
  a.timer = a.timer || { running: false, startedAt: null, task: '' };
  a.sessions = a.sessions || [];
  a.tasks = a.tasks || [];
  a.days = a.days || {};
  a.goals = a.goals || [];
}

/* ======================= data ======================= */
function canonicalTask(name) {
  const t = (name || '').trim() || 'Без задачи';
  const found = A.tasks.find((x) => x.toLowerCase() === t.toLowerCase());
  return found || t;
}

function buildIndex() {
  const list = A.sessions.slice();
  if (A.timer.running) {
    list.push({ id: 'live', start: A.timer.startedAt, end: Date.now(), task: canonicalTask(A.timer.task), live: true });
  }
  const idx = {};
  for (const s of list) {
    let cur = s.start;
    while (cur < s.end) {
      const d = sod(cur);
      const next = addDays(d, 1).getTime();
      const segEnd = Math.min(s.end, next);
      const key = dateKey(d);
      const e = (idx[key] = idx[key] || { total: 0, tasks: {}, sessions: [] });
      const ms = segEnd - cur;
      e.total += ms;
      e.tasks[s.task] = (e.tasks[s.task] || 0) + ms;
      e.sessions.push({ ...s, segStart: cur, segEnd, ms });
      cur = segEnd;
    }
  }
  return idx;
}

/* ======================= timer ======================= */
function startTimer() {
  if (A.timer.running) return;
  const task = canonicalTask($('#taskInput').value);
  if (task !== 'Без задачи' && !A.tasks.includes(task)) A.tasks.push(task);
  A.timer = { running: true, startedAt: Date.now(), task: $('#taskInput').value.trim() };
  save();
  updateTimerUI();
  renderView();
}

function stopTimer() {
  if (!A.timer.running) return;
  const task = canonicalTask($('#taskInput').value || A.timer.task);
  if (task !== 'Без задачи' && !A.tasks.includes(task)) A.tasks.push(task);
  A.sessions.push({ id: uid(), start: A.timer.startedAt, end: Date.now(), task });
  A.timer = { running: false, startedAt: null, task: '' };
  save();
  updateTimerUI();
  renderView();
}

function updateTimerUI() {
  const run = A.timer.running;
  $('#timerBox').classList.toggle('running', run);
  $('#toggleBtn').textContent = run ? 'Стоп' : 'Старт';
  $('#clock').textContent = fmtHMS(run ? Date.now() - A.timer.startedAt : 0);
  const idx = buildIndex();
  const t = idx[dateKey(new Date())];
  $('#todayTotal').textContent = fmtDur(t ? t.total : 0);
  $('#taskList').innerHTML = A.tasks.map((t) => `<option value="${esc(t)}">`).join('');
}

function tick() {
  if (!A) return;
  const run = A.timer.running;
  $('#clock').textContent = fmtHMS(run ? Date.now() - A.timer.startedAt : 0);
  if (!run) return;
  const t = buildIndex()[dateKey(new Date())];
  $('#todayTotal').textContent = fmtDur(t ? t.total : 0);
  if (++tickCount % 30 === 0) {
    const ae = document.activeElement;
    if (!(ae && $('#main').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) renderView();
  }
}

/* ======================= tooltip ======================= */
const tip = $('#tip');
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = x + 16, top = y + 16;
  if (left + w > window.innerWidth - 8) left = x - w - 16;
  if (top + h > window.innerHeight - 8) top = y - h - 16;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}
const hideTip = () => { tip.style.display = 'none'; };

/* ======================= views ======================= */
function renderView() {
  if (!A) return;
  hideTip();
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const fn = { tasks: renderTasks, calendar: renderCalendar, week: renderWeek, goals: renderGoals }[view];
  fn();
  updateTimerUI();
}

/* ---------- tasks ---------- */
function renderTasks() {
  const idx = buildIndex();
  const totals = {};
  Object.values(idx).forEach((d) => Object.entries(d.tasks).forEach(([n, ms]) => (totals[n] = (totals[n] || 0) + ms)));
  const todayKey = dateKey(new Date());
  const today = idx[todayKey];

  const names = Array.from(new Set([...A.tasks, ...Object.keys(totals)])).filter((n) => n !== 'Без задачи');
  const taskRows = names.length
    ? names.map((n) => `
      <div class="item">
        <span class="name" title="${esc(n)}">${esc(n)}</span>
        <span class="time">${fmtDur(totals[n] || 0)}</span>
        <button class="btn small" data-pick="${esc(n)}">Выбрать</button>
        <button class="x" data-deltask="${esc(n)}" title="Убрать из списка">×</button>
      </div>`).join('')
    : '<div class="empty">Пока пусто. Добавьте задачу или просто впишите её в поле над кнопкой «Старт».</div>';

  const sessRows = today && today.sessions.length
    ? today.sessions.slice().sort((a, b) => b.segStart - a.segStart).map((s) => `
      <div class="item">
        ${s.live ? '<span class="live-dot"></span>' : ''}
        <span class="name">${esc(s.task)}</span>
        <span class="time">${fmtClock(s.segStart)} – ${s.live ? 'сейчас' : fmtClock(s.segEnd)}</span>
        <span class="time">${fmtDur(s.ms)}</span>
      </div>`).join('')
    : '<div class="empty">Сегодня ещё нет записей. Запустите таймер.</div>';

  $('#main').innerHTML = `
    <div class="page-head"><h2>Задачи</h2></div>
    <div class="card">
      <h3>Список задач</h3>
      <div class="row-form">
        <input id="newTask" placeholder="Название задачи" autocomplete="off">
        <button id="addTask" class="btn primary" style="flex:none">Добавить</button>
      </div>
      <div class="list">${taskRows}</div>
    </div>
    <div class="card">
      <h3>Сегодня</h3>
      <div class="list">${sessRows}</div>
    </div>`;

  const add = () => {
    const v = $('#newTask').value.trim();
    if (!v) return;
    if (!A.tasks.some((t) => t.toLowerCase() === v.toLowerCase())) A.tasks.push(v);
    save(); renderView();
  };
  $('#addTask').onclick = add;
  $('#newTask').onkeydown = (e) => { if (e.key === 'Enter') add(); };
  $('#main').querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => {
    $('#taskInput').value = b.dataset.pick;
    if (A.timer.running) { A.timer.task = b.dataset.pick; save(); renderView(); }
  }));
  $('#main').querySelectorAll('[data-deltask]').forEach((b) => (b.onclick = () => {
    A.tasks = A.tasks.filter((t) => t !== b.dataset.deltask);
    save(); renderView();
  }));
}

/* ---------- calendar ---------- */
function cellColorStyle(hex, used) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = lum > 0.6 ? '#10141b' : '#ffffff';
  return `background:${hex}dd;color:${fg};${used ? '' : `border-color:${hex}`}`;
}

function renderCalendar() {
  const idx = buildIndex();
  const first = new Date(vm.y, vm.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysIn = new Date(vm.y, vm.m + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cell blank"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const key = dateKey(new Date(vm.y, vm.m, d));
    const info = idx[key];
    const meta = A.days[key] || {};
    const used = info && info.total > 0;
    const cls = ['cell', used ? 'used' : '', meta.color ? 'colored' : '', key === todayKey ? 'today' : '', key === selKey ? 'selected' : ''].join(' ');
    const style = meta.color ? cellColorStyle(meta.color, used) : '';
    cells += `<div class="${cls}" data-key="${key}" style="${style}">
      <span class="dn">${d}</span>
      ${used ? `<span class="hrs">${fmtShort(info.total)}</span>` : '<span></span>'}
      ${meta.note ? '<i class="dot"></i>' : ''}
    </div>`;
  }

  $('#main').innerHTML = `
    <div class="page-head">
      <h2>${MONTHS[vm.m]} ${vm.y}</h2>
      <div class="nav-ctrl">
        <button class="btn small" id="prevM">‹</button>
        <button class="btn small" id="todayM">Сегодня</button>
        <button class="btn small" id="nextM">›</button>
      </div>
    </div>
    <div class="cal-layout">
      <div class="cal-main">
        <div class="dow">${DOW.map((x) => `<div>${x}</div>`).join('')}</div>
        <div class="grid" id="calGrid">${cells}</div>
      </div>
      <div class="cal-side card" id="dayPanel"></div>
    </div>`;

  renderDayPanel(idx);

  $('#prevM').onclick = () => { vm.m--; if (vm.m < 0) { vm.m = 11; vm.y--; } renderView(); };
  $('#nextM').onclick = () => { vm.m++; if (vm.m > 11) { vm.m = 0; vm.y++; } renderView(); };
  $('#todayM').onclick = () => { const n = new Date(); vm = { y: n.getFullYear(), m: n.getMonth() }; selKey = dateKey(n); renderView(); };

  const grid = $('#calGrid');
  grid.onclick = (e) => {
    const c = e.target.closest('.cell[data-key]');
    if (!c) return;
    selKey = c.dataset.key;
    renderView();
  };
  grid.onmousemove = (e) => {
    const c = e.target.closest('.cell[data-key]');
    if (!c) return hideTip();
    const key = c.dataset.key;
    const info = idx[key];
    const meta = A.days[key] || {};
    let html = `<b>${longDate(keyToDate(key))}</b>`;
    if (info && info.total > 0) {
      html += `<div class="tl"><span>Всего</span><span>${fmtDur(info.total)}</span></div>`;
      Object.entries(info.tasks).sort((a, b) => b[1] - a[1]).forEach(([n, ms]) => {
        html += `<div class="tl"><span>${esc(n)}</span><span>${fmtDur(ms)}</span></div>`;
      });
    } else {
      html += '<div class="muted">Нет записей</div>';
    }
    if (meta.note) html += `<div class="tn">${esc(meta.note)}</div>`;
    showTip(html, e.clientX, e.clientY);
  };
  grid.onmouseleave = hideTip;
}

function renderDayPanel(idx) {
  const info = idx[selKey];
  const meta = A.days[selKey] || {};
  const d = keyToDate(selKey);
  const sessions = info ? info.sessions.slice().sort((a, b) => a.segStart - b.segStart) : [];

  const rows = sessions.length
    ? sessions.map((s) => `
      <div class="item">
        ${s.live ? `<span class="live-dot"></span><span class="name">${esc(s.task)}</span>` :
          `<input data-sid="${s.id}" value="${esc(s.task)}" class="name">`}
        <span class="time">${fmtClock(s.segStart)}–${s.live ? '…' : fmtClock(s.segEnd)}<br>${fmtDur(s.ms)}</span>
        ${s.live ? '' : `<button class="x" data-delsess="${s.id}" title="Удалить запись">×</button>`}
      </div>`).join('')
    : '<div class="empty">В этот день таймер не запускался.</div>';

  $('#dayPanel').innerHTML = `
    <h3>${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${DOW_FULL[d.getDay()]}</h3>
    <div class="muted" style="margin:2px 0 14px">Всего: ${fmtDur(info ? info.total : 0)}</div>
    <div class="day-sec"><h4>Задачи</h4><div class="list">${rows}</div></div>
    <div class="day-sec"><h4>Пометка</h4><textarea id="dayNote" placeholder="Заметка к этому дню">${esc(meta.note || '')}</textarea></div>
    <div class="day-sec"><h4>Цвет даты</h4>
      <div class="swatches">
        ${MARK_COLORS.map((c) => `<button class="sw ${meta.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('')}
        <input type="color" id="customColor" value="${meta.color || '#3b82f6'}" title="Свой цвет">
        <button class="btn small" id="resetColor">Сбросить</button>
      </div>
    </div>`;

  const panel = $('#dayPanel');
  const setMeta = (patch) => {
    A.days[selKey] = { ...(A.days[selKey] || {}), ...patch };
    if (!A.days[selKey].note && !A.days[selKey].color) delete A.days[selKey];
    save();
  };
  $('#dayNote').oninput = (e) => setMeta({ note: e.target.value });
  $('#dayNote').onchange = () => renderView();
  panel.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => { setMeta({ color: b.dataset.color }); renderView(); }));
  $('#customColor').onchange = (e) => { setMeta({ color: e.target.value }); renderView(); };
  $('#resetColor').onclick = () => { setMeta({ color: '' }); renderView(); };
  panel.querySelectorAll('input[data-sid]').forEach((inp) => (inp.onchange = () => {
    const s = A.sessions.find((x) => x.id === inp.dataset.sid);
    if (!s) return;
    s.task = canonicalTask(inp.value);
    if (s.task !== 'Без задачи' && !A.tasks.includes(s.task)) A.tasks.push(s.task);
    save(); renderView();
  }));
  panel.querySelectorAll('[data-delsess]').forEach((b) => (b.onclick = () => {
    A.sessions = A.sessions.filter((x) => x.id !== b.dataset.delsess);
    save(); renderView();
  }));
}

/* ---------- week ---------- */
function renderWeek() {
  const idx = buildIndex();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totals = {};
  const perDay = days.map((d) => {
    const info = idx[dateKey(d)];
    if (info) Object.entries(info.tasks).forEach(([n, ms]) => (totals[n] = (totals[n] || 0) + ms));
    return info ? info.total : 0;
  });
  const items = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, ms], i) => ({ name, ms, color: PALETTE[i % PALETTE.length] }));
  const sum = items.reduce((s, x) => s + x.ms, 0);
  const end = days[6];
  const finished = end < sod(Date.now());
  const range = `${days[0].getDate()} ${days[0].getMonth() === end.getMonth() ? '' : MONTHS_GEN[days[0].getMonth()] + ' '}– ${end.getDate()} ${MONTHS_GEN[end.getMonth()]} ${end.getFullYear()}`;
  const maxDay = Math.max(...perDay, 1);

  $('#main').innerHTML = `
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px"><h2>${range}</h2>${finished ? '<span class="badge">неделя завершена</span>' : ''}</div>
      <div class="nav-ctrl">
        <button class="btn small" id="prevW">‹</button>
        <button class="btn small" id="thisW">Эта неделя</button>
        <button class="btn small" id="nextW">›</button>
      </div>
    </div>
    <div class="card">
      <h3>На что ушло время</h3>
      ${sum ? `
      <div class="week-layout">
        <div class="pie-wrap"><canvas id="pie"></canvas></div>
        <div class="legend">
          ${items.map((it, i) => `
            <div class="item" data-i="${i}">
              <span class="swatch" style="background:${it.color}"></span>
              <span class="name" title="${esc(it.name)}">${esc(it.name)}</span>
              <span class="time">${fmtDur(it.ms)}</span>
              <span class="pct">${Math.round((it.ms / sum) * 100)}%</span>
            </div>`).join('')}
        </div>
      </div>` : '<div class="empty">За эту неделю нет записей.</div>'}
    </div>
    <div class="card">
      <h3>По дням</h3>
      <div class="bars">
        ${days.map((d, i) => `
          <div class="bar ${perDay[i] ? '' : 'zero'}" data-day="${i}">
            <em>${perDay[i] ? fmtShort(perDay[i]) : ''}</em>
            <i style="height:${Math.max(2, (perDay[i] / maxDay) * 80)}px"></i>
            <span>${DOW[i]} ${d.getDate()}</span>
          </div>`).join('')}
      </div>
    </div>`;

  $('#prevW').onclick = () => { weekStart = addDays(weekStart, -7); renderView(); };
  $('#nextW').onclick = () => { weekStart = addDays(weekStart, 7); renderView(); };
  $('#thisW').onclick = () => { weekStart = mondayOf(new Date()); renderView(); };

  if (sum) setupPie(items, sum);
}

function setupPie(items, sum) {
  const canvas = $('#pie');
  const size = 320;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, R = 140, r = 84;
  hoverSlice = -1;

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    let a = -Math.PI / 2;
    items.forEach((it, i) => {
      const ang = (it.ms / sum) * Math.PI * 2;
      const hov = i === hoverSlice;
      const out = hov ? R + 7 : R;
      ctx.beginPath();
      ctx.arc(cx, cy, out, a, a + ang);
      ctx.arc(cx, cy, r, a + ang, a, true);
      ctx.closePath();
      ctx.fillStyle = it.color;
      ctx.globalAlpha = hoverSlice === -1 || hov ? 1 : 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2; ctx.strokeStyle = '#161b24'; ctx.stroke();
      a += ang;
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#e7eaf0';
    ctx.font = '600 24px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(hoverSlice >= 0 ? `${Math.round((items[hoverSlice].ms / sum) * 100)}%` : fmtDur(sum), cx, cy + 4);
    ctx.fillStyle = '#8a94a6'; ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(hoverSlice >= 0 ? fmtDur(items[hoverSlice].ms) : 'за неделю', cx, cy + 24);
  };

  const setHover = (i) => {
    hoverSlice = i;
    draw();
    document.querySelectorAll('.legend .item').forEach((el) => el.classList.toggle('hl', Number(el.dataset.i) === i));
  };

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - rect.left - cx, dy = e.clientY - rect.top - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < r - 4 || dist > R + 8) { setHover(-1); return hideTip(); }
    let ang = Math.atan2(dy, dx) + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    let acc = 0, found = -1;
    for (let i = 0; i < items.length; i++) {
      acc += (items[i].ms / sum) * Math.PI * 2;
      if (ang <= acc) { found = i; break; }
    }
    if (found !== hoverSlice) setHover(found);
    if (found >= 0) {
      const it = items[found];
      showTip(`<b>${esc(it.name)}</b><div class="tl"><span>Время</span><span>${fmtDur(it.ms)} · ${fmtDec(it.ms)}</span></div><div class="tl"><span>Доля</span><span>${Math.round((it.ms / sum) * 1000) / 10}%</span></div>`, e.clientX, e.clientY);
    }
  };
  canvas.onmouseleave = () => { setHover(-1); hideTip(); };
  document.querySelectorAll('.legend .item').forEach((el) => {
    el.onmouseenter = () => setHover(Number(el.dataset.i));
    el.onmouseleave = () => setHover(-1);
  });
  draw();
}

/* ---------- goals ---------- */
const PERIODS = { week: 'в неделю', month: 'в месяц', all: 'всего' };

function goalDone(g, idx) {
  const now = new Date();
  let from = -Infinity, to = Infinity;
  if (g.period === 'week') { from = mondayOf(now).getTime(); to = addDays(mondayOf(now), 7).getTime(); }
  if (g.period === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(); }
  const name = g.task.trim().toLowerCase();
  let ms = 0;
  for (const [key, info] of Object.entries(idx)) {
    const t = keyToDate(key).getTime();
    if (t < from || t >= to) continue;
    for (const [n, v] of Object.entries(info.tasks)) if (n.trim().toLowerCase() === name) ms += v;
  }
  return ms;
}

function renderGoals() {
  const idx = buildIndex();
  const rows = A.goals.length
    ? A.goals.map((g) => {
      const done = goalDone(g, idx);
      const target = g.hours * 3600000;
      const pct = Math.min(100, (done / target) * 100);
      const ok = done >= target;
      return `
        <div class="goal">
          <div class="goal-top">
            <span class="name">${esc(g.task)}</span>
            <span class="muted">${g.hours} ч ${PERIODS[g.period]}</span>
            <button class="x" data-delgoal="${g.id}" title="Удалить цель">×</button>
          </div>
          <div class="progress ${ok ? 'done' : ''}"><i style="width:${pct}%"></i></div>
          <div class="goal-sub"><span>${fmtDur(done)} из ${g.hours} ч</span><span>${ok ? 'Цель достигнута' : `осталось ${fmtDur(target - done)}`}</span></div>
        </div>`;
    }).join('')
    : '<div class="empty">Целей пока нет. Выберите задачу и количество часов.</div>';

  $('#main').innerHTML = `
    <div class="page-head"><h2>Цели</h2></div>
    <div class="card">
      <h3>Новая цель</h3>
      <div class="row-form">
        <input id="goalTask" list="goalTaskList" placeholder="Задача" autocomplete="off">
        <datalist id="goalTaskList">${A.tasks.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        <input id="goalHours" type="number" min="0.5" step="0.5" placeholder="Часов" style="max-width:110px;flex:none">
        <select id="goalPeriod" style="max-width:140px;flex:none">
          <option value="week">в неделю</option><option value="month">в месяц</option><option value="all">всего</option>
        </select>
        <button id="addGoal" class="btn primary" style="flex:none">Добавить</button>
      </div>
      <div id="goalErr" class="error"></div>
    </div>
    <div class="card"><h3>Мои цели</h3>${rows}</div>`;

  $('#addGoal').onclick = () => {
    const task = $('#goalTask').value.trim();
    const hours = parseFloat(String($('#goalHours').value).replace(',', '.'));
    if (!task) return ($('#goalErr').textContent = 'Укажите задачу.');
    if (!(hours > 0)) return ($('#goalErr').textContent = 'Укажите количество часов больше нуля.');
    const t = canonicalTask(task);
    if (!A.tasks.includes(t)) A.tasks.push(t);
    A.goals.push({ id: uid(), task: t, hours, period: $('#goalPeriod').value });
    save(); renderView();
  };
  $('#main').querySelectorAll('[data-delgoal]').forEach((b) => (b.onclick = () => {
    A.goals = A.goals.filter((g) => g.id !== b.dataset.delgoal);
    save(); renderView();
  }));
}

/* ======================= auth ======================= */
function enterApp(login) {
  user = login;
  A = db.accounts[login].data;
  normalize(A);
  db.lastLogin = login;
  save();
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userName').textContent = login;
  $('#taskInput').value = A.timer.running ? A.timer.task : '';
  view = 'tasks';
  selKey = dateKey(new Date());
  const n = new Date();
  vm = { y: n.getFullYear(), m: n.getMonth() };
  weekStart = mondayOf(n);
  renderView();
}

function logout() {
  if (A && A.timer.running) { A.timer.task = $('#taskInput').value.trim(); save(); }
  user = null; A = null;
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#passInput').value = '';
  $('#authError').textContent = '';
  $('#loginInput').value = db.lastLogin || '';
  hideTip();
}

function authError(msg) { $('#authError').textContent = msg; }

function doLogin() {
  const l = $('#loginInput').value.trim(), p = $('#passInput').value;
  if (!l || !p) return authError('Введите логин и пароль.');
  const acc = db.accounts[l];
  if (!acc || acc.password !== p) return authError('Неверный логин или пароль.');
  enterApp(l);
}

function doRegister() {
  const l = $('#loginInput').value.trim(), p = $('#passInput').value;
  if (!l || !p) return authError('Введите логин и пароль.');
  if (db.accounts[l]) return authError('Такой аккаунт уже есть. Нажмите «Войти».');
  db.accounts[l] = { password: p, data: {} };
  enterApp(l);
}

/* ======================= updates ======================= */
function renderUpdate(s) {
  const bar = $('#updateBar');
  if (!s) return bar.classList.add('hidden');
  bar.classList.remove('hidden');
  if (s.state === 'available') {
    bar.innerHTML = `<span>Доступна версия ${esc(s.version)}</span><button class="btn small primary" id="updBtn">Скачать</button>`;
    $('#updBtn').onclick = () => window.api.openReleases();
  } else if (s.state === 'downloading') {
    bar.innerHTML = `<span>Загрузка обновления ${s.percent || 0}%</span><div class="progress"><i style="width:${s.percent || 0}%"></i></div>`;
  } else if (s.state === 'ready') {
    bar.innerHTML = `<span>Версия ${esc(s.version)} готова. Таймер и данные сохранятся.</span><button class="btn small primary" id="updBtn">Перезапустить</button>`;
    $('#updBtn').onclick = () => window.api.installUpdate();
  }
}

/* ======================= init ======================= */
(async function init() {
  const loaded = await window.api.load();
  db = loaded && loaded.accounts ? loaded : { accounts: {}, lastLogin: '' };
  $('#loginInput').value = db.lastLogin || '';

  $('#loginBtn').onclick = doLogin;
  $('#registerBtn').onclick = doRegister;
  $('#passInput').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  $('#loginInput').onkeydown = (e) => { if (e.key === 'Enter') $('#passInput').focus(); };
  $('#logoutBtn').onclick = logout;
  $('#toggleBtn').onclick = () => (A.timer.running ? stopTimer() : startTimer());
  $('#taskInput').onchange = () => { if (A && A.timer.running) { A.timer.task = $('#taskInput').value.trim(); save(); } };
  document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => { view = b.dataset.view; renderView(); }));
  window.api.version().then((v) => ($('#ver').textContent = 'v' + v));
  window.api.onUpdate(renderUpdate);
  window.api.updateStatus().then(renderUpdate);
  setInterval(tick, 250);
})();
