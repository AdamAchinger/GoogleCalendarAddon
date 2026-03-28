// gantt.js — Gantt chart logic for Google Calendar Extension
'use strict';

// ── Constants (must match CSS custom properties) ──────────────────────────────
const HOUR_W       = 64;   // px per 1 hour  (--hour-w)
const ROW_H        = 42;   // px per event row (--row-h)
const GROUP_H      = 30;   // px per group header (--group-h)
const TOTAL_HOURS  = 24;   // 0:00 – 24:00
const TOTAL_W      = HOUR_W * TOTAL_HOURS; // 1536 px

// ── State ─────────────────────────────────────────────────────────────────────
let allEvents    = [];
let currentDate  = new Date();
let gcalTabId    = null;
const tooltip    = document.getElementById('gantt-tooltip');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Grab tabId from URL query string (passed by popup.js)
  const params = new URLSearchParams(window.location.search);
  if (params.get('tabId')) gcalTabId = parseInt(params.get('tabId'), 10);

  updateDateDisplay();

  document.getElementById('btn-prev')   .addEventListener('click', shiftDay.bind(null, -1));
  document.getElementById('btn-next')   .addEventListener('click', shiftDay.bind(null,  1));
  document.getElementById('btn-today')  .addEventListener('click', goToday);
  document.getElementById('btn-refresh').addEventListener('click', fetchAndRender);
  document.getElementById('btn-retry')  .addEventListener('click', fetchAndRender);

  await fetchAndRender();
});

// ── Navigation ────────────────────────────────────────────────────────────────
function shiftDay(delta) {
  currentDate = new Date(currentDate);
  currentDate.setDate(currentDate.getDate() + delta);
  updateDateDisplay();
  renderChart();          // re-filter already-loaded events — no new fetch needed
}

async function goToday() {
  currentDate = new Date();
  updateDateDisplay();
  await fetchAndRender(); // fetch fresh data when jumping to today
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchAndRender() {
  showState('loading');
  try {
    if (!gcalTabId) {
      const tabs = await chrome.tabs.query({ url: '*://calendar.google.com/*' });
      if (!tabs.length)
        throw new Error(
          'Nie znaleziono otwartej karty Google Calendar.\nOtwórz calendar.google.com i spróbuj ponownie.'
        );
      gcalTabId = tabs[0].id;
    }

    const resp = await chrome.tabs.sendMessage(gcalTabId, { action: 'GET_GANTT_DATA' });

    if (!resp?.success)
      throw new Error(resp?.error || 'Brak odpowiedzi od content.js — odśwież kartę Google Calendar.');

    allEvents = resp.data.events ?? [];
    renderChart();
  } catch (e) {
    console.error('[Gantt] fetch error:', e);
    showState('error', e.message);
  }
}

// ── Chart rendering ───────────────────────────────────────────────────────────
function renderChart() {
  const dateKey = toDateKey(currentDate);

  // 1. Filter events for the selected day.
  //    If events carry no date info, show all of them (GCal day-view case).
  let dayEvents = allEvents.filter(ev => !ev.date || ev.date === dateKey);
  if (!dayEvents.length && allEvents.length) dayEvents = allEvents;

  if (!dayEvents.length) { showState('empty'); return; }

  const groups = groupByCalendar(dayEvents);

  renderYAxis(groups);
  renderRuler();
  renderGanttBody(groups);
  renderLegend(groups);
  renderStats(dayEvents);
  syncScroll();
  scrollToFirstEvent(dayEvents);

  showState('chart');
}

// ── Grouping ──────────────────────────────────────────────────────────────────
function groupByCalendar(events) {
  const map = new Map();
  events.forEach(ev => {
    if (!map.has(ev.calendarName))
      map.set(ev.calendarName, { name: ev.calendarName, color: ev.color, events: [] });
    map.get(ev.calendarName).events.push(ev);
  });
  // Sort within each group by start time
  map.forEach(g => g.events.sort((a, b) => compareTime(a.startTime, b.startTime)));
  // Sort groups alphabetically
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

// ── Y-axis (left sidebar) ─────────────────────────────────────────────────────
function renderYAxis(groups) {
  const body = document.getElementById('y-axis-body');
  let html = '';
  groups.forEach(g => {
    html += `
      <div class="y-cal-row">
        <div class="y-group-dot" style="background:${esc(g.color)}"></div>
        <div class="y-group-name" title="${esc(g.name)}">${esc(g.name)}</div>
      </div>`;
  });
  body.innerHTML = html;
}

// ── Time ruler ────────────────────────────────────────────────────────────────
function renderRuler() {
  const ruler = document.getElementById('time-ruler');
  const nowH   = new Date().getHours();
  const isToday = sameDay(currentDate, new Date());

  let html = '';
  for (let h = 0; h <= TOTAL_HOURS; h++) {
    const isCurrent = isToday && h === nowH;
    html += `<div class="ruler-cell${isCurrent ? ' now-hour' : ''}">
      ${h < TOTAL_HOURS ? String(h).padStart(2,'0') + ':00' : ''}
    </div>`;
  }
  ruler.innerHTML = html;
  ruler.style.minWidth = TOTAL_W + 'px';
}

// ── Gantt body (event bars) ───────────────────────────────────────────────────
function renderGanttBody(groups) {
  const body    = document.getElementById('gantt-body');
  const isToday = sameDay(currentDate, new Date());
  body.innerHTML = '';
  body.style.minWidth = TOTAL_W + 'px';

  // Current-time vertical line
  if (isToday) {
    const now  = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const line = el('div', 'now-line');
    line.style.left = px(mins / 60 * HOUR_W);
    body.appendChild(line);
  }

  groups.forEach(g => {
    // One single row per calendar — all events rendered as bars inside it
    const row = el('div', 'gc-cal-row');

    g.events.forEach(ev => {
      const startMin = toMinutes(ev.startTime);
      const endMin   = toMinutes(ev.endTime);

      if (startMin != null && endMin != null) {
        const durMin = endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
        const left   = startMin / 60 * HOUR_W;
        const width  = Math.max(durMin / 60 * HOUR_W, 6);

        const bar = el('div', 'gc-bar');
        bar.style.left            = px(left);
        bar.style.width           = px(width);
        bar.style.backgroundColor = ev.color;

        const label = el('span', 'gc-bar-text');
        label.textContent = `${ev.startTime}–${ev.endTime}  ${ev.title}`;
        bar.appendChild(label);

        // Tooltip events
        bar.addEventListener('mouseenter', e => showTooltip(e, ev, durMin));
        bar.addEventListener('mousemove',  moveTooltip);
        bar.addEventListener('mouseleave', hideTooltip);

        row.appendChild(bar);
      }
    });

    body.appendChild(row);
  });
}

// ── Legend & stats ────────────────────────────────────────────────────────────
function renderLegend(groups) {
  document.getElementById('legend').innerHTML = groups.map(g => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${esc(g.color)}"></div>
      <span>${esc(g.name)} <em style="opacity:.55">(${g.events.length})</em></span>
    </div>`).join('');
}

function renderStats(events) {
  const total = events.reduce((sum, ev) => {
    const s = toMinutes(ev.startTime), e = toMinutes(ev.endTime);
    return (s != null && e != null) ? sum + (e > s ? e - s : e + 1440 - s) : sum;
  }, 0);
  const h = Math.floor(total / 60), m = total % 60;
  document.getElementById('stats').textContent =
    `${events.length} wydarzeń · łącznie ${h}:${String(m).padStart(2,'0')} h`;
}

// ── Scroll sync (Y-axis mirrors chart-scroll vertically) ─────────────────────
function syncScroll() {
  const scroll  = document.getElementById('chart-scroll');
  const yBody   = document.getElementById('y-axis-body');
  // Remove old listener by cloning the node
  const fresh = scroll.cloneNode(false);
  while (scroll.firstChild) fresh.appendChild(scroll.firstChild);
  scroll.parentNode.replaceChild(fresh, scroll);
  fresh.id = 'chart-scroll';

  // Restore children reference
  document.getElementById('chart-scroll').addEventListener('scroll', () => {
    yBody.scrollTop = document.getElementById('chart-scroll').scrollTop;
  });
}

// Scroll so the first event today is visible on load
function scrollToFirstEvent(events) {
  const earliest = events
    .map(ev => toMinutes(ev.startTime))
    .filter(m => m != null)
    .reduce((a, b) => Math.min(a, b), Infinity);

  if (isFinite(earliest)) {
    const scroll = document.getElementById('chart-scroll');
    // Scroll 1 hour before the earliest event
    scroll.scrollLeft = Math.max(0, (earliest / 60 - 1) * HOUR_W);
  }
}

// ── UI state machine ──────────────────────────────────────────────────────────
function showState(name, msg) {
  ['loading', 'error', 'empty', 'chart'].forEach(s => {
    const el = document.getElementById(s === 'chart' ? 'gantt-wrapper' : `state-${s}`);
    if (el) el.classList.add('hidden');
  });

  if (name === 'chart') {
    document.getElementById('gantt-wrapper').classList.remove('hidden');
  } else {
    const el = document.getElementById(`state-${name}`);
    if (el) el.classList.remove('hidden');
    if (name === 'error' && msg) {
      document.getElementById('error-msg').textContent = msg;
    }
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function showTooltip(e, ev, durMin) {
  const h = Math.floor(durMin / 60), m = durMin % 60;
  const durStr = h > 0 ? `${h} h ${m} min` : `${m} min`;

  document.getElementById('tt-title').textContent = ev.title;
  document.getElementById('tt-time' ).textContent = `${ev.startTime} – ${ev.endTime}  (${durStr})`;
  document.getElementById('tt-dot'  ).style.background = ev.color;
  document.getElementById('tt-cal'  ).textContent = ev.calendarName;

  tooltip.classList.add('visible');
  moveTooltip(e);
}
function moveTooltip(e) {
  const t = tooltip;
  const vw = window.innerWidth, vh = window.innerHeight;
  let  x = e.clientX + 14, y = e.clientY - 8;
  if (x + 250 > vw) x = e.clientX - 250 - 6;
  if (y + 100 > vh) y = e.clientY - 110;
  t.style.left = px(x);
  t.style.top  = px(y);
}
function hideTooltip() { tooltip.classList.remove('visible'); }

// ── Date helpers ──────────────────────────────────────────────────────────────
const MONTHS_PL = ['stycznia','lutego','marca','kwietnia','maja','czerwca',
                   'lipca','sierpnia','września','października','listopada','grudnia'];
const DOW_PL    = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];

function updateDateDisplay() {
  const d = currentDate;
  document.getElementById('date-display').textContent =
    `${DOW_PL[d.getDay()]}, ${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function toMinutes(t) {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

function compareTime(a, b) {
  return (toMinutes(a) ?? 0) - (toMinutes(b) ?? 0);
}

// ── DOM / HTML helpers ────────────────────────────────────────────────────────
function el(tag, cls) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
}
function px(n) { return n + 'px'; }
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
