document.addEventListener('DOMContentLoaded', async () => {
  // Set up tab navigation
  setupTabs();
  
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
  
  // Monthly Progress Chart
  initMonthlyProgressChart(tabHistory);
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

function initMonthlyProgressChart(tabHistory) {
  // Prepare data - group by month
  const monthlyData = {};
  
  tabHistory.forEach(entry => {
    const date = new Date(entry.date);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        counts: [],
        label: new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date)
      };
    }
    
    monthlyData[monthKey].counts.push(entry.count);
  });
  
  // Calculate monthly stats
  const labels = [];
  const maxCounts = [];
  const avgCounts = [];
  const minCounts = [];
  
  Object.keys(monthlyData).sort().forEach(key => {
    const data = monthlyData[key];
    labels.push(data.label);
    
    const counts = data.counts;
    maxCounts.push(Math.max(...counts));
    avgCounts.push(Math.round(counts.reduce((sum, count) => sum + count, 0) / counts.length));
    minCounts.push(Math.min(...counts));
  });
  
  // Create chart
  const ctx = document.getElementById('monthlyProgressChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Maximum',
          data: maxCounts,
          backgroundColor: 'rgba(231, 76, 60, 0.7)'
        },
        {
          label: 'Average',
          data: avgCounts,
          backgroundColor: 'rgba(52, 152, 219, 0.7)'
        },
        {
          label: 'Minimum',
          data: minCounts,
          backgroundColor: 'rgba(46, 204, 113, 0.7)'
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
      chrome.tabs.update(tabId, { active: true });
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
}

function setupEventListeners() {
  // Filter and search functionality
  const searchInput = document.getElementById('searchInput');
  const ageFilter = document.getElementById('ageFilter');
  const sortOption = document.getElementById('sortOption');
  
  searchInput.addEventListener('input', applyFilters);
  ageFilter.addEventListener('change', applyFilters);
  sortOption.addEventListener('change', applyFilters);
  
  // Settings form
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  const resetPeakBtn = document.getElementById('resetPeakBtn');
  resetPeakBtn.addEventListener('click', resetPeakTabCount);
  
  const clearDataBtn = document.getElementById('clearDataBtn');
  clearDataBtn.addEventListener('click', clearAllData);
  
  // Old tabs check button
  const checkOldTabsBtn = document.getElementById('checkOldTabsBtn');
  checkOldTabsBtn.addEventListener('click', checkOldTabs);
  
  // Export buttons
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  exportCsvBtn.addEventListener('click', exportTabsToCsv);
  
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  exportJsonBtn.addEventListener('click', exportTabsToJson);
  
  // Import button
  const importJsonBtn = document.getElementById('importJsonBtn');
  importJsonBtn.addEventListener('click', importTabsFromJson);
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
          return age < oneDay;
        case 'week':
          return age >= oneDay && age < oneWeek;
        case 'month':
          return age >= oneWeek && age < oneMonth;
        case 'older':
          return age >= oneMonth;
        default:
          return true;
      }
    });
  }
  
  // Apply sorting
  switch (sortValue) {
    case 'age-desc':
      filteredTabs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      break;
    case 'age-asc':
      filteredTabs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    oldTabThreshold: parseInt(document.getElementById('oldTabThreshold').value) || 30
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
    
    showMessage('Settings saved successfully!');
  } catch (error) {
    showError('Failed to save settings. Please try again.');
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

async function exportTabsToCsv() {
  try {
    const { tabData } = await new Promise((resolve) => {
      chrome.storage.local.get(['tabData'], resolve);
    });
    
    const tabs = tabData.tabs || [];
    
    if (tabs.length === 0) {
      showError('No tab data to export.');
      return;
    }
    
    const csvContent = exportToCsv(tabs);
    
    // Create a download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-age-tracker-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    
    showMessage('CSV exported successfully.');
  } catch (error) {
    showError('Failed to export CSV. Please try again.');
  }
}

async function exportTabsToJson() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount', 'settings'], resolve);
    });
    
    if (!data.tabData || !data.tabData.tabs || data.tabData.tabs.length === 0) {
      showError('No tab data to export.');
      return;
    }
    
    const jsonContent = JSON.stringify(data, null, 2);
    
    // Create a download link
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-age-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    
    showMessage('JSON exported successfully.');
  } catch (error) {
    showError('Failed to export JSON. Please try again.');
  }
}

async function importTabsFromJson() {
  const fileInput = document.getElementById('importFileInput');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    showError('Please select a file to import.');
    return;
  }
  
  if (!confirm('Importing data will replace your current data. Are you sure you want to continue?')) {
    return;
  }
  
  try {
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        
        // Validate the data
        if (!jsonData.tabData || !Array.isArray(jsonData.tabData.tabs)) {
          throw new Error('Invalid data format.');
        }
        
        // Save to storage
        await new Promise((resolve) => {
          chrome.storage.local.set(jsonData, resolve);
        });
        
        showMessage('Data imported successfully. Reloading page...');
        
        // Reload the page to refresh the data
        setTimeout(() => {
          location.reload();
        }, 1500);
      } catch (error) {
        showError('Failed to parse the imported file. Please make sure it is a valid JSON export.');
      }
    };
    
    reader.readAsText(file);
  } catch (error) {
    showError('Failed to import data. Please try again.');
  }
}

function getDefaultSettings() {
  return {
    badgeDisplay: 'count',
    colorScheme: 'default',
    dataPeriod: '30',
    tabGoal: 0,
    enableReminders: false,
    notifyOldTabs: true,
    oldTabThreshold: 30
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
