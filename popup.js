document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-plugin');

  // Wczytywanie stanu z Chrome Storage (domyślnie plugin jest włączony)
  chrome.storage.sync.get({ pluginEnabled: true }, (data) => {
    toggle.checked = data.pluginEnabled;
  });

  // Zápis nowego stanu przy zmianie switcha
  toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ pluginEnabled: toggle.checked });
  });
});
