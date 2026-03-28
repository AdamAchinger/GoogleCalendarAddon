// content.js
// --- KONFIGURACJA SELEKTORÓW DLA GOOGLE CALENDAR ---
const EVENT_BOX_SELECTOR = '[data-eventid]'; 

// Przechowujemy ID zaznaczonych wydarzeń (aby opierać się na Google Calendar po odświeżeniu DOM)
let selectedEventIds = new Set();
let totalDurationMinutes = 0;

// Blokowanie "odświeżania" przy zwykłym przesuwaniu (bez zmiany długości czasu)
let isMouseDown = false;
document.addEventListener('mousedown', () => { isMouseDown = true; });
document.addEventListener('mouseup', () => { 
  isMouseDown = false; 
  // Odtwórz widok natychmiast po upuszczeniu
  requestAnimationFrame(() => addDurationToEvents());
});

// Historia chroniąca przed "obliczaniem na nowo" podczas przesuwania
const eventKnownDurations = new Map();

// Cache dla zoptymalizowania zasobożernych obliczeń 
const durationCache = new Map();

// Funkcja parsująca tekst czasu i zwracająca czas w minutach
function parseDuration(timeText) {
  if (durationCache.has(timeText)) {
    return durationCache.get(timeText);
  }

  try {
    const regex = /(\d{1,2}:\d{2})\s*(?:do|-|–)\s*(\d{1,2}:\d{2})/;
    const match = timeText.match(regex);
    
    if (!match) {
      durationCache.set(timeText, null);
      return null;
    }
    
    const parseTime = (t) => {
      const parts = t.trim().split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    const start = parseTime(match[1]);
    const end = parseTime(match[2]);
    
    let duration = end - start;
    if (duration < 0) duration += 24 * 60; // W przypadku przejścia przez północ
    
    durationCache.set(timeText, duration);
    return duration;
  } catch (e) {
    return null;
  }
}

// Funkcja aktualizująca wyświetlacz łącznego czasu na spodzie ekranu
function updateTotalDisplay() {
  let display = document.getElementById('total-duration-display');
  
  if (!display) {
    display = document.createElement('div');
    display.id = 'total-duration-display';
    document.body.appendChild(display);
    
    // Przycisk "Wyczyść"
    const clearBtn = document.createElement('span');
    clearBtn.innerText = ' ✖';
    clearBtn.className = 'clear-sum-btn';
    clearBtn.onclick = () => {
      selectedEventIds.clear();
      totalDurationMinutes = 0;
      
      // Kasujemy widok w DOM (jeśli klasy zostały)
      document.querySelectorAll('.selected-for-sum').forEach(box => {
        box.classList.remove('selected-for-sum');
      });
      document.querySelectorAll('.badge-selected').forEach(badge => {
        badge.classList.remove('badge-selected');
      });
      
      updateTotalDisplay();
    };
    display.appendChild(clearBtn);
  }
  
  if (totalDurationMinutes > 0) {
    const hours = Math.floor(totalDurationMinutes / 60);
    const mins = totalDurationMinutes % 60;
    
    // Aktualizujemy tylko tekst node
    let textNode = display.childNodes[0];
    const newText = `Suma: ${hours}:${mins.toString().padStart(2, '0')}h`;
    
    if (textNode.nodeType === Node.TEXT_NODE) {
      textNode.nodeValue = newText;
    } else {
      display.insertBefore(document.createTextNode(newText), display.firstChild);
    }
    
    display.style.display = 'flex';
  } else {
    display.style.display = 'none';
  }
}

// Funkcja ciągle aplikująca modyfikacje (naprawia problem odświeżającego się DOM w GCal)
function addDurationToEvents() {
  const eventBoxes = document.querySelectorAll(EVENT_BOX_SELECTOR); 
  
  eventBoxes.forEach(box => {
    // Odczytujemy tekst boxa (korzystamy z memoizacji w parseDuration by działało błyskawicznie)
    let timeText = box.innerText + " " + (box.getAttribute('aria-label') || "") + " " + (box.textContent || "");
    const duration = parseDuration(timeText);
    
    // Jeśli to element bez czasu (np. placeholder lub zadanie całodniowe bez godzin), ignorujemy
    if (!duration) return;
    
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const durationString = `${hours}:${mins.toString().padStart(2, '0')}h`;

    // Wymagamy eventId by nie śledzić śmieciowych "ducchów" kalendarza
    const eventId = box.dataset.eventid;
    if (!eventId) return; 

    const existingBadge = box.querySelector('.event-duration-badge');

    if (existingBadge) {
      // Boliczamy na nowo i podmieniamy tylko czas "zmienianego" zadania
      if (existingBadge.innerText !== durationString) {
        
        // Funkcjonalność sumowania - jeśli zmieniony element był wcześniej w naszej sumie, to zaaktualizuj sumę
        if (selectedEventIds.has(eventId)) {
            const match = existingBadge.innerText.match(/(\d+):(\d+)h/);
            if (match) {
                const oldDur = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
                totalDurationMinutes = totalDurationMinutes - oldDur + duration;
                updateTotalDisplay();
            }
        }
        
        existingBadge.innerText = durationString;
        eventKnownDurations.set(eventId, durationString); // Zaktualizuj historię
      }
      return;
    }
    
    // ZAPOBIEGANIE AKTUALIZACJI PRZY ZWYKŁYM PRZESUWANIU:
    // Jeśli przesuwasz wydarzenie myszką (isMouseDown), sprawdźmy czy jego czas w ogóle uległ zmianie.
    // Jeśli "nie zmienił się czas trwania", nie obliczamy na nowo i pomijamy modyfikację (rozwiązuje to nakładanie ghostingów).
    if (isMouseDown && eventKnownDurations.get(eventId) === durationString) {
       return; 
    }
    
    // Zapisujemy lub aktualizujemy znany nam czas dla tego elementu 
    eventKnownDurations.set(eventId, durationString);

    // Tworzenie delikatnego overlaya na wydarzenie
    const durationBadge = document.createElement('div');
    durationBadge.className = 'event-duration-badge';
    
    // Otworzenie stanu zaznaczenia, gdyby box wyrenderował się ponownie
    if (selectedEventIds.has(eventId)) {
      box.classList.add('selected-for-sum');
      durationBadge.classList.add('badge-selected');
    }
    
    durationBadge.innerText = durationString;
    
    // Nasłuchiwanie na sumowanie
    durationBadge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (selectedEventIds.has(eventId)) {
        box.classList.remove('selected-for-sum');
        durationBadge.classList.remove('badge-selected');
        selectedEventIds.delete(eventId);
        totalDurationMinutes -= duration;
      } else {
        box.classList.add('selected-for-sum');
        durationBadge.classList.add('badge-selected');
        selectedEventIds.add(eventId);
        totalDurationMinutes += duration;
      }
      
      updateTotalDisplay();
    });

    box.appendChild(durationBadge);
  });
}

// Zamiast odświeżać w kółko co 500ms, używamy MutationObserver,
// aby reagować tylko na rzeczywiste zmiany w interfejsie kalendarza i nie przerywać trybu edycji.
let updateTimeout = null;
const observer = new MutationObserver(() => {
  if (updateTimeout) cancelAnimationFrame(updateTimeout);
  
  // Używamy requestAnimationFrame w miejscu setTimeout (300ms) aby interfejs przeliczył
  // zmiany błyskawicznie w kolejnej klatce renderowania. To kompletnie eliminuje migotanie 
  // badgy odświeżających się przy kliknięciu.
  updateTimeout = requestAnimationFrame(() => {
    addDurationToEvents();
  }); 
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});

// Pierwsze uruchomienie
addDurationToEvents();
