// TabSearch - Options Page Logic
// 100% local, no external calls

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const notificationsEnabled = document.getElementById('notificationsEnabled');
  const oldTabThreshold = document.getElementById('oldTabThreshold');
  const badgeDisplay = document.getElementById('badgeDisplay');
  const clearData = document.getElementById('clearData');

  // Load current settings
  await loadSettings();

  // Load settings from storage
  async function loadSettings() {
    const { settings } = await chrome.storage.local.get(['settings']);
    const s = settings || {};

    notificationsEnabled.checked = s.notificationsEnabled !== false;
    oldTabThreshold.value = s.oldTabThreshold || 30;
    badgeDisplay.value = s.badgeDisplay || 'count';
  }

  // Save settings
  async function saveSettings() {
    const settings = {
      notificationsEnabled: notificationsEnabled.checked,
      oldTabThreshold: parseInt(oldTabThreshold.value) || 30,
      badgeDisplay: badgeDisplay.value
    };

    await chrome.storage.local.set({ settings });

    // Update badge immediately
    chrome.runtime.sendMessage({ action: 'updateBadge' });

    showSaveConfirmation();
  }

  // Show save confirmation
  function showSaveConfirmation() {
    const existing = document.querySelector('.save-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.textContent = 'Settings saved';
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // Clear all data
  async function handleClearData() {
    const confirmed = confirm(
      'Are you sure you want to clear all stored data?\n\n' +
      'This will reset tab tracking history. Your actual browser tabs will NOT be affected.'
    );

    if (confirmed) {
      await chrome.storage.local.clear();

      // Reinitialize with defaults
      await chrome.storage.local.set({
        tabs: {},
        settings: {
          notificationsEnabled: true,
          oldTabThreshold: 30,
          badgeDisplay: 'count'
        }
      });

      await loadSettings();
      chrome.runtime.sendMessage({ action: 'updateBadge' });

      alert('All data has been cleared.');
    }
  }

  // Event Listeners
  notificationsEnabled.addEventListener('change', saveSettings);
  oldTabThreshold.addEventListener('change', saveSettings);
  badgeDisplay.addEventListener('change', saveSettings);
  clearData.addEventListener('click', handleClearData);
});
