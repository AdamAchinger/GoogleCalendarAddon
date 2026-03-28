// popup.js — GCal Time Duration
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-plugin');

  chrome.storage.sync.get({ pluginEnabled: true }, data => {
    toggle.checked = data.pluginEnabled;
  });

  toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ pluginEnabled: toggle.checked });
  });
});
