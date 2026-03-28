// popup.js — GCal Gantt View
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('open-gantt').addEventListener('click', () => {
    chrome.tabs.query({ url: '*://calendar.google.com/*' }, tabs => {
      const tabId = tabs.length ? tabs[0].id : null;
      const url   = chrome.runtime.getURL('gantt.html') + (tabId ? `?tabId=${tabId}` : '');
      chrome.tabs.create({ url });
      window.close();
    });
  });
});
