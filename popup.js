document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOMContentLoaded event fired');
    
    // Initialize Google Analytics if available
    if (typeof initializeAnalytics === 'function') {
      console.log('Initializing Google Analytics...');
      initializeAnalytics();
      
      // Track page view
      if (typeof trackEvent === 'function') {
        trackEvent('Engagement', 'Popup Opened', 'Extension Popup');
      } else {
        console.warn('trackEvent function not available');
      }
    } else {
      console.warn('Google Analytics initialization function not found');
    }
    
    // Check if Chart.js is available
    const isChartAvailable = typeof Chart !== 'undefined';
    console.log('Chart library available:', isChartAvailable);
    
    // Safely get DOM elements (with null checks)
    const getElement = (id) => {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with ID '${id}' not found in the DOM`);
      }
      return element;
    };
    
    // Get references to DOM elements
    const tabCountElement = getElement('tabCount');
    const todayCountElement = getElement('todayCount');
    const weekCountElement = getElement('weekCount');
    const monthCountElement = getElement('monthCount');
    const olderCountElement = getElement('olderCount');
    const progressBarElement = getElement('progressBar');
    const progressPercentElement = getElement('progressPercent');
    const peakTabsElement = getElement('peakTabs');
    
    // Load the latest tab data
    const tabData = await loadTabData();
    
    // Update the UI with the tab data (only if elements exist)
    if (tabCountElement && todayCountElement && weekCountElement && 
        monthCountElement && olderCountElement) {
      updateTabCounts(tabData);
    }
    
    if (progressBarElement && progressPercentElement && peakTabsElement) {
      updateProgressBar(tabData);
    }
    
    // Handle Chart.js availability
    if (!isChartAvailable) {
      console.error('Chart.js library not loaded properly');
      // Add fallback text for chart containers
      document.querySelectorAll('.chart-container').forEach(container => {
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
    } else {
      console.log('Chart.js loaded successfully, initializing charts');
      try {
        // Initialize charts with proper error handling
        initAgeDistributionChart(tabData);
        initTrendChart(tabData);
      } catch (chartError) {
        console.error('Error initializing charts:', chartError);
      }
    }
    
    // Set up event listeners for the combined dashboard button
    const viewDetailsInDashboardButton = getElement('viewDetailsInDashboard');
    if (viewDetailsInDashboardButton) {
      viewDetailsInDashboardButton.addEventListener('click', openWebDashboard);
    }
    
    // Set up search functionality
    const searchInput = getElement('searchInput');
    if (searchInput) {
      // Only add search on enter key press - we don't want to search on every keystroke
      searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && this.value.trim().length > 0) {
          // Go directly to the dashboard with the search filter
          openWebDashboardWithSearch(this.value.trim());
          e.preventDefault();
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
          });
        }
      } catch (clearButtonError) {
        console.error('Error setting up clear button:', clearButtonError);
      }
    }
    
    // Update the data (this will gather fresh data and update storage)
    try {
      await updateTabData();
    } catch (updateError) {
      console.error('Error updating tab data:', updateError);
    }
  } catch (error) {
    console.error('Error in popup initialization:', error);
  }
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
  try {
    if (!data || !data.tabData) {
      console.error('Invalid data provided to updateTabCounts');
      return;
    }
    
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
      try {
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
        
        // Check if the date is valid
        if (isNaN(createdAt.getTime())) {
          console.warn('Invalid date format:', tab.createdAt);
          unknownCount++;
          return;
        }
        
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
      } catch (tabError) {
        console.error('Error processing tab:', tabError);
        unknownCount++;
      }
    });
    
    // Safely update UI elements with null checks
    const safelyUpdateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      } else {
        console.warn(`Element with ID '${id}' not found`);
      }
    };
    
    safelyUpdateElement('tabCount', tabs.length);
    safelyUpdateElement('todayCount', todayCount);
    safelyUpdateElement('weekCount', weekCount);
    safelyUpdateElement('monthCount', monthCount);
    safelyUpdateElement('olderCount', olderCount);
    safelyUpdateElement('unknownCount', unknownCount);
    
  } catch (error) {
    console.error('Error in updateTabCounts:', error);
  }
}

function updateProgressBar(data) {
  try {
    if (!data || !data.tabData) {
      console.error('Invalid data provided to updateProgressBar');
      return;
    }
    
    const { tabData, peakTabCount = 0 } = data;
    const currentCount = tabData.tabs?.length || 0;
    
    // Calculate progress as percentage of reduction from peak
    const progressPercent = peakTabCount === 0 ? 100 : Math.max(0, Math.min(100, ((peakTabCount - currentCount) / peakTabCount) * 100));
    
    // Safely update UI elements with null checks
    const progressBar = document.getElementById('progressBar');
    const progressPercent_el = document.getElementById('progressPercent');
    const peakTabs_el = document.getElementById('peakTabs');
    
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    } else {
      console.warn('Progress bar element not found');
    }
    
    if (progressPercent_el) {
      progressPercent_el.textContent = `${Math.round(progressPercent)}%`;
    } else {
      console.warn('Progress percent element not found');
    }
    
    if (peakTabs_el) {
      peakTabs_el.textContent = peakTabCount;
    } else {
      console.warn('Peak tabs element not found');
    }
  } catch (error) {
    console.error('Error in updateProgressBar:', error);
  }
}

function initAgeDistributionChart(data) {
  try {
    // Check if data is valid
    if (!data || !data.tabData) {
      console.error('Invalid data provided to initAgeDistributionChart');
      return;
    }

    // Check if Chart is available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js library not loaded properly - attempting to load dynamically');
      
      // Try to load Chart.js dynamically
      try {
        const script = document.createElement('script');
        script.src = 'chart.js';
        script.async = false; // Load synchronously
        
        // Add event listeners for success or failure
        script.onload = function() {
          console.log('Chart.js successfully loaded dynamically');
          // Re-trigger the chart initialization
          setTimeout(() => {
            console.log('Re-initializing charts after dynamic load');
            initAgeDistributionChart(data);
          }, 200);
        };
        
        script.onerror = function() {
          console.error('Failed to load Chart.js dynamically');
          // Add fallback text for chart containers
          document.querySelectorAll('.chart-container').forEach(container => {
            if (!container.querySelector('.chart-error-message')) {
              const messageDiv = document.createElement('div');
              messageDiv.className = 'chart-error-message';
              messageDiv.textContent = 'Chart visualization unavailable';
              messageDiv.style.textAlign = 'center';
              messageDiv.style.padding = '20px';
              messageDiv.style.color = '#e74c3c';
              container.appendChild(messageDiv);
            }
          });
        };
        
        // Add the script to the document
        document.head.appendChild(script);
      } catch (scriptError) {
        console.error('Error attempting to load Chart.js:', scriptError);
      }
      
      return;
    }
    
    console.log('Chart.js loaded correctly - initializing charts');
    
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
      try {
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
        
        // Check if the date is valid
        if (isNaN(createdAt.getTime())) {
          console.warn('Invalid date format:', tab.createdAt);
          unknownCount++;
          return;
        }
        
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
      } catch (tabError) {
        console.error('Error processing tab for chart:', tabError);
        unknownCount++;
      }
    });
    
    // Create or update the chart
    const chartCanvas = document.getElementById('ageDistributionChart');
    if (!chartCanvas) {
      console.error('Cannot find ageDistributionChart canvas element');
      return;
    }
    
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get 2D context from canvas');
      return;
    }
    
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
      try {
        // Ensure chart data structure exists before updating
        if (!window.ageDistributionChart.data.datasets || window.ageDistributionChart.data.datasets.length === 0) {
          window.ageDistributionChart.data.datasets = [{}];
        }
        window.ageDistributionChart.data.labels = filteredLabels;
        window.ageDistributionChart.data.datasets[0].data = filteredData;
        window.ageDistributionChart.data.datasets[0].backgroundColor = filteredColors;
        window.ageDistributionChart.update();
      } catch (chartUpdateError) {
        console.error('Error updating existing chart:', chartUpdateError);
        // If update fails, try to destroy and recreate
        try {
          window.ageDistributionChart.destroy();
          window.ageDistributionChart = null;
        } catch (destroyError) {
          console.error('Failed to destroy chart:', destroyError);
        }
      }
    }
    
    // Create a new chart if one doesn't exist or was destroyed
    if (!window.ageDistributionChart) {
      // Only create the chart if we have data to show
      if (todayCount + weekCount + monthCount + olderCount + unknownCount > 0) {
        try {
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
        } catch (chartCreationError) {
          console.error('Failed to create chart:', chartCreationError);
          // Show fallback message
          if (chartCanvas) {
            chartCanvas.style.display = 'none';
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'Unable to display chart. Please reload the extension.';
            errorMsg.style.textAlign = 'center';
            errorMsg.style.padding = '20px';
            errorMsg.style.color = '#e74c3c';
            chartCanvas.parentNode.appendChild(errorMsg);
          }
        }
      } else {
        // Display a message if no data
        if (chartCanvas) {
          chartCanvas.style.display = 'none';
          const noDataMsg = document.createElement('div');
          noDataMsg.textContent = 'No tab age data available yet';
          noDataMsg.style.textAlign = 'center';
          noDataMsg.style.padding = '20px';
          noDataMsg.style.color = '#999';
          chartCanvas.parentNode.appendChild(noDataMsg);
        }
      }
    }
  } catch (error) {
    console.error('Error in initAgeDistributionChart:', error);
    // Add generic error message to chart container
    try {
      const chartContainers = document.querySelectorAll('.chart-container');
      chartContainers.forEach(container => {
        if (!container.querySelector('.chart-error-message')) {
          const errorMsg = document.createElement('div');
          errorMsg.className = 'chart-error-message';
          errorMsg.textContent = 'Chart visualization error. Please reload.';
          errorMsg.style.textAlign = 'center';
          errorMsg.style.padding = '20px';
          errorMsg.style.color = '#e74c3c';
          container.appendChild(errorMsg);
        }
      });
    } catch (errorMsgError) {
      console.error('Failed to add error message to chart container:', errorMsgError);
    }
  }
}

function initTrendChart(data) {
  try {
    // Check if data is valid
    if (!data) {
      console.error('Invalid data provided to initTrendChart');
      return;
    }
    
    // Check if Chart is available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js library not loaded properly for trend chart - attempting to load');
      
      // Try to load Chart.js dynamically
      try {
        const script = document.createElement('script');
        script.src = 'chart.js';
        script.async = false; // Load synchronously
        
        // Add event listeners for success or failure
        script.onload = function() {
          console.log('Chart.js successfully loaded for trend chart');
          // Re-trigger the chart initialization
          setTimeout(() => {
            console.log('Re-initializing trend chart after dynamic load');
            initTrendChart(data);
          }, 200);
        };
        
        // Add the script to the document
        document.head.appendChild(script);
      } catch (scriptError) {
        console.error('Error attempting to load Chart.js for trend chart:', scriptError);
      }
      
      return;
    }
    
    console.log('Chart.js available for trend chart');
    
    const { tabHistory = [] } = data;
    
    // Create or update the chart
    const chartCanvas = document.getElementById('trendChart');
    if (!chartCanvas) {
      console.error('Cannot find trendChart canvas element');
      return;
    }
    
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get 2D context from trendChart canvas');
      return;
    }
    
    // If we don't have history data, create some initial data points
    // so we at least have something to show in the chart
    let chartData = tabHistory;
    
    if (tabHistory.length === 0) {
      try {
        // If no history, create one entry with today's count
        const today = new Date().toISOString().split('T')[0];
        
        // Get the current tab count
        chrome.tabs.query({}, (tabs) => {
          try {
            // Guard against potential chrome API errors
            if (!tabs) {
              console.error('Failed to get tabs from chrome.tabs.query');
              return;
            }
            
            chartData = [{ date: today, count: tabs.length }];
            createOrUpdateTrendChart(chartData, ctx);
          } catch (queryError) {
            console.error('Error processing tabs from chrome.tabs.query:', queryError);
            // Create a fallback data point
            chartData = [{ date: today, count: 0 }];
            createOrUpdateTrendChart(chartData, ctx);
          }
        });
        
        return;
      } catch (historyError) {
        console.error('Error creating initial chart data:', historyError);
        // Create a simple fallback to prevent complete failure
        chartData = [{ date: new Date().toISOString().split('T')[0], count: 0 }];
      }
    }
    
    createOrUpdateTrendChart(chartData, ctx);
  } catch (error) {
    console.error('Error in initTrendChart:', error);
    // Add generic error message to chart container
    try {
      const chartContainer = document.getElementById('trendChart')?.parentNode;
      if (chartContainer && !chartContainer.querySelector('.chart-error-message')) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'chart-error-message';
        errorMsg.textContent = 'Trend chart visualization error. Please reload.';
        errorMsg.style.textAlign = 'center';
        errorMsg.style.padding = '20px';
        errorMsg.style.color = '#e74c3c';
        chartContainer.appendChild(errorMsg);
      }
    } catch (errorMsgError) {
      console.error('Failed to add error message to trend chart container:', errorMsgError);
    }
  }
}

function createOrUpdateTrendChart(chartData, ctx) {
  try {
    // Check if we have valid input parameters
    if (!chartData || !Array.isArray(chartData)) {
      console.error('Invalid chartData provided to createOrUpdateTrendChart');
      return;
    }
    
    // Check if Chart is available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js library not loaded properly for createOrUpdateTrendChart - attempting to load');
      
      // Try to load Chart.js dynamically
      try {
        const script = document.createElement('script');
        script.src = 'chart.js';
        script.async = false; // Load synchronously
        
        // Add the script to the document and continue after a timeout
        document.head.appendChild(script);
        
        // Since we don't have a callback mechanism here, we'll return
        console.warn('Dynamic loading of Chart.js attempted - operation may not complete properly');
        return;
      } catch (scriptError) {
        console.error('Error attempting to load Chart.js for createOrUpdateTrendChart:', scriptError);
        return;
      }
    }
    
    console.log('Chart.js available for createOrUpdateTrendChart');
    
    if (!ctx) {
      console.error('Invalid canvas context for trend chart');
      return;
    }
    
    // Prepare data for the chart
    const labels = [];
    const counts = [];
    
    try {
      // Sort by date and get the last 14 days
      const sortedHistory = [...chartData].sort((a, b) => {
        try {
          return new Date(a.date) - new Date(b.date);
        } catch (sortError) {
          console.warn('Error sorting chart data entry, using default comparison:', sortError);
          return 0; // Default to no change in order if there's an error
        }
      });
      
      const recentHistory = sortedHistory.slice(-14);
      
      recentHistory.forEach(entry => {
        try {
          // Format the date to be more readable (MM/DD)
          // Guard against invalid date entries
          let formattedDate;
          if (!entry.date) {
            console.warn('Missing date in chart entry, using current date');
            formattedDate = 'Unknown';
          } else {
            const date = new Date(entry.date);
            if (isNaN(date.getTime())) {
              console.warn('Invalid date in chart entry:', entry.date);
              formattedDate = 'Invalid';
            } else {
              formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
            }
          }
          
          labels.push(formattedDate);
          counts.push(typeof entry.count === 'number' ? entry.count : 0);
        } catch (entryError) {
          console.error('Error processing chart data entry:', entryError);
          // Add placeholder data to maintain chart structure
          labels.push('Error');
          counts.push(0);
        }
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
    } catch (dataProcessingError) {
      console.error('Error processing chart data:', dataProcessingError);
      // Create fallback data if processing fails
      labels.push('Today');
      counts.push(0);
    }
    
    // Check if chart already exists
    if (window.trendChart && window.trendChart.data) {
      try {
        // Ensure chart data structure exists before updating
        if (!window.trendChart.data.datasets || window.trendChart.data.datasets.length === 0) {
          window.trendChart.data.datasets = [{}];
        }
        window.trendChart.data.labels = labels;
        window.trendChart.data.datasets[0].data = counts;
        window.trendChart.update();
      } catch (updateError) {
        console.error('Error updating existing trend chart:', updateError);
        // If update fails, try to destroy and recreate
        try {
          window.trendChart.destroy();
          window.trendChart = null;
        } catch (destroyError) {
          console.error('Failed to destroy trend chart:', destroyError);
        }
      }
    }
    
    // Create a new chart if one doesn't exist or was destroyed
    if (!window.trendChart) {
      try {
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
                    if (!tooltipItems || tooltipItems.length === 0) return '';
                    return tooltipItems[0].label || '';
                  },
                  label: function(context) {
                    if (!context) return '';
                    return `Tabs: ${context.raw !== undefined ? context.raw : 0}`;
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
      } catch (createError) {
        console.error('Failed to create trend chart:', createError);
        // Show fallback message
        try {
          const chartCanvas = ctx.canvas;
          if (chartCanvas) {
            chartCanvas.style.display = 'none';
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'Unable to display trend chart. Please reload the extension.';
            errorMsg.style.textAlign = 'center';
            errorMsg.style.padding = '20px';
            errorMsg.style.color = '#e74c3c';
            chartCanvas.parentNode.appendChild(errorMsg);
          }
        } catch (fallbackError) {
          console.error('Failed to show trend chart error message:', fallbackError);
        }
      }
    }
  } catch (error) {
    console.error('Error in createOrUpdateTrendChart:', error);
  }
}

function openDetailView() {
  chrome.tabs.create({ url: 'options.html#details' });
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

/**
 * Open the Web Dashboard in a new tab
 * This function opens the web dashboard URL and exports the current tab data
 */
function openWebDashboard() {
  console.log("### openWebDashboard function called ###");
  
  // Show loading state to user with notification
  showNotification('Opening web dashboard...');
  
  try {
    // Get current data
    chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount'], (data) => {
      try {
        // Check if we should use the server dashboard
        chrome.storage.local.get(['settings'], (settingsData) => {
          try {
            const settings = settingsData.settings || {};
            const useServerDashboard = settings.useServerDashboard || false;
            let serverUrl = settings.serverUrl || 'https://tab-age-tracker.replit.app/';
            
            // Ensure the serverUrl ends with a trailing slash for consistent URL building
            if (serverUrl && !serverUrl.endsWith('/')) {
              serverUrl += '/';
            }
            
            console.log("Opening web dashboard, useServerDashboard:", useServerDashboard);
            console.log("Server URL:", serverUrl);
            
            if (useServerDashboard) {
              try {
                // Use the server dashboard with explicit dashboard.html path
                const fullServerUrl = serverUrl + 'dashboard.html';
                console.log("Opening server dashboard URL:", fullServerUrl);
                
                // Create the tab with proper error handling
                chrome.tabs.create({ url: fullServerUrl }, (tab) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error creating tab:", chrome.runtime.lastError);
                    showNotification("Error opening dashboard. See console for details.");
                    return;
                  }
                  
                  console.log("Server dashboard tab created with ID:", tab.id);
                });
                
                // Sync data with the server
                chrome.runtime.sendMessage({ action: 'syncData' });
              } catch (serverError) {
                console.error("Error opening server dashboard:", serverError);
                showNotification("Error opening server dashboard. Check console.");
              }
            } else {
              try {
                // Convert the data to a base64 string
                const dataString = JSON.stringify(data);
                const encodedData = btoa(encodeURIComponent(dataString));
                
                // Use chrome.runtime.getURL for consistent URL generation
                const dashboardPath = chrome.runtime.getURL("dashboard.html");
                const dashboardUrl = `${dashboardPath}?data=${encodedData}`;
                
                console.log("Opening local dashboard URL:", dashboardUrl);
                
                // Create the tab with proper error handling
                chrome.tabs.create({ url: dashboardUrl }, (tab) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error creating tab:", chrome.runtime.lastError);
                    showNotification("Error opening dashboard. See console for details.");
                    return;
                  }
                  
                  console.log("Local dashboard tab created with ID:", tab.id);
                });
              } catch (localError) {
                console.error("Error opening local dashboard:", localError);
                showNotification("Error opening local dashboard. Check console.");
              }
            }
          } catch (settingsError) {
            console.error("Error processing settings:", settingsError);
            showNotification("Error processing settings. Check console.");
          }
        });
      } catch (storageError) {
        console.error("Error accessing storage for settings:", storageError);
        showNotification("Error accessing storage. Check console.");
      }
    });
  } catch (error) {
    console.error("General error in openWebDashboard:", error);
    showNotification("Error opening dashboard. Check console for details.");
  }
}

// Function to check for old tabs
/**
 * Search tabs by title or URL
 * @param {string} query - The search query
 */
function searchTabs(query) {
  // This function is now simplified to just open the dashboard with search
  // No pre-filtering is done in the popup
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    return;
  }
  
  // Open the dashboard with a search filter
  openWebDashboardWithSearch(trimmedQuery);
}

/**
 * Open the Web Dashboard with a search filter applied
 * @param {string} searchQuery - The search query to apply
 */
function openWebDashboardWithSearch(searchQuery) {
  console.log("Search function called with query:", searchQuery);
  
  if (!searchQuery || typeof searchQuery !== 'string') {
    console.error("Invalid search query provided:", searchQuery);
    showNotification("Error: Invalid search query");
    return;
  }
  
  // Show loading state to user
  const searchInput = document.getElementById('searchInput');
  const originalPlaceholder = searchInput ? searchInput.placeholder : '';
  
  if (searchInput) {
    searchInput.placeholder = 'Opening dashboard...';
    searchInput.disabled = true;
  }
  
  // Show a notification about opening dashboard with search
  showNotification(`Opening dashboard with search: "${searchQuery}"`);
  
  try {
    // Get current data
    chrome.storage.local.get(['tabData', 'tabHistory', 'peakTabCount'], (data) => {
      try {
        // Check if we should use the server dashboard
        chrome.storage.local.get(['settings'], (settingsData) => {
          try {
            const settings = settingsData.settings || {};
            const useServerDashboard = settings.useServerDashboard || false;
            let serverUrl = settings.serverUrl || 'https://tab-age-tracker.replit.app/';
            
            // Ensure the serverUrl ends with a trailing slash for consistent URL building
            if (serverUrl && !serverUrl.endsWith('/')) {
              serverUrl += '/';
            }
            
            console.log("Use server dashboard:", useServerDashboard);
            console.log("Server URL:", serverUrl);
            
            // Reset search input state after a short delay
            setTimeout(() => {
              if (searchInput) {
                searchInput.placeholder = originalPlaceholder;
                searchInput.disabled = false;
              }
            }, 1500);
            
            if (useServerDashboard) {
              try {
                // Use the server dashboard with search parameter
                const serverSearchUrl = `${serverUrl}dashboard.html?search=${encodeURIComponent(searchQuery)}`;
                console.log("Opening server dashboard with URL:", serverSearchUrl);
                chrome.tabs.create({ url: serverSearchUrl }, (tab) => {
                  console.log("Tab created with ID:", tab.id);
                });
                
                // Sync data with the server
                chrome.runtime.sendMessage({ action: 'syncData' });
              } catch (createTabError) {
                console.error("Error creating server dashboard tab:", createTabError);
                showNotification("Error opening server dashboard. Check console for details.");
              }
            } else {
              try {
                // Convert the data to a base64 string
                const dataString = JSON.stringify(data);
                const encodedData = btoa(encodeURIComponent(dataString));
                
                // Build the URL with search parameter
                const localDashboardUrl = chrome.runtime.getURL("dashboard.html") + 
                  `?data=${encodedData}&search=${encodeURIComponent(searchQuery)}`;
                
                console.log("Opening local dashboard with URL:", localDashboardUrl);
                
                // Open the local web dashboard in a new tab with the data and search parameter
                chrome.tabs.create({ url: localDashboardUrl }, (tab) => {
                  console.log("Tab created with ID:", tab.id);
                });
              } catch (createTabError) {
                console.error("Error creating local dashboard tab:", createTabError);
                showNotification("Error opening local dashboard. Check console for details.");
              }
            }
          } catch (settingsError) {
            console.error("Error processing settings:", settingsError);
            showNotification("Error processing settings. Check console for details.");
          }
        });
      } catch (storageError) {
        console.error("Error loading settings from storage:", storageError);
        showNotification("Error loading settings. Check console for details.");
      }
    });
  } catch (error) {
    console.error("Error in openWebDashboardWithSearch:", error);
    showNotification("Error opening dashboard with search. Check console for details.");
    
    // Ensure search input is restored even if there's an error
    if (searchInput) {
      searchInput.placeholder = originalPlaceholder;
      searchInput.disabled = false;
    }
  }
}

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
