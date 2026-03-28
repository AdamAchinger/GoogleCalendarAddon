// content.js — GCal Gantt View
// Odpowiada wyłącznie za ekstrakcję danych wydarzeń z DOM Google Calendar
// i odpowiadanie na wiadomości z gantt.js.

// ── Konwersja kolorów ──────────────────────────────────────────────────────────
function rgbToHex(color) {
  if (!color) return '#888888';
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return color;
  return '#' + [m[1], m[2], m[3]]
    .map(n => parseInt(n).toString(16).padStart(2, '0'))
    .join('');
}

// ── Mapa kolorów kalendarzy (z sidebara GCal) ──────────────────────────────────
function buildCalendarColorMap() {
  const map = {};
  document.querySelectorAll('[data-calid]').forEach(item => {
    const label =
      item.getAttribute('aria-label') ||
      item.querySelector('[aria-label]')?.getAttribute('aria-label') ||
      item.textContent.trim().split('\n')[0].trim();

    const colorEl = item.querySelector('[style*="background-color"]') || item;
    const hex     = rgbToHex(window.getComputedStyle(colorEl).backgroundColor);

    if (label && hex !== '#000000' && hex !== '#ffffff') {
      map[hex] = label;
    }
  });
  return map;
}

// ── Parsowanie jednego boxa wydarzen ──────────────────────────────────────────
function parseEventBox(box, colorMap) {
  if (box.closest('[role="dialog"]')) return null;

  const eventId = box.dataset.eventid;
  if (!eventId) return null;

  // aria-label: "Tytuł, 10:00 – 11:00, środa 28 marca, Nazwa kalendarza"
  const ariaLabel = box.getAttribute('aria-label') || '';
  const innerText  = box.innerText || '';
  const combined   = ariaLabel + ' ' + innerText;

  // Czas trwania
  const timeMatch = combined.match(/(\d{1,2}:\d{2})\s*(?:–|-|do)\s*(\d{1,2}:\d{2})/);
  if (!timeMatch) return null;
  const startTime = timeMatch[1];
  const endTime   = timeMatch[2];

  // Tytuł (pierwsza część aria-label przed przecinkiem)
  const parts = ariaLabel.split(',').map(s => s.trim()).filter(Boolean);
  let title = parts[0] || innerText.split('\n')[0].trim() || 'Wydarzenie';
  if (/^\d{1,2}:\d{2}/.test(title)) title = 'Wydarzenie';

  // Nazwa kalendarza (ostatnia część aria-label, jeśli nie wygląda jak czas/data)
  let calendarName = null;
  const lastPart = parts[parts.length - 1];
  if (
    lastPart &&
    lastPart !== title &&
    !/\d{1,2}:\d{2}/.test(lastPart) &&
    !/\d{4}/.test(lastPart) &&
    lastPart.length > 1 &&
    lastPart.length < 60
  ) {
    calendarName = lastPart;
  }

  // Kolor wydarzenia → hex
  const hex = rgbToHex(window.getComputedStyle(box).backgroundColor);

  // Jeśli nie znaleziono nazwy w aria-label — sprawdź mapę kolorów
  if (!calendarName) {
    calendarName = colorMap[hex] || 'Kalendarz';
  }

  // Data (polskie nazwy miesięcy)
  const MONTHS_PL = {
    'stycznia':0,'lutego':1,'marca':2,'kwietnia':3,
    'maja':4,'czerwca':5,'lipca':6,'sierpnia':7,
    'września':8,'października':9,'listopada':10,'grudnia':11
  };
  let dateStr = null;
  const dateMatch = ariaLabel.match(
    /(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)/i
  );
  if (dateMatch) {
    const day   = parseInt(dateMatch[1]);
    const month = MONTHS_PL[dateMatch[2].toLowerCase()];
    if (month !== undefined) {
      const now = new Date();
      const d   = new Date(now.getFullYear(), month, day);
      if (d < new Date(now.getFullYear(), now.getMonth() - 3, 1)) d.setFullYear(now.getFullYear() + 1);
      dateStr = d.toISOString().split('T')[0];
    }
  }

  return { id: eventId, title, startTime, endTime, color: hex, calendarName, date: dateStr };
}

// ── Główna funkcja ekstrakcji ────────────────────────────────────────────────
function extractGanttData() {
  const colorMap = buildCalendarColorMap();
  const seen     = new Set();
  const events   = [];

  document.querySelectorAll('[data-eventid]').forEach(box => {
    const ev = parseEventBox(box, colorMap);
    if (!ev || seen.has(ev.id)) return;
    seen.add(ev.id);
    events.push(ev);
  });

  return { events, extractedAt: new Date().toISOString() };
}

// ── Listener wiadomości od gantt.js ──────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'GET_GANTT_DATA') {
      try {
        sendResponse({ success: true, data: extractGanttData() });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }
    return true; // keep channel open
  });
}
