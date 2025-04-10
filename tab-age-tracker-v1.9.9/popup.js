document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired');
  console.log('Chart library available:', typeof Chart !== 'undefined');
  // Get references to DOM elements
  const tabCountElement = document.getElementById('tabCount');
  const todayCountElement = document.getElementById('todayCount');
  const weekCountElement = document.getElementById('weekCount');
  const monthCountElement = document.getElementById('monthCount');
  const olderCountElement = document.getElementById('olderCount');
  const progressBarElement = document.getElementById('progressBar');
  const progressPercentElement = document.getElementById('progressPercent');
  const peakTabsElement = document.getElementById('peakTabs');
  
  const viewDetailsButton = document.getElementById('viewDetails');
  const openOptionsButton = document.getElementById('openOptions');

  // Load the latest tab data
  const tabData = await loadTabData();
  
  // Update the UI with the tab data
  updateTabCounts(tabData);
  updateProgressBar(tabData);
  
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
  } else {
    console.log('Chart.js loaded successfully, initializing charts');
    // Initialize charts
    initAgeDistributionChart(tabData);
    initTrendChart(tabData);
  }
  
  // Set up event listener for View Details button
  viewDetailsButton.addEventListener('click', openDetailView);
  
  // Set up search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    // Add search on enter key press
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && this.value.trim().length > 0) {
        // Perform search locally only (don't redirect to dashboard)
        searchTabs(this.value.trim(), false);
        e.preventDefault();
      }
    });
    
    // Add live search as you type
    searchInput.addEventListener('input', function() {
      // Only search if there's at least 2 characters
      if (this.value.trim().length >= 2) {
        searchTabs(this.value.trim(), false); // false = do not redirect to dashboard
      } else {
        // Hide search results if query is too short
        const searchResultsContainer = document.getElementById('searchResultsContainer');
        if (searchResultsContainer) {
          searchResultsContainer.style.display = 'none';
        }
      }
    });
    
    // Add clear button functionality
    try {
      const clearButton = document.createElement('button');
      clearButton.innerText = '×';
      clearButton.className = 'search-clear-button';
      clearButton.style.display = 'none';
      clearButton.title = 'Clear search';
      
      // Insert clear button after search input
      if (searchInput.parentNode) {
        searchInput.parentNode.style.position = 'relative';
        searchInput.parentNode.appendChild(clearButton);
        
        // Show/hide clear button based on search input
        searchInput.addEventListener('input', function() {
          clearButton.style.display = this.value ? 'block' : 'none';
        });
        
        // Clear search when button is clicked
        clearButton.addEventListener('click', function() {
          searchInput.value = '';
          clearButton.style.display = 'none';
          
          // Hide search results on clear
          const searchResultsContainer = document.getElementById('searchResultsContainer');
          if (searchResultsContainer) {
            searchResultsContainer.style.display = 'none';
          }
        });
      }
    } catch (clearButtonError) {
      console.error('Error setting up clear button:', clearButtonError);
    }
    
    // Add event listener for the clear search button in the results
    const clearSearchButton = document.getElementById('clearSearchButton');
    if (clearSearchButton) {
      clearSearchButton.addEventListener('click', function() {
        searchInput.value = '';
        clearButton.style.display = 'none';
        
        // Hide search results on clear
        const searchResultsContainer = document.getElementById('searchResultsContainer');
        if (searchResultsContainer) {
          searchResultsContainer.style.display = 'none';
        }
      });
    }
  }
  
  // Update the data (this will gather fresh data and update storage)
  await updateTabData();
});

async function loadTabData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount'], (result) => {
      const tabData = result.tabData || { tabs: [], lastUpdated: null };
      const tabHistory = result.tabHistory || [];
      const peakTabCount = result.peakTabCount || 0;
      
      resolve({
        tabData,
        tabHistory,
        peakTabCount
      });
    });
  });
}

async function updateTabData() {
  // Get all current tabs
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      resolve(tabs);
    });
  });
  
  // Get existing data
  const { tabData: existingData, tabHistory, peakTabCount } = await loadTabData();
  
  // Process current tabs
  const processedTabs = tabs.map(tab => {
    // Try to find the tab in existing data to preserve creation time
    const existingTab = existingData.tabs.find(t => t.id === tab.id);
    
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      createdAt: existingTab ? existingTab.createdAt : new Date().toISOString()
    };
  });
  
  // Update our tab data
  const currentTabCount = tabs.length;
  const newPeakTabCount = Math.max(peakTabCount, currentTabCount);
  
  const newTabData = {
    tabs: processedTabs,
    count: currentTabCount,
    lastUpdated: new Date().toISOString()
  };
  
  // Update the history record (once per day)
  const today = new Date().toISOString().split('T')[0];
  const updatedHistory = [...tabHistory];
  
  const todayEntryIndex = updatedHistory.findIndex(entry => entry.date === today);
  if (todayEntryIndex >= 0) {
    updatedHistory[todayEntryIndex].count = currentTabCount;
  } else {
    updatedHistory.push({
      date: today,
      count: currentTabCount
    });
  }
  
  // Keep only the last 30 days
  while (updatedHistory.length > 30) {
    updatedHistory.shift();
  }
  
  // Save to storage
  await new Promise((resolve) => {
    chrome.storage.local.set({
      tabData: newTabData,
      tabHistory: updatedHistory,
      peakTabCount: newPeakTabCount
    }, resolve);
  });
  
  // Update the UI
  updateTabCounts({ tabData: newTabData, tabHistory: updatedHistory, peakTabCount: newPeakTabCount });
  updateProgressBar({ tabData: newTabData, peakTabCount: newPeakTabCount });
  
  // Update charts if Chart.js is available
  if (typeof Chart !== 'undefined') {
    initAgeDistributionChart({ tabData: newTabData });
    initTrendChart({ tabHistory: updatedHistory });
  }
  
  // Update badge
  chrome.runtime.sendMessage({ action: 'updateBadge' });
  
  return newTabData;
}

function updateTabCounts(data) {
  const { tabData } = data;
  const tabs = tabData.tabs || [];
  
  // Count tabs by age
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  
  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let olderCount = 0;
  let unknownCount = 0;
  
  tabs.forEach(tab => {
    // Skip tabs with unknown creation dates
    if (!tab.createdAt) {
      unknownCount++;
      return;
    }
    
    // Skip unverified tabs
    if (tab.hasOwnProperty('isVerified') && tab.isVerified === false) {
      unknownCount++;
      return;
    }
    
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
  
  // Update UI elements
  document.getElementById('tabCount').textContent = tabs.length;
  document.getElementById('todayCount').textContent = todayCount;
  document.getElementById('weekCount').textContent = weekCount;
  document.getElementById('monthCount').textContent = monthCount;
  document.getElementById('olderCount').textContent = olderCount;
  
  // Update unknown count - always update this since the element should always exist now
  const unknownElement = document.getElementById('unknownCount');
  if (unknownElement) {
    unknownElement.textContent = unknownCount;
  }
}

function updateProgressBar(data) {
  const { tabData, peakTabCount } = data;
  const currentCount = tabData.tabs?.length || 0;
  
  // Calculate progress as percentage of reduction from peak
  const progressPercent = peakTabCount === 0 ? 100 : Math.max(0, Math.min(100, ((peakTabCount - currentCount) / peakTabCount) * 100));
  
  // Update UI elements
  document.getElementById('progressBar').style.width = `${progressPercent}%`;
  document.getElementById('progressPercent').textContent = `${Math.round(progressPercent)}%`;
  document.getElementById('peakTabs').textContent = peakTabCount;
}

function initAgeDistributionChart(data) {
  // Check if Chart is available
  if (typeof Chart === 'undefined') {
    console.error('Chart.js library not loaded properly');
    // Add fallback text for chart containers
    document.querySelectorAll('.chart-container').forEach(container => {
      // Only add the message if it doesn't already exist
      if (!container.querySelector('.chart-error-message')) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chart-error-message';
        messageDiv.textContent = 'Chart visualization unavailable';
        messageDiv.style.textAlign = 'center';
        messageDiv.style.padding = '20px';
        messageDiv.style.color = '#999';
        container.appendChild(messageDiv);
      }
    });
    return;
  }
  
  const { tabData } = data;
  const tabs = tabData.tabs || [];
  
  // Prepare data for the chart
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  
  let todayCount = 0;
  let weekCount = 0; 
  let monthCount = 0;
  let olderCount = 0;
  let unknownCount = 0;
  
  tabs.forEach(tab => {
    // Skip tabs with unknown creation dates or unverified dates
    if (!tab.createdAt) {
      unknownCount++;
      return;
    }
    
    // Skip unverified tabs if the isVerified flag is explicitly set to false
    if (tab.hasOwnProperty('isVerified') && tab.isVerified === false) {
      unknownCount++;
      return;
    }
    
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
  
  // Create or update the chart
  const ctx = document.getElementById('ageDistributionChart').getContext('2d');
  
  // Prepare datasets with labels
  const chartData = {
    labels: ['Opened Today', 'Open 1-7 Days', 'Open 8-30 Days', 'Open >30 Days', 'Unknown Age'],
    datasets: [{
      data: [todayCount, weekCount, monthCount, olderCount, unknownCount],
      backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#e74c3c', '#95a5a6'],
      borderWidth: 0
    }]
  };
  
  // Only show categories that have data
  const filteredLabels = [];
  const filteredData = [];
  const filteredColors = [];
  
  chartData.labels.forEach((label, index) => {
    if (chartData.datasets[0].data[index] > 0) {
      filteredLabels.push(label);
      filteredData.push(chartData.datasets[0].data[index]);
      filteredColors.push(chartData.datasets[0].backgroundColor[index]);
    }
  });
  
  // Check if chart already exists
  if (window.ageDistributionChart && window.ageDistributionChart.data) {
    // Ensure chart data structure exists before updating
    if (!window.ageDistributionChart.data.datasets || window.ageDistributionChart.data.datasets.length === 0) {
      window.ageDistributionChart.data.datasets = [{}];
    }
    window.ageDistributionChart.data.labels = filteredLabels;
    window.ageDistributionChart.data.datasets[0].data = filteredData;
    window.ageDistributionChart.data.datasets[0].backgroundColor = filteredColors;
    window.ageDistributionChart.update();
  } else {
    // Only create the chart if we have data to show
    if (todayCount + weekCount + monthCount + olderCount + unknownCount > 0) {
      window.ageDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: filteredLabels,
          datasets: [{
            data: filteredData,
            backgroundColor: filteredColors,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 10
              }
            },
            title: {
              display: true,
              text: 'Tab Age Distribution',
              font: {
                size: 14
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.raw || 0;
                  const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${label}: ${value} tabs (${percentage}%)`;
                }
              }
            }
          },
          cutout: '50%'
        }
      });
    } else {
      // Display a message if no data
      ctx.canvas.style.display = 'none';
      const noDataMsg = document.createElement('div');
      noDataMsg.textContent = 'No tab age data available yet';
      noDataMsg.style.textAlign = 'center';
      noDataMsg.style.padding = '20px';
      noDataMsg.style.color = '#999';
      ctx.canvas.parentNode.appendChild(noDataMsg);
    }
  }
}

function initTrendChart(data) {
  // Check if Chart is available
  if (typeof Chart === 'undefined') {
    console.error('Chart.js library not loaded properly');
    // Error message was already added by initAgeDistributionChart
    return;
  }
  
  const { tabHistory = [] } = data;
  
  // Create or update the chart
  const ctx = document.getElementById('trendChart')?.getContext('2d');
  if (!ctx) {
    console.error('Cannot find trendChart canvas element');
    return;
  }
  
  // If we don't have history data, create some initial data points
  // so we at least have something to show in the chart
  let chartData = tabHistory;
  
  if (tabHistory.length === 0) {
    // If no history, create one entry with today's count
    const today = new Date().toISOString().split('T')[0];
    
    // Get the current tab count
    chrome.tabs.query({}, (tabs) => {
      chartData = [{ date: today, count: tabs.length }];
      createOrUpdateTrendChart(chartData, ctx);
    });
    
    return;
  }
  
  createOrUpdateTrendChart(chartData, ctx);
}

function createOrUpdateTrendChart(chartData, ctx) {
  // Check if Chart is available
  if (typeof Chart === 'undefined') {
    console.error('Chart.js library not loaded properly');
    return;
  }
  
  if (!ctx) {
    console.error('Invalid canvas context for trend chart');
    return;
  }
  
  // Prepare data for the chart
  const labels = [];
  const counts = [];
  
  // Sort by date and get the last 14 days
  const sortedHistory = [...chartData].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentHistory = sortedHistory.slice(-14);
  
  recentHistory.forEach(entry => {
    // Format the date to be more readable (MM/DD)
    const date = new Date(entry.date);
    const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
    
    labels.push(formattedDate);
    counts.push(entry.count);
  });
  
  // Fill in missing days with the previous count or 0
  if (labels.length === 1) {
    // If we only have one data point, add another point for today
    const today = new Date();
    const formattedToday = `${today.getMonth() + 1}/${today.getDate()}`;
    if (labels[0] !== formattedToday) {
      labels.push(formattedToday);
      counts.push(counts[0]);
    }
  }
  
  // Check if chart already exists
  if (window.trendChart && window.trendChart.data) {
    // Ensure chart data structure exists before updating
    if (!window.trendChart.data.datasets || window.trendChart.data.datasets.length === 0) {
      window.trendChart.data.datasets = [{}];
    }
    window.trendChart.data.labels = labels;
    window.trendChart.data.datasets[0].data = counts;
    window.trendChart.update();
  } else {
    window.trendChart = new Chart(ctx, {
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
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Tab Count Trend',
            font: {
              size: 14
            }
          },
          tooltip: {
            callbacks: {
              title: function(tooltipItems) {
                return tooltipItems[0].label;
              },
              label: function(context) {
                return `Tabs: ${context.raw}`;
              }
            }
          }
        },
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
}

function openDetailView() {
  // Use the same functionality as the web dashboard instead of opening options page
  openWebDashboard();
}

/**
 * Search for tabs by title, URL or domain
 * @param {string} query - The search query
 */
function searchTabs(query, redirectToDashboard = true) {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    return;
  }
  
  console.log('Searching tabs for:', trimmedQuery);
  
  // Perform local search in the popup
  chrome.storage.local.get(['tabData'], (result) => {
    const tabData = result.tabData || { tabs: [] };
    const tabs = tabData.tabs || [];
    
    // Search in title and URL
    const searchResults = tabs.filter(tab => {
      const titleMatch = tab.title && tab.title.toLowerCase().includes(trimmedQuery.toLowerCase());
      const urlMatch = tab.url && tab.url.toLowerCase().includes(trimmedQuery.toLowerCase());
      return titleMatch || urlMatch;
    });
    
    console.log(`Found ${searchResults.length} matches`);
    
    // Update the search results UI
    const searchResultsContainer = document.getElementById('searchResultsContainer');
    const searchResultsCount = document.getElementById('searchResultsCount');
    const searchQueryText = document.getElementById('searchQueryText');
    const searchResultsList = document.getElementById('searchResults');
    
    if (searchResultsContainer && searchResultsCount && searchQueryText && searchResultsList) {
      // Set search info
      searchResultsCount.textContent = searchResults.length;
      searchQueryText.textContent = trimmedQuery;
      
      // Clear previous results
      searchResultsList.innerHTML = '';
      
      // Show the container
      searchResultsContainer.style.display = 'block';
      
      if (searchResults.length === 0) {
        // No results
        const noResults = document.createElement('div');
        noResults.className = 'no-search-results';
        noResults.textContent = 'No tabs matching your search. Try different keywords or check the dashboard for more options.';
        noResults.style.padding = '12px';
        noResults.style.color = '#666';
        noResults.style.textAlign = 'center';
        searchResultsList.appendChild(noResults);
      } else {
        // Add each result
        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;
        const oneWeek = 7 * oneDay;
        const oneMonth = 30 * oneDay;
        
        searchResults.forEach(tab => {
          const resultItem = document.createElement('div');
          resultItem.className = 'search-result-item';
          
          // Create the favicon element
          const favicon = document.createElement('img');
          favicon.className = 'search-result-favicon';
          favicon.src = tab.favIconUrl || 'icons/tab-icon-16.png'; // Fallback icon
          favicon.onerror = function() {
            this.src = 'icons/tab-icon-16.png'; // Use default if favicon fails to load
          };
          
          // Create the content container
          const content = document.createElement('div');
          content.className = 'search-result-content';
          
          // Title
          const title = document.createElement('div');
          title.className = 'search-result-title';
          title.textContent = tab.title || 'Untitled';
          
          // URL
          const url = document.createElement('div');
          url.className = 'search-result-url';
          url.textContent = tab.url || '';
          
          content.appendChild(title);
          content.appendChild(url);
          
          // Age label
          const ageLabel = document.createElement('div');
          ageLabel.className = 'search-result-age';
          
          // Determine age category
          let ageText = 'Unknown';
          let ageClass = 'unknown';
          
          if (tab.createdAt) {
            const createdAt = new Date(tab.createdAt);
            const age = now - createdAt;
            
            if (age < oneDay) {
              ageText = 'Today';
              ageClass = 'today';
            } else if (age < oneWeek) {
              ageText = '1-7d';
              ageClass = 'week';
            } else if (age < oneMonth) {
              ageText = '8-30d';
              ageClass = 'month';
            } else {
              ageText = '>30d';
              ageClass = 'older';
            }
          }
          
          ageLabel.textContent = ageText;
          ageLabel.classList.add(ageClass);
          
          // Append all elements
          resultItem.appendChild(favicon);
          resultItem.appendChild(content);
          resultItem.appendChild(ageLabel);
          
          // Add click handler to navigate to the tab
          resultItem.addEventListener('click', () => {
            chrome.tabs.update(tab.id, { active: true }, () => {
              // Also focus the window containing the tab
              chrome.tabs.get(tab.id, tabInfo => {
                chrome.windows.update(tabInfo.windowId, { focused: true });
              });
              
              // Close the popup after selecting a tab
              window.close();
            });
          });
          
          searchResultsList.appendChild(resultItem);
        });
      }
    }
  });
  
  // If redirect flag is true, also open the dashboard with search
  if (redirectToDashboard) {
    openWebDashboardWithSearch(trimmedQuery);
  }
}

/**
 * Open the Web Dashboard with a search filter applied
 * @param {string} searchQuery - The search query to apply
 */
function openWebDashboardWithSearch(searchQuery) {
  console.log("Search function called with query:", searchQuery);
  
  if (!searchQuery || typeof searchQuery !== 'string') {
    console.error("Invalid search query provided:", searchQuery);
    return;
  }
  
  // Show loading state to user
  const searchInput = document.getElementById('searchInput');
  const originalPlaceholder = searchInput ? searchInput.placeholder : '';
  
  if (searchInput) {
    searchInput.placeholder = 'Opening dashboard...';
    searchInput.disabled = true;
  }
  
  // Get current data for the dashboard
  chrome.storage.local.get(['tabData', 'tabHistory'], (result) => {
    // Create the dashboard URL with the search parameter
    const dashboardUrl = `dashboard.html?search=${encodeURIComponent(searchQuery)}`;
    
    // If data is large, store the search query for dashboard to retrieve
    chrome.storage.local.set({ lastSearchQuery: searchQuery }, () => {
      chrome.tabs.create({ url: dashboardUrl }, (tab) => {
        console.log("Dashboard tab created with search:", searchQuery);
        
        // Restore the search input
        if (searchInput) {
          searchInput.placeholder = originalPlaceholder;
          searchInput.disabled = false;
        }
      });
    });
  });
}

/**
 * Open the Web Dashboard in a new tab
 * This function opens the web dashboard URL and exports the current tab data
 */
function openWebDashboard() {
  // Get current data
  chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount'], (data) => {
    // Check if we should use the server dashboard
    chrome.storage.local.get(['settings'], (settingsData) => {
      const settings = settingsData.settings || {};
      const useServerDashboard = settings.useServerDashboard || false;
      const serverUrl = settings.serverUrl || 'https://tab-age-tracker.replit.app';
      
      if (useServerDashboard) {
        // Use the server dashboard
        chrome.tabs.create({ url: serverUrl });
        
        // Sync data with the server
        chrome.runtime.sendMessage({ action: 'syncData' });
      } else {
        // Convert the data to a base64 string
        const dataString = JSON.stringify(data);
        const encodedData = btoa(encodeURIComponent(dataString));
        
        // Determine if we should pass a server URL parameter (when serverUrl is set but useServerDashboard is false)
        // Note: The dashboard.html is in the root directory, not in a /website folder
        let dashboardUrl = chrome.runtime.getURL(`/dashboard.html?data=${encodedData}`);
        
        // Add server URL to parameters if available
        if (settings.serverUrl) {
          dashboardUrl += `&serverUrl=${encodeURIComponent(settings.serverUrl)}`;
        }
        
        // Open the local web dashboard in a new tab with the data
        chrome.tabs.create({ url: dashboardUrl });
      }
    });
  });
}

// Function to check for old tabs
function checkForOldTabs() {
  // Show a loading state on the button
  const button = document.getElementById('checkOldTabs');
  const originalText = button.textContent;
  button.textContent = 'Checking...';
  button.disabled = true;
  
  // Send message to background script to check for old tabs
  chrome.runtime.sendMessage({ action: 'checkOldTabs' }, (response) => {
    // Reset button
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1000);
    
    // Show notification in popup
    showNotification('Checking for old tabs... If any are found, you will receive a notification.');
  });
}

// Function to show a notification in the popup
function showNotification(message) {
  // Create notification element if it doesn't exist
  let notification = document.querySelector('.popup-notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'popup-notification';
    document.querySelector('.container').appendChild(notification);
    
    // Add style for the notification
    const style = document.createElement('style');
    style.textContent = `
      .popup-notification {
        position: fixed;
        bottom: 10px;
        left: 10px;
        right: 10px;
        background-color: #3498db;
        color: white;
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: opacity 0.3s ease;
        z-index: 1000;
        text-align: center;
      }
      
      .popup-notification.fade-out {
        opacity: 0;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Set message and show notification
  notification.textContent = message;
  notification.classList.remove('fade-out');
  
  // Hide after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}
