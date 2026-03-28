// content.js — GCal Time Duration
// Odpowiada wyłącznie za obliczanie i wyświetlanie czasu trwania událeń
// oraz sumowanie zaznaczonych.

// ── Selektory ──────────────────────────────────────────────────────────────────
const EVENT_BOX_SELECTOR = '[data-eventid]';

// ── Stan ───────────────────────────────────────────────────────────────────────
let isPluginEnabled    = true;
let selectedEventIds   = new Set();
let totalDurationMinutes = 0;
const eventKnownDurations = new Map();
const durationCache       = new Map();

// ── Parsowanie czasu ───────────────────────────────────────────────────────────
function parseDuration(timeText) {
  if (durationCache.has(timeText)) return durationCache.get(timeText);

  try {
    const regex = /(\d{1,2}:\d{2})\s*(?:do|-|–)\s*(\d{1,2}:\d{2})/;
    const match = timeText.match(regex);
    if (!match) { durationCache.set(timeText, null); return null; }

    const parseTime = t => {
      const parts = t.trim().split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    const start = parseTime(match[1]);
    const end   = parseTime(match[2]);
    let   dur   = end - start;
    if (dur < 0) dur += 24 * 60; // przejście przez północ

    durationCache.set(timeText, dur);
    return dur;
  } catch (e) {
    return null;
  }
}

// ── Wyświetlacz sumy ───────────────────────────────────────────────────────────
function updateTotalDisplay() {
  let display = document.getElementById('total-duration-display');

  if (!display) {
    display = document.createElement('div');
    display.id = 'total-duration-display';
    document.body.appendChild(display);

    const clearBtn = document.createElement('span');
    clearBtn.innerText   = ' ✖';
    clearBtn.className   = 'clear-sum-btn';
    clearBtn.onclick = () => {
      selectedEventIds.clear();
      totalDurationMinutes = 0;
      document.querySelectorAll('.selected-for-sum').forEach(b => b.classList.remove('selected-for-sum'));
      document.querySelectorAll('.badge-selected').forEach(b => b.classList.remove('badge-selected'));
      updateTotalDisplay();
    };
    display.appendChild(clearBtn);
  }

  if (totalDurationMinutes > 0) {
    const hours = Math.floor(totalDurationMinutes / 60);
    const mins  = totalDurationMinutes % 60;
    let textNode = display.childNodes[0];
    const newText = `Suma: ${hours}:${mins.toString().padStart(2, '0')}h`;

    if (textNode?.nodeType === Node.TEXT_NODE) {
      textNode.nodeValue = newText;
    } else {
      display.insertBefore(document.createTextNode(newText), display.firstChild);
    }
    display.style.display = 'flex';
  } else {
    display.style.display = 'none';
  }
}

// ── Dodawanie badge'y czasu do wydarzeń ────────────────────────────────────────
function addDurationToEvents() {
  if (!isPluginEnabled) return;

  document.querySelectorAll(EVENT_BOX_SELECTOR).forEach(box => {
    if (box.closest('[role="dialog"]')) return;

    const timeText = box.innerText + ' ' + (box.getAttribute('aria-label') || '') + ' ' + (box.textContent || '');
    const duration = parseDuration(timeText);
    if (!duration) return;

    const hours        = Math.floor(duration / 60);
    const mins         = duration % 60;
    const durationStr  = `${hours}:${mins.toString().padStart(2, '0')}h`;
    const eventId      = box.dataset.eventid;
    if (!eventId) return;

    const existing = box.querySelector('.event-duration-badge');

    if (existing) {
      if (existing.innerText !== durationStr) {
        if (selectedEventIds.has(eventId)) {
          const m = existing.innerText.match(/(\d+):(\d+)h/);
          if (m) {
            const oldDur = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
            totalDurationMinutes = totalDurationMinutes - oldDur + duration;
            updateTotalDisplay();
          }
        }
        existing.innerText = durationStr;
        eventKnownDurations.set(eventId, durationStr);
      }
      return;
    }

    eventKnownDurations.set(eventId, durationStr);

    const badge = document.createElement('div');
    badge.className = 'event-duration-badge';

    if (selectedEventIds.has(eventId)) {
      box.classList.add('selected-for-sum');
      badge.classList.add('badge-selected');
    }

    badge.innerText = durationStr;
    badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedEventIds.has(eventId)) {
        box.classList.remove('selected-for-sum');
        badge.classList.remove('badge-selected');
        selectedEventIds.delete(eventId);
        totalDurationMinutes -= duration;
      } else {
        box.classList.add('selected-for-sum');
        badge.classList.add('badge-selected');
        selectedEventIds.add(eventId);
        totalDurationMinutes += duration;
      }
      updateTotalDisplay();
    });

    box.appendChild(badge);
  });
}

// ── MutationObserver ────────────────────────────────────────────────────────────
let updateTimeout = null;
const observer = new MutationObserver(() => {
  if (updateTimeout) cancelAnimationFrame(updateTimeout);
  updateTimeout = requestAnimationFrame(() => addDurationToEvents());
});

// ── Start / Stop ────────────────────────────────────────────────────────────────
function startPlugin() {
  addDurationToEvents();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function stopPlugin() {
  observer.disconnect();
  if (updateTimeout) cancelAnimationFrame(updateTimeout);

  selectedEventIds.clear();
  totalDurationMinutes = 0;

  document.querySelectorAll('.event-duration-badge').forEach(b => b.remove());
  document.querySelectorAll('.selected-for-sum').forEach(b => b.classList.remove('selected-for-sum'));

  const display = document.getElementById('total-duration-display');
  if (display) display.style.display = 'none';
}

// ── Inicjalizacja (Chrome Storage) ─────────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
  chrome.storage.sync.get({ pluginEnabled: true }, data => {
    isPluginEnabled = data.pluginEnabled;
    if (isPluginEnabled) startPlugin();
  });

  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns === 'sync' && changes.pluginEnabled) {
      isPluginEnabled = changes.pluginEnabled.newValue;
      isPluginEnabled ? startPlugin() : stopPlugin();
    }
  });
} else {
  startPlugin();
}
