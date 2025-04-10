document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Google Analytics if available
  if (typeof initializeAnalytics === 'function') {
    initializeAnalytics();
    // Track page view
    if (typeof trackEvent === 'function') {
      trackEvent('Navigation', 'Page View', 'Options Page');
    }
  }
  
  // Set up tab navigation
  setupTabs();
  
  // Check if Chart.js is loaded properly
  const chartFallbackMessage = document.getElementById('chart-fallback-message');
  if (typeof Chart === 'undefined') {
    console.error('Chart.js is not loaded properly');
    chartFallbackMessage.style.display = 'block';
    chartFallbackMessage.textContent = 'Chart.js library failed to load. Some visualization features may be unavailable.';
  } else {
    chartFallbackMessage.style.display = 'none';
  }
  
  // Load data and initialize UI
  await loadAndInitializeData();
  
  // Set up event listeners
  setupEventListeners();
  
  // If there's a hash in the URL, switch to that tab
  if (window.location.hash) {
    const tabId = window.location.hash.substring(1);
    switchToTab(tabId);
  }
});

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      switchToTab(tabId);
    });
  });
}

function switchToTab(tabId) {
  // Update active tab button
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(button => {
    if (button.getAttribute('data-tab') === tabId) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
  
  // Show the selected tab content, hide others
  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(content => {
    if (content.id === tabId) {
      content.style.display = 'block';
    } else {
      content.style.display = 'none';
    }
  });
  
  // Update URL hash for bookmark-ability
  window.location.hash = tabId;
}

async function loadAndInitializeData() {
  try {
    // Get all data from storage
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount', 'settings'], resolve);
    });
    
    const tabData = data.tabData || { tabs: [], lastUpdated: null };
    const tabHistory = data.tabHistory || [];
    const peakTabCount = data.peakTabCount || 0;
    const settings = data.settings || getDefaultSettings();
    
    // Initialize dashboard
    updateDashboardSummary(tabData, peakTabCount);
    initializeCharts(tabData, tabHistory);
    
    // Initialize details tab
    populateTabsTable(tabData.tabs);
    
    // Initialize settings tab
    initializeSettingsForm(settings);
  } catch (error) {
    console.error('Error loading data:', error);
    showError('Failed to load tab data. Please try reloading the page.');
  }
}

function updateDashboardSummary(tabData, peakTabCount) {
  const tabs = tabData.tabs || [];
  
  // Update summary cards
  document.getElementById('totalTabs').textContent = tabs.length;
  document.getElementById('peakCount').textContent = peakTabCount;
  
  // Calculate progress
  const progressPercent = peakTabCount === 0 ? 100 : Math.max(0, Math.min(100, ((peakTabCount - tabs.length) / peakTabCount) * 100));
  document.getElementById('progressPercent').textContent = `${Math.round(progressPercent)}%`;
  
  // Find oldest tab
  if (tabs.length > 0) {
    const sortedTabs = [...tabs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const oldestTab = sortedTabs[0];
    const age = calculateTabAge(oldestTab.createdAt);
    document.getElementById('oldestTab').textContent = age.label;
  } else {
    document.getElementById('oldestTab').textContent = 'N/A';
  }
}

function initializeCharts(tabData, tabHistory) {
  const tabs = tabData.tabs || [];
  
  // Check if Chart is available
  if (typeof Chart === 'undefined') {
    console.error('Chart.js library not loaded properly');
    // Add fallback text for chart containers
    document.querySelectorAll('.chart-container').forEach(container => {
      const messageDiv = document.createElement('div');
      messageDiv.textContent = 'Chart visualization unavailable';
      messageDiv.style.textAlign = 'center';
      messageDiv.style.padding = '20px';
      messageDiv.style.color = '#999';
      container.appendChild(messageDiv);
    });
    return;
  }
  
  console.log('Chart.js loaded successfully, initializing charts');
  
  // Tab Age Distribution Chart
  initTabAgeChart(tabs);
  
  // Tab Count History Chart
  initHistoryChart(tabHistory);
  
  // Daily Progress Chart
  initDailyProgressChart(tabHistory);
}

function initTabAgeChart(tabs) {
  // Count tabs by age category
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  
  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let olderCount = 0;
  
  tabs.forEach(tab => {
    const createdAt = new Date(tab.createdAt);
    const age = now - createdAt;
    
    if (age < oneDay) {
      todayCount++;
    } else if (age < oneWeek) {
      weekCount++;
    } else if (age < oneMonth) {
      monthCount++;
    } else {
      olderCount++;
    }
  });
  
  // Create chart
  const ctx = document.getElementById('tabAgeChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Opened Today', 'Open 1-7 Days', 'Open 8-30 Days', 'Open >30 Days'],
      datasets: [{
        data: [todayCount, weekCount, monthCount, olderCount],
        backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#e74c3c'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right'
        }
      }
    }
  });
}

function initHistoryChart(tabHistory) {
  // Prepare data
  const sortedHistory = [...tabHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const labels = [];
  const counts = [];
  
  sortedHistory.forEach(entry => {
    // Format the date (MM/DD)
    const date = new Date(entry.date);
    const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
    
    labels.push(formattedDate);
    counts.push(entry.count);
  });
  
  // Create chart
  const ctx = document.getElementById('historyChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tab Count',
        data: counts,
        backgroundColor: 'rgba(52, 152, 219, 0.2)',
        borderColor: 'rgba(52, 152, 219, 1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function initDailyProgressChart(tabHistory) {
  // Change from monthly to daily progress view
  if (!tabHistory || tabHistory.length === 0) {
    // Display a message if no data is available
    const ctx = document.getElementById('monthlyProgressChart').getContext('2d');
    ctx.font = '14px Arial';
    ctx.fillText('No tab history data available yet', 10, 50);
    return;
  }
  
  // Sort by date and get the most recent days (up to 14 days)
  const recentHistory = [...tabHistory]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-14);
  
  // Prepare the data arrays
  const labels = [];
  const counts = [];
  
  recentHistory.forEach(entry => {
    const date = new Date(entry.date);
    labels.push(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date));
    counts.push(entry.count);
  });
  
  // Calculate a 3-day rolling average
  const avgCounts = [];
  for (let i = 0; i < counts.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i-1); j <= Math.min(counts.length-1, i+1); j++) {
      sum += counts[j];
      count++;
    }
    avgCounts.push(Math.round(sum / count));
  }
  
  // Calculate min and max bounds (for visualization)
  const maxCounts = counts.map(count => Math.round(Math.min(count * 1.15, count + 10)));
  const minCounts = counts.map(count => Math.round(Math.max(count * 0.85, count - 10)));
  
  // Create chart
  const ctx = document.getElementById('monthlyProgressChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Maximum',
          data: maxCounts,
          borderColor: 'rgba(231, 76, 60, 1)',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          borderWidth: 2,
          tension: 0.1,
          fill: false
        },
        {
          label: 'Average',
          data: avgCounts,
          borderColor: 'rgba(52, 152, 219, 1)',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          borderWidth: 2,
          tension: 0.1,
          fill: false
        },
        {
          label: 'Minimum',
          data: minCounts,
          borderColor: 'rgba(46, 204, 113, 1)',
          backgroundColor: 'rgba(46, 204, 113, 0.1)',
          borderWidth: 2,
          tension: 0.1,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Helper functions for date formatting and tab age calculation
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function calculateTabAge(dateString) {
  if (!dateString) return { days: -1, label: 'Unknown Age' };
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return { days: -1, label: 'Invalid Date' };
  
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Calculate hours for today
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffTime / (1000 * 60));
      return { days: 0, label: `${diffMinutes} min${diffMinutes !== 1 ? 's' : ''}` };
    }
    return { days: 0, label: `${diffHours} hr${diffHours !== 1 ? 's' : ''}` };
  } else if (diffDays < 7) {
    return { days: diffDays, label: `${diffDays} day${diffDays !== 1 ? 's' : ''}` };
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return { days: diffDays, label: `${weeks} week${weeks !== 1 ? 's' : ''}` };
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return { days: diffDays, label: `${months} month${months !== 1 ? 's' : ''}` };
  } else {
    const years = Math.floor(diffDays / 365);
    return { days: diffDays, label: `${years} year${years !== 1 ? 's' : ''}` };
  }
}

function getAgeColor(dateString) {
  if (!dateString) return '#999999'; // Unknown age
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '#999999'; // Invalid date
  
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 1) return '#2ecc71'; // Today - Green
  if (diffDays < 7) return '#3498db'; // This week - Blue
  if (diffDays < 30) return '#f39c12'; // This month - Orange
  return '#e74c3c'; // Older - Red
}

function populateTabsTable(tabs) {
  const tableBody = document.getElementById('tabsTableBody');
  tableBody.innerHTML = '';
  
  if (!tabs || tabs.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="4" style="text-align: center; padding: 20px;">
        No tabs to display. Your tabs data will appear here when you open tabs.
      </td>
    `;
    tableBody.appendChild(emptyRow);
    return;
  }
  
  // Sort tabs by age (oldest first by default)
  const sortedTabs = [...tabs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  sortedTabs.forEach(tab => {
    const age = calculateTabAge(tab.createdAt);
    const ageColor = getAgeColor(tab.createdAt);
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="tab-info">
          <img class="tab-favicon" src="${tab.favIconUrl || getFaviconFallback(tab.url) || ''}" alt="" onerror="this.style.display='none'">
          <div>
            <div class="tab-title">${sanitize(truncateString(tab.title, 50))}</div>
            <div class="tab-url">${sanitize(truncateString(tab.url, 50))}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="tab-age" style="background-color: ${ageColor};">${age.label}</span>
      </td>
      <td>${formatDate(tab.createdAt)}</td>
      <td>
        <div class="tab-actions">
          <button class="secondary-button open-tab" data-id="${tab.id}">Open</button>
          <button class="danger-button close-tab" data-id="${tab.id}">Close</button>
        </div>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  // Add event listeners to the buttons
  document.querySelectorAll('.open-tab').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = parseInt(button.getAttribute('data-id'));
      // First get the window of the tab to focus that window too
      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
          console.error('Error getting tab:', chrome.runtime.lastError);
          showError(`Could not find tab: ${chrome.runtime.lastError.message}`);
          
          // The tab might not exist anymore, refresh the data
          setTimeout(() => {
            loadAndInitializeData();
          }, 500);
          return;
        }
        
        // Focus the window containing this tab
        chrome.windows.update(tab.windowId, { focused: true }, function() {
          // Then activate the tab
          chrome.tabs.update(tabId, { active: true }, function(updatedTab) {
            if (chrome.runtime.lastError) {
              console.error('Error opening tab:', chrome.runtime.lastError);
              showError(`Could not open tab: ${chrome.runtime.lastError.message}`);
              
              // Refresh the data if there was an error
              setTimeout(() => {
                loadAndInitializeData();
              }, 500);
            }
          });
        });
      });
    });
  });
  
  document.querySelectorAll('.close-tab').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = parseInt(button.getAttribute('data-id'));
      chrome.tabs.remove(tabId, () => {
        // If successful, remove the row
        if (!chrome.runtime.lastError) {
          const row = button.closest('tr');
          row.remove();
        } else {
          console.error('Error closing tab:', chrome.runtime.lastError);
          showError(`Could not close tab: ${chrome.runtime.lastError.message}`);
          // The tab might not exist anymore, we should update the UI
          setTimeout(() => {
            loadAndInitializeData(); // Refresh the data
          }, 500);
        }
      });
    });
  });
}

function initializeSettingsForm(settings) {
  // Set form values based on settings
  document.getElementById('badgeDisplay').value = settings.badgeDisplay;
  document.getElementById('colorScheme').value = settings.colorScheme;
  document.getElementById('dataPeriod').value = settings.dataPeriod;
  document.getElementById('tabGoal').value = settings.tabGoal;
  document.getElementById('enableReminders').checked = settings.enableReminders;
  
  // Set values for the new notification settings
  document.getElementById('notifyOldTabs').checked = settings.notifyOldTabs !== undefined ? settings.notifyOldTabs : true;
  document.getElementById('oldTabThreshold').value = settings.oldTabThreshold || 30;
  
  // Set values for server dashboard settings
  document.getElementById('useServerDashboard').checked = settings.useServerDashboard || false;
  document.getElementById('serverUrl').value = settings.serverUrl || 'https://tab-age-tracker.replit.app';
}

function setupEventListeners() {
  // Filter and search functionality
  const searchInput = document.getElementById('searchInput');
  const ageFilter = document.getElementById('ageFilter');
  const sortOption = document.getElementById('sortOption');
  
  if (searchInput && ageFilter && sortOption) {
    searchInput.addEventListener('input', applyFilters);
    ageFilter.addEventListener('change', applyFilters);
    sortOption.addEventListener('change', applyFilters);
  }
  
  // Settings form
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }
  
  const resetPeakBtn = document.getElementById('resetPeakBtn');
  if (resetPeakBtn) {
    resetPeakBtn.addEventListener('click', resetPeakTabCount);
  }
  
  const clearDataBtn = document.getElementById('clearDataBtn');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', clearAllData);
  }
  
  // Old tabs check button
  const checkOldTabsBtn = document.getElementById('checkOldTabsBtn');
  if (checkOldTabsBtn) {
    checkOldTabsBtn.addEventListener('click', checkOldTabs);
  }
  
  // Feedback form submission
  const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
  if (submitFeedbackBtn) {
    submitFeedbackBtn.addEventListener('click', submitFeedback);
  }
  
  // Web Dashboard button
  const openWebDashboardBtn = document.getElementById('openWebDashboardBtn');
  if (openWebDashboardBtn) {
    openWebDashboardBtn.addEventListener('click', openWebDashboard);
  }
  
  // Server sync button (if exists)
  const syncWithServerBtn = document.getElementById('syncWithServerBtn');
  if (syncWithServerBtn) {
    syncWithServerBtn.addEventListener('click', syncWithServer);
  }
}

// Function to manually check for old tabs
async function checkOldTabs() {
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkOldTabs' }, resolve);
    });
    
    showMessage('Old tabs check initiated. If any old tabs are found, you will receive a notification.');
  } catch (error) {
    showError('Failed to check for old tabs. Please try again.');
  }
}

async function applyFilters() {
  const searchInput = document.getElementById('searchInput');
  const ageFilter = document.getElementById('ageFilter');
  const sortOption = document.getElementById('sortOption');
  
  const searchTerm = searchInput.value.toLowerCase();
  const ageFilterValue = ageFilter.value;
  const sortValue = sortOption.value;
  
  // Get tab data
  const { tabData } = await new Promise((resolve) => {
    chrome.storage.local.get(['tabData'], resolve);
  });
  
  let filteredTabs = [...(tabData.tabs || [])];
  
  // Apply search filter
  if (searchTerm) {
    filteredTabs = filteredTabs.filter(tab => 
      (tab.title && tab.title.toLowerCase().includes(searchTerm)) || 
      (tab.url && tab.url.toLowerCase().includes(searchTerm))
    );
  }
  
  // Apply age filter
  if (ageFilterValue !== 'all') {
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    
    filteredTabs = filteredTabs.filter(tab => {
      const createdAt = new Date(tab.createdAt);
      const age = now - createdAt;
      
      switch (ageFilterValue) {
        case 'today':
          // Opened Today (0-24 hours)
          return age < oneDay;
        case 'week':
          // Open 1-7 Days
          return age >= oneDay && age < oneWeek;
        case 'month':
          // Open 8-30 Days
          return age >= oneWeek && age < oneMonth;
        case 'older':
          // Open >30 Days
          return age >= oneMonth;
        default:
          return true;
      }
    });
  }
  
  // Apply sorting
  switch (sortValue) {
    case 'age-desc':
      filteredTabs.sort((a, b) => {
        // Handle null/undefined createdAt values - treat them as oldest
        if (!a.createdAt) return -1; // a is "older" (undefined date)
        if (!b.createdAt) return 1;  // b is "older" (undefined date)
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      break;
    case 'age-asc':
      // This is the "Newest First" option 
      filteredTabs.sort((a, b) => {
        // Track this sorting option for analytics
        try {
          if (typeof trackEvent === 'function') {
            trackEvent('Interaction', 'Sort', 'Newest First');
          }
        } catch (e) { /* Ignore tracking errors */ }
        
        // Handle null/undefined createdAt values - treat them as oldest
        if (!a.createdAt && !b.createdAt) return 0; // Both unknown, no change
        if (!a.createdAt) return 1;  // a is older (unknown date goes last)
        if (!b.createdAt) return -1; // b is older (unknown date goes last)
        
        // Sort newer first (larger timestamp at the top)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      break;
    case 'title':
      filteredTabs.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
      break;
  }
  
  // Update the table
  populateTabsTable(filteredTabs);
}

async function saveSettings() {
  const settings = {
    badgeDisplay: document.getElementById('badgeDisplay').value,
    colorScheme: document.getElementById('colorScheme').value,
    dataPeriod: document.getElementById('dataPeriod').value,
    tabGoal: parseInt(document.getElementById('tabGoal').value) || 0,
    enableReminders: document.getElementById('enableReminders').checked,
    notifyOldTabs: document.getElementById('notifyOldTabs').checked,
    oldTabThreshold: parseInt(document.getElementById('oldTabThreshold').value) || 30,
    // Server dashboard settings
    useServerDashboard: document.getElementById('useServerDashboard').checked,
    serverUrl: document.getElementById('serverUrl').value || 'https://tab-age-tracker.replit.app'
  };
  
  try {
    await new Promise((resolve) => {
      chrome.storage.local.set({ settings }, resolve);
    });
    
    // Trigger a badge update to reflect changes
    chrome.runtime.sendMessage({ action: 'updateBadge' });
    
    // If notifications are enabled, trigger an immediate check for old tabs
    if (settings.notifyOldTabs) {
      chrome.runtime.sendMessage({ action: 'checkOldTabs' });
    }
    
    // If server dashboard is enabled, sync data with the server
    if (settings.useServerDashboard) {
      chrome.runtime.sendMessage({ action: 'syncData' });
    }
    
    showMessage('Settings saved successfully!');
  } catch (error) {
    showError('Failed to save settings. Please try again.');
  }
}

// Function to manually sync data with the server
async function syncWithServer() {
  try {
    // Show sync in progress
    const button = document.getElementById('syncWithServerBtn');
    const originalText = button.textContent;
    button.textContent = 'Syncing...';
    button.disabled = true;
    
    // Send sync message to background script
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'syncData' }, resolve);
    });
    
    // Reset button and show success message
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
      showMessage('Data successfully synced with server.');
    }, 1000);
  } catch (error) {
    showError('Failed to sync data with server. Please try again.');
    // Reset button state
    const button = document.getElementById('syncWithServerBtn');
    button.textContent = 'Sync Data with Server Now';
    button.disabled = false;
  }
}

async function resetPeakTabCount() {
  if (!confirm('Are you sure you want to reset your peak tab count? This will restart your progress tracking.')) {
    return;
  }
  
  try {
    // Get current tab count
    const { tabData } = await new Promise((resolve) => {
      chrome.storage.local.get(['tabData'], resolve);
    });
    
    const currentCount = tabData.tabs?.length || 0;
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ peakTabCount: currentCount }, resolve);
    });
    
    showMessage('Peak tab count has been reset to your current tab count.');
    
    // Reload the page to refresh the data
    location.reload();
  } catch (error) {
    showError('Failed to reset peak tab count. Please try again.');
  }
}

async function clearAllData() {
  if (!confirm('Are you sure you want to clear all tab data? This action cannot be undone.')) {
    return;
  }
  
  try {
    await new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
    
    showMessage('All data has been cleared successfully.');
    
    // Reload the page to refresh the data
    location.reload();
  } catch (error) {
    showError('Failed to clear data. Please try again.');
  }
}

// These functions have been removed as part of v2.1.1 to remove the Export & Import Options section

function getDefaultSettings() {
  return {
    badgeDisplay: 'count',
    colorScheme: 'default',
    dataPeriod: '30',
    tabGoal: 0,
    enableReminders: false,
    notifyOldTabs: true,
    oldTabThreshold: 30,
    // Server dashboard settings
    useServerDashboard: false,
    serverUrl: 'https://tab-age-tracker.replit.app'
  };
}

function showMessage(message) {
  // Create a message element
  const messageElement = document.createElement('div');
  messageElement.className = 'message success';
  messageElement.textContent = message;
  
  // Add to the document
  document.body.appendChild(messageElement);
  
  // Remove after a delay
  setTimeout(() => {
    messageElement.classList.add('fade-out');
    setTimeout(() => {
      document.body.removeChild(messageElement);
    }, 500);
  }, 3000);
}

function showError(message) {
  // Create an error element
  const errorElement = document.createElement('div');
  errorElement.className = 'message error';
  errorElement.textContent = message;
  
  // Add to the document
  document.body.appendChild(errorElement);
  
  // Remove after a delay
  setTimeout(() => {
    errorElement.classList.add('fade-out');
    setTimeout(() => {
      document.body.removeChild(errorElement);
    }, 500);
  }, 5000);
}

// Function to open the web dashboard (empty for now)
function openWebDashboard() {
  // Get the server URL from settings if available
  chrome.storage.local.get(['settings'], (data) => {
    const settings = data.settings || {};
    // Use dashboard.html in the root directory instead of /website/index.html
    let dashboardUrl = chrome.runtime.getURL('/dashboard.html');
    
    // Add server URL to parameters if available
    if (settings.serverUrl) {
      dashboardUrl += `?serverUrl=${encodeURIComponent(settings.serverUrl)}`;
    }
    
    // Open the web dashboard in a new tab
    chrome.tabs.create({ url: dashboardUrl });
  });
}

// Function to export data directly to the web dashboard
async function exportToWebDashboard() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount', 'settings'], resolve);
    });
    
    if (!data.tabData || !data.tabData.tabs || data.tabData.tabs.length === 0) {
      showError('No tab data to export to the dashboard.');
      return;
    }
    
    // Convert data to Base64 to avoid URL issues
    const jsonString = JSON.stringify(data);
    const base64Data = btoa(jsonString);
    
    // Get server URL from settings if available
    const settings = data.settings || {};
    
    // Create dashboard URL with data parameter - use dashboard.html in root
    let dashboardUrl = chrome.runtime.getURL(`/dashboard.html?data=${encodeURIComponent(base64Data)}`);
    
    // Add server URL parameter if available
    if (settings.serverUrl) {
      dashboardUrl += `&serverUrl=${encodeURIComponent(settings.serverUrl)}`;
    }
    
    // Open in a new tab
    chrome.tabs.create({ url: dashboardUrl });
    
    showMessage('Data exported to web dashboard successfully.');
  } catch (error) {
    console.error('Error exporting to web dashboard:', error);
    showError('Failed to export data to web dashboard. Please try again.');
  }
}

// Function to submit feedback to the server
async function submitFeedback() {
  const emailInput = document.getElementById('feedbackEmail');
  const feedbackTextarea = document.getElementById('feedbackText');
  const feedbackStatus = document.getElementById('feedbackStatus');
  const submitButton = document.getElementById('submitFeedbackBtn');
  const feedbackForm = document.querySelector('.feedback-form');
  const successContainer = document.getElementById('feedbackSuccessContainer');
  const successMessage = document.getElementById('feedbackSuccessMessage');
  const feedbackSheetLink = document.getElementById('feedbackSheetLink');
  const googleSheetLink = document.getElementById('googleSheetLink');
  
  // Get values
  const email = emailInput.value.trim();
  const feedback = feedbackTextarea.value.trim();
  
  // Validate
  if (!feedback) {
    feedbackStatus.textContent = 'Please enter your feedback before submitting.';
    feedbackStatus.className = 'feedback-status error-message';
    return;
  }
  
  // Optional email validation
  if (email && !validateEmail(email)) {
    feedbackStatus.textContent = 'Please enter a valid email address.';
    feedbackStatus.className = 'feedback-status error-message';
    return;
  }
  
  try {
    // Show loading state
    submitButton.disabled = true;
    feedbackStatus.textContent = 'Submitting feedback...';
    feedbackStatus.className = 'feedback-status';
    
    // Get server URL from settings if available, or use default
    const { settings } = await new Promise((resolve) => {
      chrome.storage.local.get(['settings'], resolve);
    });
    
    const serverUrl = (settings && settings.serverUrl) || 'https://tab-age-tracker.replit.app';
    const apiUrl = `${serverUrl}/api/submit-feedback`;
    
    // Send feedback to server
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        feedback: feedback
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      // Clear form
      emailInput.value = '';
      feedbackTextarea.value = '';
      
      // Hide the form and show success message
      feedbackForm.style.display = 'none';
      
      // Set success message and show success container
      successMessage.textContent = 'Your feedback has been submitted successfully.';
      successContainer.style.display = 'block';
      
      // Track the feedback submission in analytics
      if (typeof trackEvent === 'function') {
        trackEvent('Interaction', 'Submit Feedback', 'Success')
      }
      
      // Set up the Google Sheet link if available from the response
      if (data.sheetUrl) {
        googleSheetLink.href = data.sheetUrl;
        feedbackSheetLink.style.display = 'block';
      } else {
        // Set Google Sheet URL to actual feedback spreadsheet 
        googleSheetLink.href = 'https://docs.google.com/spreadsheets/d/1e_JZ7a0XJkGRnWt885CnDmXwK-bFSKm6q9UDjYx-iB0';
        feedbackSheetLink.style.display = 'block';
      }
      
      // Set up the "Submit Another Feedback" button
      const submitAnotherBtn = document.getElementById('submitAnotherFeedbackBtn');
      submitAnotherBtn.addEventListener('click', () => {
        successContainer.style.display = 'none';
        feedbackForm.style.display = 'block';
        feedbackStatus.textContent = '';
        feedbackStatus.className = 'feedback-status';
      });
      
      // Also show a toast message
      showMessage('Thanks for submitting your feedback!');
    } else {
      throw new Error(data.message || 'Failed to submit feedback');
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);
    feedbackStatus.textContent = 'Failed to submit feedback. Please try again later.';
    feedbackStatus.className = 'feedback-status error-message';
  } finally {
    submitButton.disabled = false;
  }
}

// Simple email validation function
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
