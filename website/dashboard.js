/**
 * Dashboard.js - Main script for Tab Age Tracker web dashboard
 */

// Chart instances
let distributionChart = null;
let trendChart = null;

// DOM Elements
const importFileInput = document.getElementById('import-file');
const importButton = document.getElementById('import-btn');
const importStatus = document.getElementById('import-status');
const dashboardContent = document.getElementById('dashboard-content');
const tabSearchInput = document.getElementById('tab-search');
const ageFilterSelect = document.getElementById('age-filter');
const tabGroupsContainer = document.getElementById('tab-groups-container');

// Color configuration
const COLORS = {
  today: '#4CAF50',   // Green
  week: '#2196F3',    // Blue
  month: '#FF9800',   // Orange
  older: '#F44336'    // Red
};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  // Set up event listeners
  importButton.addEventListener('click', handleImport);
  tabSearchInput.addEventListener('input', applyFilters);
  ageFilterSelect.addEventListener('change', applyFilters);
  
  // Check if we have data in URL parameters (shared from extension)
  const urlParams = new URLSearchParams(window.location.search);
  const dataParam = urlParams.get('data');
  const serverUrlParam = urlParams.get('serverUrl');
  
  if (dataParam) {
    try {
      // The data is base64 encoded to avoid URL issues
      const decodedData = atob(decodeURIComponent(dataParam));
      const tabData = JSON.parse(decodedData);
      processImportedData(tabData);
      
      // Don't clear URL entirely in case we have a serverUrl parameter
      if (serverUrlParam) {
        window.history.replaceState({}, document.title, window.location.pathname + '?serverUrl=' + encodeURIComponent(serverUrlParam));
      } else {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error('Error processing URL data:', error);
      showImportError('Invalid data in URL. Please try importing directly.');
    }
  }
  
  // Load data from server if available
  loadServerData(serverUrlParam);
});

/**
 * Handle file import
 */
function handleImport() {
  const file = importFileInput.files[0];
  if (!file) {
    showImportError('Please select a file');
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      
      // Get server URL parameter if available
      const urlParams = new URLSearchParams(window.location.search);
      const serverUrl = urlParams.get('serverUrl');
      
      // Process data with server URL awareness
      processImportedData(data);
    } catch (error) {
      showImportError('Invalid JSON file. Please export a valid file from the extension.');
    }
  };
  
  reader.onerror = () => {
    showImportError('Error reading file');
  };
  
  reader.readAsText(file);
}

/**
 * Process the imported data and update the dashboard
 */
function processImportedData(data) {
  // Handle different data formats
  let processedData = {
    tabs: [],
    tabHistory: [],
    peakTabCount: 0
  };
  
  // Case 1: Direct data from the extension with tabData structure
  if (data.tabData && data.tabData.tabs) {
    processedData.tabs = data.tabData.tabs;
    processedData.tabHistory = data.tabHistory || [];
    processedData.peakTabCount = data.peakTabCount || 0;
  }
  // Case 2: Simplified format with just tabs, history, etc.
  else if (data.tabs) {
    processedData.tabs = data.tabs;
    processedData.tabHistory = data.history || data.tabHistory || [];
    processedData.peakTabCount = data.peakTabCount || 0;
  }
  // Invalid data format
  else {
    showImportError('Invalid data format. Missing tab information.');
    return;
  }
  
  // Validate tabs array
  if (!Array.isArray(processedData.tabs)) {
    showImportError('Invalid data format. Tabs must be an array.');
    return;
  }
  
  // Show success message
  importStatus.textContent = 'Data imported successfully!';
  importStatus.style.color = '#4CAF50';
  
  // Show dashboard content
  dashboardContent.classList.remove('hidden');
  
  // Update UI with the processed data
  updateDashboard(processedData);
  
  // Get server URL from URL parameters if available
  const urlParams = new URLSearchParams(window.location.search);
  const serverUrl = urlParams.get('serverUrl');
  
  // Save data to server for trend analysis and recommendations
  saveToServer(processedData, serverUrl);
}

/**
 * Show import error message
 */
function showImportError(message) {
  importStatus.textContent = `Error: ${message}`;
  importStatus.style.color = '#F44336';
}

/**
 * Update the dashboard with the imported data
 */
function updateDashboard(data) {
  const { tabs, peakTabCount, tabHistory } = data;
  
  // Update summary section
  updateSummary(tabs, peakTabCount);
  
  // Initialize or update charts
  initializeCharts(tabs, tabHistory);
  
  // Populate tabs table
  populateTabsTable(tabs);
}

/**
 * Update the summary section
 */
function updateSummary(tabs, peakTabCount) {
  const currentTabCount = tabs.length;
  
  // Update current tab count
  document.getElementById('current-tab-count').textContent = currentTabCount;
  
  // Update peak tab count
  document.getElementById('peak-tab-count').textContent = peakTabCount || currentTabCount;
  
  // Update progress to tab zero
  const progressPercentage = peakTabCount ? 
    Math.max(0, Math.min(100, Math.round(100 * (1 - currentTabCount / peakTabCount)))) : 0;
  
  document.getElementById('tab-zero-progress').style.width = `${progressPercentage}%`;
  document.getElementById('progress-percentage').textContent = `${progressPercentage}% complete`;
}

/**
 * Initialize or update charts
 */
function initializeCharts(tabs, tabHistory) {
  // Process tab data for charts
  const tabCounts = categorizeTabsByAge(tabs);
  
  // Update age category counts
  document.getElementById('today-count').textContent = tabCounts.today;
  document.getElementById('week-count').textContent = tabCounts.week;
  document.getElementById('month-count').textContent = tabCounts.month;
  document.getElementById('older-count').textContent = tabCounts.older;
  
  // Initialize or update distribution chart
  initDistributionChart(tabCounts);
  
  // Initialize or update trend chart
  if (tabHistory && tabHistory.length > 0) {
    initTrendChart(tabHistory);
  } else {
    // If no history, just use current count as a single point
    const singlePointHistory = [{
      date: new Date().toISOString().split('T')[0],
      count: tabs.length
    }];
    
    initTrendChart(singlePointHistory);
  }
}

/**
 * Categorize tabs by age
 */
function categorizeTabsByAge(tabs) {
  const counts = {
    today: 0,
    week: 0,
    month: 0,
    older: 0
  };
  
  tabs.forEach(tab => {
    const age = calculateTabAge(tab.createdAt);
    
    if (age.days === 0) {
      counts.today++;
    } else if (age.days >= 1 && age.days <= 7) {
      counts.week++;
    } else if (age.days > 7 && age.days <= 30) {
      counts.month++;
    } else {
      counts.older++;
    }
  });
  
  return counts;
}

/**
 * Initialize or update the distribution chart
 */
function initDistributionChart(tabCounts) {
  const ctx = document.getElementById('distribution-chart').getContext('2d');
  
  // Destroy existing chart if it exists
  if (distributionChart) {
    distributionChart.destroy();
  }
  
  // Create the chart
  distributionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Opened Today', 'Open 1-7 Days', 'Open 8-30 Days', 'Open >30 Days'],
      datasets: [{
        data: [tabCounts.today, tabCounts.week, tabCounts.month, tabCounts.older],
        backgroundColor: [
          COLORS.today,
          COLORS.week,
          COLORS.month,
          COLORS.older
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.formattedValue;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = Math.round((context.raw / total) * 100);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Initialize or update the trend chart
 */
function initTrendChart(tabHistory) {
  const ctx = document.getElementById('trend-chart').getContext('2d');
  
  // Process history data
  const sortedHistory = [...tabHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const dates = sortedHistory.map(entry => entry.date);
  const counts = sortedHistory.map(entry => entry.count);
  
  // Destroy existing chart if it exists
  if (trendChart) {
    trendChart.destroy();
  }
  
  // Create the chart
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Tab Count',
        data: counts,
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Tabs'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      },
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false
        }
      }
    }
  });
}

/**
 * Populate the tabs table
 */
function populateTabsTable(tabs) {
  const tableBody = document.getElementById('tabs-table-body');
  tableBody.innerHTML = '';
  
  tabs.forEach(tab => {
    const row = document.createElement('tr');
    
    // Get age info and color
    const age = calculateTabAge(tab.createdAt);
    const ageColor = getAgeColor(tab.createdAt);
    
    // Create age cell with color indicator
    const ageCell = document.createElement('td');
    const ageIndicator = document.createElement('span');
    ageIndicator.style.display = 'inline-block';
    ageIndicator.style.width = '10px';
    ageIndicator.style.height = '10px';
    ageIndicator.style.borderRadius = '50%';
    ageIndicator.style.backgroundColor = ageColor;
    ageIndicator.style.marginRight = '8px';
    
    // Add age text
    let ageText;
    if (age.days === 0) {
      if (age.hours === 0) {
        ageText = `${age.minutes} min`;
      } else {
        ageText = `${age.hours} hr ${age.minutes} min`;
      }
    } else if (age.days === 1) {
      ageText = '1 day';
    } else {
      ageText = `${age.days} days`;
    }
    
    ageCell.appendChild(ageIndicator);
    ageCell.appendChild(document.createTextNode(ageText));
    
    // Create title cell with truncated text
    const titleCell = document.createElement('td');
    titleCell.textContent = truncateString(tab.title || 'Untitled', 50);
    titleCell.title = tab.title || 'Untitled';
    
    // Create URL cell with truncated text
    const urlCell = document.createElement('td');
    urlCell.textContent = truncateString(tab.url || '', 40);
    urlCell.title = tab.url || '';
    
    // Create created at cell
    const createdCell = document.createElement('td');
    createdCell.textContent = formatDate(tab.createdAt);
    
    // Add data attributes for filtering
    row.dataset.title = tab.title || '';
    row.dataset.url = tab.url || '';
    
    if (age.days === 0) {
      row.dataset.age = 'today';
    } else if (age.days >= 1 && age.days <= 7) {
      row.dataset.age = 'week';
    } else if (age.days > 7 && age.days <= 30) {
      row.dataset.age = 'month';
    } else {
      row.dataset.age = 'older';
    }
    
    // Append cells to row
    row.appendChild(titleCell);
    row.appendChild(urlCell);
    row.appendChild(ageCell);
    row.appendChild(createdCell);
    
    // Append row to table
    tableBody.appendChild(row);
  });
  
  // Apply initial filters
  applyFilters();
}

/**
 * Apply search and age filters to the tabs table
 */
function applyFilters() {
  const searchTerm = tabSearchInput.value.toLowerCase();
  const ageFilter = ageFilterSelect.value;
  
  const rows = document.querySelectorAll('#tabs-table tbody tr');
  
  rows.forEach(row => {
    const title = row.dataset.title.toLowerCase();
    const url = row.dataset.url.toLowerCase();
    const age = row.dataset.age;
    
    const matchesSearch = title.includes(searchTerm) || url.includes(searchTerm);
    const matchesAge = ageFilter === 'all' || age === ageFilter;
    
    if (matchesSearch && matchesAge) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

/**
 * Calculate the age of a tab based on its creation date
 * @param {string} createdAt - ISO date string of tab creation
 * @returns {Object} Object containing age information
 */
function calculateTabAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  let label;
  if (diffDays === 0) {
    if (diffHours === 0) {
      label = diffMinutes === 0 ? 'Just now' : `${diffMinutes}m ago`;
    } else {
      label = `${diffHours}h ${diffMinutes}m ago`;
    }
  } else if (diffDays === 1) {
    label = '1 day ago';
  } else if (diffDays < 30) {
    label = `${diffDays} days ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    label = months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    label = years === 1 ? '1 year ago' : `${years} years ago`;
  }
  
  return {
    days: diffDays,
    hours: diffHours,
    minutes: diffMinutes,
    label: label
  };
}

/**
 * Generates a color based on the age of a tab
 * @param {string} createdAt - ISO date string of tab creation
 * @returns {string} CSS color value
 */
function getAgeColor(createdAt) {
  const age = calculateTabAge(createdAt);
  
  // Color mapping based on age
  if (age.days === 0) {
    return COLORS.today;   // Today - Green
  } else if (age.days >= 1 && age.days <= 7) {
    return COLORS.week;    // Week - Blue
  } else if (age.days > 7 && age.days <= 30) {
    return COLORS.month;   // Month - Orange
  } else {
    return COLORS.older;   // Older - Red
  }
}

/**
 * Truncates a string to a specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated string
 */
function truncateString(str, length = 50) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

/**
 * Formats a date to a readable string
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const d = new Date(date);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  
  return `${month}/${day}/${year}`;
}

/**
 * Load data from the server
 * @param {string} serverUrl - Optional server URL (defaults to current host)
 */
async function loadServerData(serverUrl) {
  try {
    // Prepare base URL for API requests
    const baseUrl = serverUrl || '';
    
    // Get distribution data
    const distributionUrl = baseUrl ? `${baseUrl}/api/stats/distribution` : '/api/stats/distribution';
    const distributionResponse = await fetch(distributionUrl);
    
    if (distributionResponse.ok) {
      const distributionData = await distributionResponse.json();
      
      if (distributionData && distributionData.distribution) {
        // Update the dashboard with distribution data
        const tabCounts = distributionData.distribution;
        const totalTabs = distributionData.count;
        const peakCount = distributionData.peak_count;
        
        // Update counts
        document.getElementById('current-tab-count').textContent = totalTabs;
        document.getElementById('peak-tab-count').textContent = peakCount;
        document.getElementById('today-count').textContent = tabCounts.today;
        document.getElementById('week-count').textContent = tabCounts.week;
        document.getElementById('month-count').textContent = tabCounts.month;
        document.getElementById('older-count').textContent = tabCounts.older;
        
        // Update progress to tab zero
        const progressPercentage = peakCount ? 
          Math.max(0, Math.min(100, Math.round(100 * (1 - totalTabs / peakCount)))) : 0;
        document.getElementById('tab-zero-progress').style.width = `${progressPercentage}%`;
        document.getElementById('progress-percentage').textContent = `${progressPercentage}% complete`;
        
        // Update distribution chart
        initDistributionChart(tabCounts);
        
        // Show dashboard content
        dashboardContent.classList.remove('hidden');
      }
    }
    
    // Get trend data
    const trendUrl = baseUrl ? `${baseUrl}/api/stats/trend` : '/api/stats/trend';
    const trendResponse = await fetch(trendUrl);
    
    if (trendResponse.ok) {
      const trendData = await trendResponse.json();
      
      if (trendData && trendData.length > 0) {
        // Format for chart
        const formattedTrendData = trendData.map(entry => ({
          date: entry.date,
          count: Math.round(entry.avg_count)
        }));
        
        // Update trend chart
        initTrendChart(formattedTrendData);
      }
    }
    
    // Get tab group suggestions
    loadTabGroupSuggestions(serverUrl);
    
  } catch (error) {
    console.error('Error loading server data:', error);
    console.log('Server URL used:', serverUrl || 'current host');
  }
}

/**
 * Load tab group suggestions from the server
 * @param {string} serverUrl - Optional server URL (defaults to current host)
 */
async function loadTabGroupSuggestions(serverUrl) {
  try {
    // Use either provided server URL or the current hostname
    const url = serverUrl || '/api/suggest/groups';
    
    // For absolute URLs, use the full URL, for relative ones, use fetch as is
    const apiUrl = url.startsWith('http') ? `${url}/api/suggest/groups` : url;
    
    const response = await fetch(apiUrl);
    if (response.ok) {
      const groups = await response.json();
      displayTabGroupSuggestions(groups);
    }
  } catch (error) {
    console.error('Error loading tab group suggestions:', error);
    tabGroupsContainer.innerHTML = '<div class="no-groups-message">Unable to load tab group suggestions.</div>';
  }
}

/**
 * Display tab group suggestions
 * @param {Array} groups - Tab group suggestions
 */
function displayTabGroupSuggestions(groups) {
  // Clear container
  tabGroupsContainer.innerHTML = '';
  
  if (!groups || groups.length === 0) {
    tabGroupsContainer.innerHTML = '<div class="no-groups-message">No tab group suggestions available. Import or add more tabs.</div>';
    return;
  }
  
  // Add each group card
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    
    // Card header
    const header = document.createElement('div');
    header.className = 'group-header';
    
    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = group.name;
    
    const count = document.createElement('div');
    count.className = 'group-count';
    count.textContent = `${group.count} tabs`;
    
    header.appendChild(name);
    header.appendChild(count);
    card.appendChild(header);
    
    // Group reason
    const reason = document.createElement('div');
    reason.className = 'group-reason';
    reason.textContent = group.reason;
    card.appendChild(reason);
    
    // Tab list
    const tabsList = document.createElement('div');
    tabsList.className = 'group-tabs';
    
    group.tabs.forEach(tab => {
      const tabItem = document.createElement('div');
      tabItem.className = 'group-tab';
      
      const title = document.createElement('div');
      title.className = 'group-tab-title';
      title.textContent = truncateString(tab.title || 'Untitled', 40);
      title.title = tab.title || 'Untitled';
      
      const url = document.createElement('div');
      url.className = 'group-tab-url';
      url.textContent = truncateString(tab.url || '', 50);
      url.title = tab.url || '';
      
      tabItem.appendChild(title);
      tabItem.appendChild(url);
      tabsList.appendChild(tabItem);
    });
    
    card.appendChild(tabsList);
    tabGroupsContainer.appendChild(card);
  });
}

/**
 * Save imported data to the server
 * @param {Object} data - The data to save
 * @param {string} serverUrl - Optional server URL (defaults to current host)
 */
async function saveToServer(data, serverUrl) {
  try {
    // Use either provided server URL or the current hostname
    const url = serverUrl || '/api/import-data';
    
    // For absolute URLs, use the full URL, for relative ones, use fetch as is
    const apiUrl = url.startsWith('http') ? `${url}/api/import-data` : url;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      console.log('Data saved to server successfully');
      // After successful save, load tab group suggestions
      loadTabGroupSuggestions(serverUrl);
    } else {
      console.error('Error saving to server:', await response.text());
    }
  } catch (error) {
    console.error('Error saving data to server:', error);
  }
}