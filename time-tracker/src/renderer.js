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
let ACC = null; // запись текущего аккаунта (пароль, облако, данные)
let A = null; // data of current account
let view = 'tasks';
let selKey = dateKey(new Date());
let vm = { y: new Date().getFullYear(), m: new Date().getMonth() };
let chartMode = 'week'; // week | month | year
let chartAnchor = new Date();
let chartTask = '';
let tickCount = 0;

const persist = () => window.api.save(db);
// Любое изменение данных: помечаем время правки, сохраняем и ставим синхронизацию в очередь
const save = () => { if (A) A._u = Date.now(); persist(); scheduleSync(); };

function normalize(a) {
  a.timer = a.timer || { running: false, startedAt: null, task: '' };
  a.sessions = a.sessions || [];
  a.tasks = a.tasks || [];
  a.days = a.days || {};
  a.goals = a.goals || [];
  return a;
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
// Что показывает таймер: если вписана задача, то всё время по ней за сегодня (плюс текущий запуск),
// иначе только текущий запуск.
function clockMs() {
  const name = $('#taskInput').value.trim();
  const run = A.timer.running;
  const now = Date.now();
  if (!name) return run ? now - A.timer.startedAt : 0;
  const t = canonicalTask(name).trim().toLowerCase();
  const d0 = sod(now).getTime();
  let ms = 0;
  for (const s of A.sessions) {
    if (s.end <= d0 || s.task.trim().toLowerCase() !== t) continue;
    ms += s.end - Math.max(s.start, d0);
  }
  if (run) ms += now - Math.max(A.timer.startedAt, d0);
  return ms;
}

function refreshClock() {
  if (!A) return;
  const txt = fmtHMS(clockMs());
  $('#clock').textContent = txt;
  $('#focusClock').textContent = txt;
  $('#focusSub').textContent = $('#taskInput').value.trim() ? 'Сегодня по этой задаче' : 'Текущий запуск';
}

function commitTask() {
  if (A && A.timer.running) { A.timer.task = $('#taskInput').value.trim(); save(); }
}
function setTaskInputs(v) { $('#taskInput').value = v; $('#focusTask').value = v; }
function openFocus() {
  if (!A) return;
  $('#focusTask').value = $('#taskInput').value;
  $('#focus').classList.remove('hidden');
  updateTimerUI();
}
function closeFocus() { $('#focus').classList.add('hidden'); }

// Объединяет повторяющиеся задачи (сегменты одного дня) в одну строку с общим временем
function groupSessions(list) {
  const map = new Map();
  for (const x of list) {
    const k = x.task.trim().toLowerCase();
    let g = map.get(k);
    if (!g) { g = { name: x.task, ms: 0, count: 0, live: false, ids: [], last: 0 }; map.set(k, g); }
    g.ms += x.ms; g.count++; g.last = Math.max(g.last, x.segEnd);
    if (x.live) g.live = true; else if (!g.ids.includes(x.id)) g.ids.push(x.id);
  }
  return [...map.values()].sort((a, b) => b.last - a.last);
}

function startTimer() {
  if (A.timer.running) return;
  const task = canonicalTask($('#taskInput').value);
  if (task !== 'Без задачи' && !A.tasks.includes(task)) A.tasks.push(task);
  if (task !== 'Без задачи') setTaskInputs(task);
  A.timer = { running: true, startedAt: Date.now(), task: task === 'Без задачи' ? '' : task };
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
  $('#focus').classList.toggle('running', run);
  $('#focusToggle').textContent = run ? 'Стоп' : 'Старт';
  refreshClock();
  const idx = buildIndex();
  const t = idx[dateKey(new Date())];
  $('#todayTotal').textContent = fmtDur(t ? t.total : 0);
  $('#taskList').innerHTML = A.tasks.map((t) => `<option value="${esc(t)}">`).join('');
}

function tick() {
  if (!A) return;
  const run = A.timer.running;
  refreshClock();
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

  const names = A.tasks.filter((n) => n !== 'Без задачи');
  const taskRows = names.length
    ? names.map((n) => `
      <div class="item">
        <span class="name" title="${esc(n)}">${esc(n)}</span>
        <span class="time">${fmtDur(totals[n] || 0)}</span>
        <button class="btn small" data-pick="${esc(n)}">Выбрать</button>
        <button class="x" data-deltask="${esc(n)}" title="Убрать из списка">×</button>
      </div>`).join('')
    : '<div class="empty">Пока пусто. Добавьте задачу или просто впишите её в поле над кнопкой «Старт».</div>';

  const groups = today && today.sessions.length ? groupSessions(today.sessions) : [];
  const sessRows = groups.length
    ? groups.map((g) => `
      <div class="item">
        ${g.live ? '<span class="live-dot"></span>' : ''}
        <span class="name">${esc(g.name)}</span>
        ${g.count > 1 ? `<span class="time">×${g.count}</span>` : ''}
        <span class="time">${fmtDur(g.ms)}</span>
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
    const n = b.dataset.deltask;
    if (!confirm(`Убрать «${n}» из списка задач?\nЗаписи времени в календаре и статистике останутся.`)) return;
    A.tasks = A.tasks.filter((t) => t !== n);
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
  const groups = info ? groupSessions(info.sessions) : [];

  const rows = groups.length
    ? groups.map((g) => `
      <div class="item">
        ${g.live ? `<span class="live-dot"></span><span class="name">${esc(g.name)}</span>` :
          `<input data-ids="${g.ids.join(',')}" value="${esc(g.name)}" class="name">`}
        <span class="time">${g.count > 1 ? `×${g.count}<br>` : ''}${fmtDur(g.ms)}</span>
        ${g.live ? '' : `<button class="x" data-delids="${g.ids.join(',')}" data-gname="${esc(g.name)}" title="Удалить записи">×</button>`}
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
  panel.querySelectorAll('input[data-ids]').forEach((inp) => (inp.onchange = () => {
    const ids = inp.dataset.ids.split(',');
    const name = canonicalTask(inp.value);
    A.sessions.forEach((x) => { if (ids.includes(x.id)) x.task = name; });
    if (name !== 'Без задачи' && !A.tasks.includes(name)) A.tasks.push(name);
    save(); renderView();
  }));
  panel.querySelectorAll('[data-delids]').forEach((b) => (b.onclick = () => {
    if (!confirm(`Удалить все записи «${b.dataset.gname}» за этот день?`)) return;
    const ids = b.dataset.delids.split(',');
    A.sessions = A.sessions.filter((x) => !ids.includes(x.id));
    save(); renderView();
  }));
}

/* ---------- stats: график часов ---------- */
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

function dayGoalMs(task) {
  const t = (task || '').trim().toLowerCase();
  const g = A.goals.find((x) => x.period === 'day' && (x.task || '').trim().toLowerCase() === t);
  return g ? g.hours * 3600000 : 0;
}

function chartData(idx) {
  const task = chartTask.trim().toLowerCase();
  const today0 = sod(Date.now()).getTime();
  const goalDay = dayGoalMs(chartTask);
  const pick = (tasksObj) => {
    let ms = 0; const parts = [];
    for (const [nm, v] of Object.entries(tasksObj || {})) {
      if (task && nm.trim().toLowerCase() !== task) continue;
      ms += v; parts.push([nm, v]);
    }
    parts.sort((a, b) => b[1] - a[1]);
    return { ms, parts };
  };
  const a = chartAnchor;
  const points = [];
  let title;
  if (chartMode === 'year') {
    const y = a.getFullYear();
    const agg = Array.from({ length: 12 }, () => ({}));
    for (const [key, info] of Object.entries(idx)) {
      if (Number(key.slice(0, 4)) !== y) continue;
      const m = Number(key.slice(5, 7)) - 1;
      for (const [nm, v] of Object.entries(info.tasks)) agg[m][nm] = (agg[m][nm] || 0) + v;
    }
    for (let m = 0; m < 12; m++) {
      points.push({
        short: MONTHS[m].slice(0, 3), long: `${MONTHS[m]} ${y}`, ...pick(agg[m]),
        future: new Date(y, m, 1).getTime() > today0, goal: goalDay * new Date(y, m + 1, 0).getDate()
      });
    }
    title = String(y);
  } else {
    let start, n;
    if (chartMode === 'week') {
      start = mondayOf(a); n = 7;
      const end = addDays(start, 6);
      title = `${start.getDate()} ${start.getMonth() === end.getMonth() ? '' : MONTHS_GEN[start.getMonth()] + ' '}– ${end.getDate()} ${MONTHS_GEN[end.getMonth()]} ${end.getFullYear()}`;
    } else {
      start = new Date(a.getFullYear(), a.getMonth(), 1);
      n = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
      title = `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    }
    for (let i = 0; i < n; i++) {
      const d = addDays(start, i);
      const info = idx[dateKey(d)];
      points.push({
        short: chartMode === 'week' ? `${DOW[i]} ${d.getDate()}` : String(d.getDate()),
        long: `${cap(DOW_FULL[d.getDay()])}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`,
        ...pick(info && info.tasks), future: d.getTime() > today0, goal: goalDay
      });
    }
  }
  const last = points.reduce((acc, pt, i) => (pt.future ? acc : i), -1);
  const total = points.reduce((sum, pt, i) => sum + (i <= last ? pt.ms : 0), 0);
  return { title, points, last, goalDay, total };
}

function shiftChart(dir) {
  const a = chartAnchor;
  if (chartMode === 'week') chartAnchor = addDays(a, 7 * dir);
  else if (chartMode === 'month') chartAnchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
  else chartAnchor = new Date(a.getFullYear() + dir, 0, 1);
  renderView();
}

function renderWeek() {
  const idx = buildIndex();
  if (chartTask && !A.tasks.includes(chartTask)) chartTask = '';
  const d = chartData(idx);
  const taskOpts = ['<option value="">Все задачи</option>']
    .concat(A.tasks.filter((x) => x !== 'Без задачи').map((x) => `<option value="${esc(x)}" ${x === chartTask ? 'selected' : ''}>${esc(x)}</option>`)).join('');
  const names = { week: 'Неделя', month: 'Месяц', year: 'Год' };

  $('#main').innerHTML = `
    <div class="page-head">
      <h2>${esc(d.title)}</h2>
      <div class="nav-ctrl">
        <div class="seg">${['week', 'month', 'year'].map((k) => `<button data-mode="${k}" class="${chartMode === k ? 'on' : ''}">${names[k]}</button>`).join('')}</div>
        <button class="btn small" id="prevP">‹</button>
        <button class="btn small" id="thisP">Сегодня</button>
        <button class="btn small" id="nextP">›</button>
      </div>
    </div>
    <div class="card">
      <div class="chart-top">
        <div>
          <div class="muted" style="font-size:13px">Часы по ${chartMode === 'year' ? 'месяцам' : 'дням'}</div>
          <div class="big">${fmtDur(d.total)}</div>
        </div>
        <select id="chartTask">${taskOpts}</select>
      </div>
      <div class="chart-wrap"><svg id="chart" viewBox="0 0 860 320" width="100%" role="img" aria-label="График часов"></svg></div>
      <div class="chart-legend">
        <span><i class="lg line"></i>Часы</span>
        ${d.goalDay
          ? `<span><i class="lg dash"></i>Цель: ${fmtDur(d.goalDay)} в день${chartMode === 'year' ? ' (в месяц: умножается на число дней)' : ''}</span>`
          : '<span class="muted">Пунктирная линия цели появится, когда вы поставите цель «в день» на вкладке «Цели».</span>'}
      </div>
      ${d.last < 0 ? '<div class="empty">Этот период ещё не наступил.</div>' : (d.total === 0 ? '<div class="empty">Нет записей за этот период.</div>' : '')}
    </div>`;

  $('#main').querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { chartMode = b.dataset.mode; chartAnchor = new Date(); renderView(); }));
  $('#prevP').onclick = () => shiftChart(-1);
  $('#nextP').onclick = () => shiftChart(1);
  $('#thisP').onclick = () => { chartAnchor = new Date(); renderView(); };
  $('#chartTask').onchange = (e) => { chartTask = e.target.value; renderView(); };
  drawChart(d);
}

function drawChart(d) {
  const svg = $('#chart');
  const W = 860, H = 320, L = 48, R = 18, T = 14, B = 32;
  const pts = d.points, n = pts.length;
  const vals = pts.map((x) => x.ms / 3600000);
  const goals = pts.map((x) => x.goal / 3600000);
  const hasGoal = goals.some((g) => g > 0);
  const max = Math.max(0, ...vals.filter((_, i) => i <= d.last), ...(hasGoal ? goals : []));
  const step = max === 0 ? 1 : ([0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((st) => max * 1.1 / st <= 4.5) || 1000);
  const ymax = max === 0 ? 4 : Math.ceil(max * 1.1 / step) * step;
  const X = (i) => L + i * (W - L - R) / (n - 1);
  const Y = (v) => T + (H - T - B) * (1 - v / ymax);
  const lbl = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  let h = '';
  for (let v = 0; v <= ymax + 1e-9; v += step) {
    h += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line);stroke-width:1"/>`;
    h += `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${lbl(v)}${v + step > ymax + 1e-9 ? ' ч' : ''}</text>`;
  }
  pts.forEach((pt, i) => {
    if (n > 14 ? ((i + 1) % 5 === 0 || i === 0) : true) {
      h += `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${esc(pt.short)}</text>`;
    }
  });
  if (hasGoal) {
    h += `<polyline points="${goals.map((g, i) => `${X(i)},${Y(g)}`).join(' ')}" fill="none" style="stroke:var(--green);stroke-width:1.5;stroke-dasharray:6 5"/>`;
  }
  if (d.last >= 0) {
    const lp = vals.slice(0, d.last + 1).map((v, i) => `${X(i)},${Y(v)}`);
    h += `<path d="M${X(0)},${Y(0)} L${lp.join(' L')} L${X(d.last)},${Y(0)} Z" style="fill:var(--amber);fill-opacity:.14"/>`;
    h += `<polyline points="${lp.join(' ')}" fill="none" style="stroke:var(--amber);stroke-width:2;stroke-linejoin:round;stroke-linecap:round"/>`;
    h += `<circle cx="${X(d.last)}" cy="${Y(vals[d.last])}" r="4" style="fill:var(--amber);stroke:var(--panel);stroke-width:2"/>`;
  }
  h += `<line id="chartXh" y1="${T}" y2="${H - B}" style="stroke:var(--line);stroke-dasharray:3 3;stroke-width:1" opacity="0"/>`;
  h += `<circle id="chartDot" r="5" style="fill:var(--amber);stroke:var(--panel);stroke-width:2" opacity="0"/>`;
  h += `<rect id="chartHit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>`;
  svg.innerHTML = h;

  const xh = $('#chartXh'), dot = $('#chartDot'), hit = $('#chartHit');
  const clear = () => { xh.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); };
  hit.onmousemove = (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / (r.width / W) - L) / ((W - L - R) / (n - 1)));
    if (!(i >= 0 && i <= d.last)) return clear();
    const pt = pts[i];
    xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.setAttribute('opacity', 1);
    dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(vals[i])); dot.setAttribute('opacity', 1);
    let t = `<b>${esc(pt.long)}</b><div class="tl"><span>Всего</span><span>${fmtDur(pt.ms)}</span></div>`;
    pt.parts.slice(0, 5).forEach(([nm, v]) => { t += `<div class="tl"><span>${esc(nm)}</span><span>${fmtDur(v)}</span></div>`; });
    if (!pt.ms) t += '<div class="muted">Нет записей</div>';
    if (pt.goal) t += `<div class="tn">Цель: ${fmtDur(pt.goal)}${pt.ms >= pt.goal ? ' · выполнена' : ''}</div>`;
    showTip(t, e.clientX, e.clientY);
  };
  hit.onmouseleave = clear;
}

/* ---------- goals ---------- */
const PERIODS = { day: 'в день', week: 'в неделю', month: 'в месяц', all: 'всего' };

function goalDone(g, idx) {
  const now = new Date();
  let from = -Infinity, to = Infinity;
  if (g.period === 'day') { from = sod(now.getTime()).getTime(); to = addDays(sod(now.getTime()), 1).getTime(); }
  if (g.period === 'week') { from = mondayOf(now).getTime(); to = addDays(mondayOf(now), 7).getTime(); }
  if (g.period === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(); }
  const name = (g.task || '').trim().toLowerCase();
  let ms = 0;
  for (const [key, info] of Object.entries(idx)) {
    const t = keyToDate(key).getTime();
    if (t < from || t >= to) continue;
    for (const [n, v] of Object.entries(info.tasks)) if (!name || n.trim().toLowerCase() === name) ms += v;
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
            <span class="name">${esc(g.task || 'Все задачи')}</span>
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
        <input id="goalTask" list="goalTaskList" placeholder="Задача (пусто: все задачи)" autocomplete="off">
        <datalist id="goalTaskList">${A.tasks.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        <input id="goalHours" type="number" min="0.5" step="0.5" placeholder="Часов" style="max-width:110px;flex:none">
        <select id="goalPeriod" style="max-width:140px;flex:none">
          <option value="day">в день</option><option value="week">в неделю</option><option value="month">в месяц</option><option value="all">всего</option>
        </select>
        <button id="addGoal" class="btn primary" style="flex:none">Добавить</button>
      </div>
      <div id="goalErr" class="error"></div>
    </div>
    <div class="card"><h3>Мои цели</h3>${rows}</div>`;

  $('#addGoal').onclick = () => {
    const task = $('#goalTask').value.trim();
    const hours = parseFloat(String($('#goalHours').value).replace(',', '.'));
    if (!(hours > 0)) return ($('#goalErr').textContent = 'Укажите количество часов больше нуля.');
    let t = '';
    if (task) { t = canonicalTask(task); if (!A.tasks.includes(t)) A.tasks.push(t); }
    A.goals.push({ id: uid(), task: t, hours, period: $('#goalPeriod').value });
    save(); renderView();
  };
  $('#main').querySelectorAll('[data-delgoal]').forEach((b) => (b.onclick = () => {
    A.goals = A.goals.filter((g) => g.id !== b.dataset.delgoal);
    save(); renderView();
  }));
}

/* ======================= cloud sync ======================= */
const tokens = new WeakMap(); // idToken живёт только в памяти
let syncing = false, syncAgain = null, syncTimer = null;

function setSync(text, cls) {
  const el = $('#syncState');
  if (el) { el.textContent = text; el.className = 'sync ' + (cls || ''); }
}

function typing() {
  const ae = document.activeElement;
  return !!(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && $('#app').contains(ae));
}

function scheduleSync() {
  if (!Cloud.enabled() || !ACC || !ACC.uid) return;
  const acc = ACC;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(acc), 3000);
}

async function getToken(acc) {
  const t = tokens.get(acc);
  if (t && Date.now() < t.exp - 60000) return t.id;
  const reauth = () => { const e = new Error('reauth'); e.code = 'reauth'; return e; };
  if (!acc.refreshToken) throw reauth();
  try {
    const r = await Cloud.refresh(acc.refreshToken);
    acc.refreshToken = r.refreshToken || acc.refreshToken;
    tokens.set(acc, { id: r.idToken, exp: r.exp });
    persist();
    return r.idToken;
  } catch (e) {
    if (e.code === 'network') throw e;
    throw reauth();
  }
}

// Слияние при конфликте (правки на двух устройствах): записи объединяются, остальное берётся из более новой версии
function mergeData(a, b) {
  const [older, newer] = (a._u || 0) >= (b._u || 0) ? [b, a] : [a, b];
  const out = JSON.parse(JSON.stringify(newer));
  const seen = new Set(out.sessions.map((x) => x.id));
  for (const x of older.sessions || []) if (!seen.has(x.id)) out.sessions.push(x);
  out.sessions.sort((x, y) => x.start - y.start);
  for (const t of older.tasks || []) if (!out.tasks.some((x) => x.toLowerCase() === t.toLowerCase())) out.tasks.push(t);
  out.days = { ...(older.days || {}), ...(out.days || {}) };
  const gids = new Set(out.goals.map((g) => g.id));
  for (const g of older.goals || []) if (!gids.has(g.id)) out.goals.push(g);
  return out;
}

function adopt(acc, data, base) {
  acc.data = data; acc.base = base; persist();
  if (ACC !== acc) return;
  A = acc.data; normalize(A);
  if (A.timer.running) setTaskInputs(A.timer.task || '');
  renderView();
}

async function syncNow(acc = ACC) {
  if (!Cloud.enabled() || !acc || !acc.uid) return;
  if (syncing) { syncAgain = acc; return; }
  syncing = true;
  const show = (t, c) => { if (ACC === acc) setSync(t, c); };
  show('Синхронизация…', '');
  try {
    const token = await getToken(acc);
    const remote = await Cloud.getDoc(acc.uid, token);
    const local = acc.data;
    const base = acc.base || 0;
    const lu = local._u || 0;
    const put = async (data, ts) => {
      if (JSON.stringify(data).length > 900000) { const e = new Error('toolarge'); e.code = 'toolarge'; throw e; }
      await Cloud.putDoc(acc.uid, token, data, ts);
      acc.base = ts; persist();
    };
    if (!remote || !remote.data) {
      local._u = lu || Date.now();
      await put(local, local._u);
    } else if (remote.updatedAt === base) {
      if (lu > base) await put(local, lu);
    } else if (ACC === acc && typing()) {
      syncTimer = setTimeout(() => syncNow(acc), 5000);
      show('Ждём окончания ввода…', '');
      return;
    } else {
      const rd = normalize(remote.data);
      if (lu <= base) {
        adopt(acc, rd, remote.updatedAt);
      } else {
        const merged = mergeData(local, rd);
        merged._u = Date.now();
        await put(merged, merged._u);
        adopt(acc, merged, merged._u);
      }
    }
    show('Облако: синхронизировано ' + fmtClock(Date.now()), 'ok');
  } catch (e) {
    if (e.code === 'network') show('Нет связи. Данные сохранены на этом устройстве', '');
    else if (e.code === 'denied') show('Нет доступа к облаку. Проверьте правила Firestore', 'err');
    else if (e.code === 'toolarge') show('Данных слишком много для облака', 'err');
    else if (e.code === 'reauth') show('Войдите заново, чтобы продолжить синхронизацию', 'err');
    else show('Ошибка синхронизации', 'err');
  } finally {
    syncing = false;
    if (syncAgain) { const a = syncAgain; syncAgain = null; setTimeout(() => syncNow(a), 500); }
  }
}

/* ======================= auth ======================= */
function authError(msg) { $('#authError').textContent = msg; }
function busy(on) {
  $('#loginBtn').disabled = on; $('#registerBtn').disabled = on;
  if (on) authError('Подождите…');
  else if ($('#authError').textContent === 'Подождите…') authError('');
}
const findKey = (l) => Object.keys(db.accounts).find((k) => k.toLowerCase() === l.toLowerCase());
const isBadCreds = (e) => ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_EMAIL'].includes(e.code);

function cloudMsg(e) {
  const m = {
    network: 'Нет связи с сервером. Проверьте интернет.',
    EMAIL_EXISTS: 'Такой аккаунт уже есть. Нажмите «Войти».',
    WEAK_PASSWORD: 'Пароль слишком простой: нужно минимум 6 символов.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Слишком много попыток. Подождите немного и повторите.',
    OPERATION_NOT_ALLOWED: 'В Firebase не включён вход по email и паролю.',
    API_KEY: 'Неверный apiKey в файле cloud-config.js.'
  };
  return m[e.code] || 'Ошибка облака: ' + (e.message || e.code);
}

// Проверка пароля на этом устройстве. Старые аккаунты (пароль открытым текстом) переводятся на хеш.
async function verifyLocal(acc, p) {
  if (acc.pass) return window.api.verify(p, acc.pass);
  if (acc.password !== undefined && acc.password === p) {
    acc.pass = await window.api.hash(p);
    delete acc.password;
    persist();
    return true;
  }
  return false;
}

// Вход с запоминанием на этом устройстве (автовход при следующем запуске)
function signInTo(login) {
  db.autoLogin = $('#rememberMe').checked ? login : '';
  return enterApp(login);
}

async function enterApp(login) {
  user = login;
  ACC = db.accounts[login];
  ACC.data = ACC.data || {};
  A = ACC.data;
  normalize(A);
  db.lastLogin = login;
  persist();
  if (Cloud.enabled() && ACC.uid && !ACC.base) await syncNow(ACC); // новое устройство: сначала подтягиваем данные
  A = ACC.data;
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userName').textContent = login;
  setTaskInputs(A.timer.running ? A.timer.task : '');
  view = 'tasks';
  selKey = dateKey(new Date());
  const n = new Date();
  vm = { y: n.getFullYear(), m: n.getMonth() };
  chartAnchor = n;
  setSync(Cloud.enabled() && ACC.uid ? 'Облако: подключение…' : 'Облако не настроено: данные только на этом компьютере', '');
  renderView();
  if (ACC.uid) syncNow(ACC);
}

function logout() {
  closeFocus();
  db.autoLogin = ''; persist(); // после «Выйти» автовход отключается до следующего входа
  if (A && A.timer.running) { A.timer.task = $('#taskInput').value.trim(); save(); }
  if (ACC && ACC.uid) { clearTimeout(syncTimer); syncNow(ACC); } // последние изменения уходят в облако
  user = null; A = null; ACC = null;
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#passInput').value = '';
  $('#authError').textContent = '';
  $('#loginInput').value = db.lastLogin || '';
  hideTip();
}

async function doLogin() {
  const l = $('#loginInput').value.trim(), p = $('#passInput').value;
  if (!l || !p) return authError('Введите логин и пароль.');
  busy(true);
  try {
    const key = findKey(l);
    const acc = key ? db.accounts[key] : null;

    if (!Cloud.enabled()) {
      if (!acc || !(await verifyLocal(acc, p))) return authError('Неверный логин или пароль.');
      return await signInTo(key);
    }

    const email = await window.api.emailFor(l);
    let session;
    try {
      session = await Cloud.signIn(email, p);
    } catch (e) {
      if (e.code === 'network') {
        // нет интернета: входим по локальному хешу пароля
        if (acc && (await verifyLocal(acc, p))) return await signInTo(key);
        return authError(acc ? 'Неверный логин или пароль.' : 'Нет связи с сервером. Проверьте интернет.');
      }
      if (!isBadCreds(e)) return authError(cloudMsg(e));
      if (acc && (await verifyLocal(acc, p))) {
        // аккаунт был создан до появления облака: переносим его в облако
        try { session = await Cloud.signUp(email, p); }
        catch (e2) {
          if (e2.code === 'EMAIL_EXISTS') return authError('Такой аккаунт уже есть в облаке с другим паролем.');
          return authError(cloudMsg(e2));
        }
      } else {
        return authError('Неверный логин или пароль.');
      }
    }

    const k = key || l;
    const a = db.accounts[k] || (db.accounts[k] = { data: {} });
    a.pass = await window.api.hash(p);
    delete a.password;
    a.uid = session.uid;
    a.refreshToken = session.refreshToken;
    tokens.set(a, { id: session.idToken, exp: session.exp });
    await signInTo(k);
  } finally {
    busy(false);
  }
}

async function doRegister() {
  const l = $('#loginInput').value.trim(), p = $('#passInput').value;
  if (!l || !p) return authError('Введите логин и пароль.');
  if (p.length < 6) return authError('Пароль должен быть не короче 6 символов.');
  if (findKey(l)) return authError('Такой аккаунт уже есть. Нажмите «Войти».');
  busy(true);
  try {
    let session = null;
    if (Cloud.enabled()) {
      try { session = await Cloud.signUp(await window.api.emailFor(l), p); }
      catch (e) { return authError(e.code === 'network' ? 'Нет связи с сервером. Аккаунт можно создать только при подключении к интернету.' : cloudMsg(e)); }
    }
    const a = { pass: await window.api.hash(p), data: {} };
    if (session) { a.uid = session.uid; a.refreshToken = session.refreshToken; tokens.set(a, { id: session.idToken, exp: session.exp }); }
    db.accounts[l] = a;
    await signInTo(l);
  } finally {
    busy(false);
  }
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
  $('#taskInput').oninput = () => { $('#focusTask').value = $('#taskInput').value; refreshClock(); };
  $('#taskInput').onchange = commitTask;
  $('#focusTask').oninput = () => { $('#taskInput').value = $('#focusTask').value; refreshClock(); };
  $('#focusTask').onchange = commitTask;
  $('#focusToggle').onclick = () => (A.timer.running ? stopTimer() : startTimer());
  $('#focusBack').onclick = closeFocus;
  $('#clock').ondblclick = openFocus;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFocus(); });
  document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => { view = b.dataset.view; renderView(); }));
  if (!Cloud.enabled()) {
    $('#cloudNote').textContent = 'Облако не настроено: данные хранятся только на этом компьютере';
    $('#cloudNote').classList.remove('hidden');
  }
  $('#syncState').onclick = () => syncNow();
  setInterval(() => syncNow(), 60000);
  window.addEventListener('focus', () => syncNow());
  window.api.version().then((v) => ($('#ver').textContent = 'v' + v));
  window.api.onUpdate(renderUpdate);
  window.api.updateStatus().then(renderUpdate);
  setInterval(tick, 250);
  if (db.autoLogin && db.accounts[db.autoLogin]) await enterApp(db.autoLogin); // автовход
})();
