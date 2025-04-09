/**
 * Dashboard JavaScript for Tab Age Tracker
 */

// Global variables
let tabData = [];
let trendsData = [];
let distributionChart = null;
let tabTrendChart = null;
let dailyProgressChart = null;
let tabChangesChart = null;

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize when the page loads
    updateDashboard();
    initializeCharts();
    
    // Add event listeners
    document.getElementById('importBtn')?.addEventListener('click', importData);
    document.getElementById('searchInput')?.addEventListener('input', filterTabs);
    document.getElementById('categoryFilter')?.addEventListener('change', filterTabs);
    document.getElementById('sortOption')?.addEventListener('change', filterTabs);
    
    // Check for data and search parameters in URL
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search');
    const dataParam = urlParams.get('data');
    
    // Process data parameter if present
    if (dataParam) {
        try {
            console.log("Found data parameter in URL, processing...");
            const decodedData = decodeURIComponent(atob(dataParam));
            const parsedData = JSON.parse(decodedData);
            
            console.log("Successfully parsed data from URL parameter");
            
            // Process the tab data
            if (parsedData.tabData && parsedData.tabData.tabs) {
                console.log("Loading tab data from URL parameter...");
                tabData = parsedData.tabData.tabs;
                
                // Update UI with the imported data
                updateDashboard();
                setTimeout(() => {
                    initializeCharts();
                    populateTabsTable();
                    
                    const statusElement = document.getElementById('statusMessage');
                    if (statusElement) {
                        statusElement.innerHTML = '<strong>Status:</strong> Data loaded successfully from the extension';
                        statusElement.style.color = '#2e7d32'; // Green color for success
                    }
                    
                    // Show success message
                    showMessage('Tab data loaded successfully from extension!');
                }, 100);
            }
            
            // Process tab history if available
            if (parsedData.tabHistory) {
                console.log("Loading tab history from URL parameter...");
                trendsData = parsedData.tabHistory;
            }
        } catch (e) {
            console.error("Error processing data parameter:", e);
            showError("Error loading tab data: " + e.message);
        }
    }
    
    function applySearch(query) {
        if (!query) return;
        
        console.log("Applying search query:", query);
        
        // Set the search input field value
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = query;
            // Trigger the search filter
            filterTabs();
            
            // Scroll to the tabs section
            setTimeout(() => {
                const tabsSection = document.getElementById('tabsSection');
                if (tabsSection) {
                    tabsSection.scrollIntoView({ behavior: 'smooth' });
                }
            }, 500);
        }
    }
    
    if (searchQuery) {
        // Apply the URL search parameter
        applySearch(searchQuery);
    } else {
        // If no URL parameter, check Chrome storage for last search query
        // This helps when the URL parameter approach fails
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['lastSearchQuery'], function(result) {
                    if (result.lastSearchQuery) {
                        console.log("Found stored search query:", result.lastSearchQuery);
                        applySearch(result.lastSearchQuery);
                        
                        // Clear the stored search query after using it
                        chrome.storage.local.remove(['lastSearchQuery']);
                    }
                });
            }
        } catch (e) {
            console.error("Error accessing Chrome storage:", e);
        }
    }
});

/**
 * Import tab data from a JSON file
 */
function importData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                // Check if the content is Base64 encoded
                if (content.startsWith('data:')) {
                    const base64Content = content.split(',')[1];
                    const decodedContent = atob(base64Content);
                    processImportedData(JSON.parse(decodedContent));
                } else {
                    processImportedData(JSON.parse(content));
                }
            } catch (error) {
                showError('Error processing the file: ' + error.message);
            }
        };
        reader.readAsText(file);
    });
    
    fileInput.click();
}

/**
 * Process the imported tab data
 * @param {Object} data - The imported data object
 */
function processImportedData(data) {
    // Check if this is a data export from the extension
    if (data.tabs && Array.isArray(data.tabs)) {
        tabData = data.tabs;
        
        // If there's export metadata, use it for additional information
        if (data.metadata) {
            trendsData = data.metadata.history || [];
        }
        
        // Send the data to the server for storage
        fetch('/api/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showMessage('Data imported successfully!');
                updateDashboard();
                initializeCharts();
                populateTabsTable();
            } else {
                showError('Error importing data: ' + result.error);
            }
        })
        .catch(error => {
            console.error('Error sending data to server:', error);
            showError('Error importing data: ' + error.message);
            
            // Still update the UI with the imported data
            updateDashboard();
            initializeCharts();
            populateTabsTable();
        });
    } else {
        showError('Invalid data format. Expected tabs array.');
    }
}

/**
 * Update the dashboard with the current tab data
 */
function updateDashboard() {
    // Fetch distribution data from server
    fetch('/api/stats/distribution')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError("Error fetching distribution data: " + data.error);
                return;
            }
            
            let chartData;
            
            // Process categories data for chart
            if (data.categories) {
                const categories = data.categories;
                
                chartData = {
                    labels: [
                        'Opened Today',
                        'Open 1-7 Days',
                        'Open 8-30 Days',
                        'Open >30 Days',
                        'Unknown Age'
                    ],
                    data: [
                        categories.today,
                        categories.week,
                        categories.month,
                        categories.older,
                        categories.unknown || 0
                    ]
                };
            }
            // If we have no data, use empty values
            else {
                chartData = {
                    labels: [
                        'Opened Today',
                        'Open 1-7 Days',
                        'Open 8-30 Days',
                        'Open >30 Days',
                        'Unknown Age'
                    ],
                    data: [0, 0, 0, 0, 0]
                };
            }
            
            // Create and update the chart
            updateAgeDistributionChart(chartData);
            
            // Update summary statistics
            updateSummaryStats(data);
        })
        .catch(error => {
            console.error("Error fetching distribution data:", error);
            
            // Fallback to local data if available
            if (tabData && tabData.length > 0) {
                // Group tabs by age category
                const categories = {
                    'today': 0,
                    'week': 0,
                    'month': 0,
                    'older': 0,
                    'unknown': 0
                };
                
                // Process tabs to categorize by age
                tabData.forEach(tab => {
                    if (!tab.createdAt) {
                        // Try to extract date from URL
                        const extractedDate = extractDateFromURL(tab.url);
                        if (extractedDate) {
                            const days = getDaysSince(extractedDate.toISOString());
                            if (days < 1) {
                                categories.today++;
                            } else if (days < 8) {
                                categories.week++;
                            } else if (days < 31) {
                                categories.month++;
                            } else {
                                categories.older++;
                            }
                        } else {
                            categories.unknown++;
                        }
                    } else {
                        const days = getDaysSince(tab.createdAt);
                        if (days < 1) {
                            categories.today++;
                        } else if (days < 8) {
                            categories.week++;
                        } else if (days < 31) {
                            categories.month++;
                        } else {
                            categories.older++;
                        }
                    }
                });
                
                const chartData = {
                    labels: [
                        'Opened Today',
                        'Open 1-7 Days',
                        'Open 8-30 Days',
                        'Open >30 Days',
                        'Unknown Age'
                    ],
                    data: [
                        categories.today,
                        categories.week,
                        categories.month,
                        categories.older,
                        categories.unknown
                    ]
                };
                
                updateAgeDistributionChart(chartData);
                
                // Update summary stats with local data
                updateSummaryStats({
                    categories: categories,
                    total: tabData.length
                });
            }
        });
}

/**
 * Update the summary statistics section
 */
function updateSummaryStats(distributionData) {
    const totalCount = document.getElementById('totalTabCount');
    const todayCount = document.getElementById('todayTabCount');
    const weekCount = document.getElementById('weekTabCount');
    const monthCount = document.getElementById('monthTabCount');
    const olderCount = document.getElementById('olderTabCount');
    const unknownCount = document.getElementById('unknownTabCount');
    
    const categories = distributionData.categories || {};
    
    totalCount.textContent = distributionData.total || tabData.length || 0;
    todayCount.textContent = categories.today || 0;
    weekCount.textContent = categories.week || 0;
    monthCount.textContent = categories.month || 0;
    olderCount.textContent = categories.older || 0;
    unknownCount.textContent = categories.unknown || 0;
    
    // Calculate and display percentages if we have tabs
    const total = distributionData.total || tabData.length || 0;
    if (total > 0) {
        document.getElementById('todayPercent').textContent = 
            `(${Math.round((categories.today || 0) / total * 100)}%)`;
        document.getElementById('weekPercent').textContent = 
            `(${Math.round((categories.week || 0) / total * 100)}%)`;
        document.getElementById('monthPercent').textContent = 
            `(${Math.round((categories.month || 0) / total * 100)}%)`;
        document.getElementById('olderPercent').textContent = 
            `(${Math.round((categories.older || 0) / total * 100)}%)`;
        document.getElementById('unknownPercent').textContent = 
            `(${Math.round((categories.unknown || 0) / total * 100)}%)`;
    }
    
    // Update oldest tabs section
    displayOldestTabs();
}

/**
 * Initialize or update the charts
 */
function initializeCharts() {
    console.log('Attempting to initialize charts, checking if Chart.js is loaded...');
    
    // Check if Chart is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded properly. Attempting to load dynamically...');
        
        // Try to load Chart.js dynamically
        const script = document.createElement('script');
        script.src = 'chart.js';
        script.onload = function() {
            console.log('Chart.js loaded dynamically, initializing charts now...');
            initAgeDistributionChart();
            initTabTrendChart();
            initDailyProgressChart();
            initTabChangesChart();
        };
        script.onerror = function() {
            console.error('Failed to load Chart.js dynamically');
            showChartErrorMessages();
        };
        document.head.appendChild(script);
        return;
    }
    
    console.log('Chart.js already loaded, initializing charts...');
    
    try {
        initAgeDistributionChart();
        initTabTrendChart();
        initDailyProgressChart();
        initTabChangesChart();
    } catch (error) {
        console.error('Error initializing charts:', error);
        showChartErrorMessages();
    }
}

function showChartErrorMessages() {
    // Add fallback text for chart containers
    document.querySelectorAll('.chart-container').forEach(container => {
        // Clear existing content
        container.innerHTML = '';
        
        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = '<strong>Chart visualization unavailable</strong><br>' +
                              'There was an error loading the charting library.<br>' +
                              'Please try refreshing the page.';
        messageDiv.style.textAlign = 'center';
        messageDiv.style.padding = '20px';
        messageDiv.style.color = '#e74c3c';
        messageDiv.style.backgroundColor = '#f9f9f9';
        messageDiv.style.border = '1px solid #ddd';
        messageDiv.style.borderRadius = '5px';
        messageDiv.style.marginTop = '10px';
        container.appendChild(messageDiv);
    });
}

/**
 * Initialize or update the age distribution chart
 */
function initAgeDistributionChart() {
    // Check if Chart is available - main check was already done in initializeCharts
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded properly in initAgeDistributionChart');
        return;
    }
    
    // Get distribution data from the server if available
    fetch('/api/stats/distribution')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Error fetching distribution data:", data.error);
                return;
            }
            
            // Set up the distribution data
            let chartData;
            
            // If we have server data
            if (data && data.distribution) {
                chartData = {
                    labels: [],
                    data: []
                };
                
                // Map server data to chart format
                data.distribution.forEach(item => {
                    chartData.labels.push(item.category);
                    chartData.data.push(item.count);
                });
            }
            // Otherwise, use local tab data if we have it
            else if (tabData && tabData.length > 0) {
                // Group tabs by age category
                const categories = {
                    'today': 0,
                    'week': 0,
                    'month': 0,
                    'older': 0,
                    'unknown': 0
                };
                
                // Process tabs to categorize by age
                tabData.forEach(tab => {
                    if (!tab.createdAt) {
                        // Try to extract date from URL
                        const extractedDate = extractDateFromURL(tab.url);
                        if (extractedDate) {
                            const days = getDaysSince(extractedDate.toISOString());
                            if (days < 1) {
                                categories.today++;
                            } else if (days < 8) {
                                categories.week++;
                            } else if (days < 31) {
                                categories.month++;
                            } else {
                                categories.older++;
                            }
                        } else {
                            categories.unknown++;
                        }
                    } else {
                        const days = getDaysSince(tab.createdAt);
                        if (days < 1) {
                            categories.today++;
                        } else if (days < 8) {
                            categories.week++;
                        } else if (days < 31) {
                            categories.month++;
                        } else {
                            categories.older++;
                        }
                    }
                });
                
                chartData = {
                    labels: [
                        'Opened Today',
                        'Open 1-7 Days',
                        'Open 8-30 Days',
                        'Open >30 Days',
                        'Unknown Age'
                    ],
                    data: [
                        categories.today,
                        categories.week,
                        categories.month,
                        categories.older,
                        categories.unknown
                    ]
                };
            }
            // If no data is available, use empty data
            else {
                chartData = {
                    labels: [
                        'Opened Today',
                        'Open 1-7 Days',
                        'Open 8-30 Days',
                        'Open >30 Days',
                        'Unknown Age'
                    ],
                    data: [0, 0, 0, 0, 0]
                };
            }
            
            updateAgeDistributionChart(chartData);
        })
        .catch(error => {
            console.error("Error initializing age distribution chart:", error);
            
            // Use empty data on error
            const chartData = {
                labels: [
                    'Opened Today',
                    'Open 1-7 Days',
                    'Open 8-30 Days',
                    'Open >30 Days',
                    'Unknown Age'
                ],
                data: [0, 0, 0, 0, 0]
            };
            
            updateAgeDistributionChart(chartData);
        });
}

function updateAgeDistributionChart(chartData) {
    const ctx = document.getElementById('distributionChart').getContext('2d');
    
    // Colors for each age category
    const colors = [
        'rgba(75, 192, 192, 0.8)',  // Today (teal)
        'rgba(54, 162, 235, 0.8)',  // Week (blue)
        'rgba(255, 206, 86, 0.8)',  // Month (yellow)
        'rgba(255, 99, 132, 0.8)',  // Older (red)
        'rgba(128, 128, 128, 0.8)'  // Unknown (gray)
    ];
    
    // Create or update the chart
    if (distributionChart) {
        distributionChart.data.labels = chartData.labels;
        distributionChart.data.datasets[0].data = chartData.data;
        distributionChart.update();
    } else {
        distributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartData.labels,
                datasets: [{
                    data: chartData.data,
                    backgroundColor: colors,
                    borderColor: 'white',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            boxWidth: 12,
                            font: {
                                size: 12
                            }
                        }
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
}

/**
 * Initialize or update the daily progress chart
 */
function initDailyProgressChart() {
    // Check if Chart is available - main check was already done in initializeCharts
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded properly in initDailyProgressChart');
        return;
    }
    
    fetch('/api/stats/daily-progress')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Error fetching daily progress data:", data.error);
                return;
            }
            
            // Process the data for chart visualization
            const chartData = {
                // Format dates for chart labels
                labels: data.map(item => {
                    const date = new Date(item.date);
                    return `${date.getMonth()+1}/${date.getDate()}`;
                }),
                // Extract min, avg, max values from the data
                minCounts: data.map(item => item.min),
                avgCounts: data.map(item => item.avg),
                maxCounts: data.map(item => item.max)
            };
            
            const ctx = document.getElementById('dailyProgressChart').getContext('2d');
            
            // Create or update the chart
            if (dailyProgressChart) {
                dailyProgressChart.data.labels = chartData.labels;
                dailyProgressChart.data.datasets[0].data = chartData.maxCounts;
                dailyProgressChart.data.datasets[1].data = chartData.avgCounts;
                dailyProgressChart.data.datasets[2].data = chartData.minCounts;
                dailyProgressChart.update();
            } else {
                dailyProgressChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: chartData.labels,
                        datasets: [
                            {
                                label: 'Maximum',
                                data: chartData.maxCounts || [],
                                borderColor: 'rgba(255, 99, 132, 1)',
                                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                                borderWidth: 2,
                                fill: false,
                                tension: 0.4
                            },
                            {
                                label: 'Average',
                                data: chartData.avgCounts || [],
                                borderColor: 'rgba(54, 162, 235, 1)',
                                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                                borderWidth: 2,
                                fill: false,
                                tension: 0.4
                            },
                            {
                                label: 'Minimum',
                                data: chartData.minCounts || [],
                                borderColor: 'rgba(75, 192, 192, 1)',
                                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                                borderWidth: 2,
                                fill: false,
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top'
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Date'
                                }
                            },
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Tab Count'
                                }
                            }
                        }
                    }
                });
            }
        })
        .catch(error => {
            console.error("Error initializing daily progress chart:", error);
        });
}

function initTabTrendChart() {
    // Check if Chart is available - main check was already done in initializeCharts
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded properly in initTabTrendChart');
        return;
    }
    
    fetch('/api/stats/trends')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Error fetching trend data:", data.error);
                return;
            }
            
            // Set up the trend data
            const chartData = {
                labels: data.dates || [],
                counts: data.counts || [],
                peakCounts: data.peakCounts || []
            };
            
            const ctx = document.getElementById('trendChart').getContext('2d');
            
            // Create or update the chart
            if (tabTrendChart) {
                tabTrendChart.data.labels = chartData.labels;
                tabTrendChart.data.datasets[0].data = chartData.counts;
                tabTrendChart.data.datasets[1].data = chartData.peakCounts;
                tabTrendChart.update();
            } else {
                tabTrendChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: chartData.labels,
                        datasets: [
                            {
                                label: 'Current Tabs',
                                data: chartData.counts,
                                borderColor: 'rgba(75, 192, 192, 1)',
                                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4
                            },
                            {
                                label: 'Peak Tabs',
                                data: chartData.peakCounts,
                                borderColor: 'rgba(255, 99, 132, 1)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                fill: false,
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top'
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Date'
                                }
                            },
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Tab Count'
                                }
                            }
                        }
                    }
                });
            }
        })
        .catch(error => {
            console.error("Error initializing trend chart:", error);
        });
}

/**
 * Initialize or update the tab changes chart
 */
function initTabChangesChart() {
    // Check if Chart is available - main check was already done in initializeCharts
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded properly in initTabChangesChart');
        return;
    }
    
    fetch('/api/stats/tab-changes')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Error fetching tab changes data:", data.error);
                return;
            }
            
            const ctx = document.getElementById('tabChangesChart').getContext('2d');
            
            // Create or update the chart
            if (tabChangesChart) {
                tabChangesChart.data.labels = data.days || [];
                tabChangesChart.data.datasets[0].data = data.newTabs || [];
                tabChangesChart.data.datasets[1].data = data.closedTabs || [];
                tabChangesChart.data.datasets[2].data = data.totalTabs || [];
                tabChangesChart.update();
            } else {
                tabChangesChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.days || [],
                        datasets: [
                            {
                                label: 'New Tabs',
                                data: data.newTabs || [],
                                backgroundColor: 'rgba(75, 192, 192, 0.7)',
                                borderColor: 'rgba(75, 192, 192, 1)',
                                borderWidth: 1
                            },
                            {
                                label: 'Closed Tabs',
                                data: data.closedTabs || [],
                                backgroundColor: 'rgba(255, 99, 132, 0.7)',
                                borderColor: 'rgba(255, 99, 132, 1)',
                                borderWidth: 1
                            },
                            {
                                label: 'Total Tabs',
                                data: data.totalTabs || [],
                                type: 'line',
                                fill: false,
                                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                                borderColor: 'rgba(54, 162, 235, 1)',
                                borderWidth: 2,
                                pointRadius: 3,
                                pointHoverRadius: 5
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top'
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Date'
                                }
                            },
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Count'
                                }
                            }
                        }
                    }
                });
            }
        })
        .catch(error => {
            console.error("Error initializing tab changes chart:", error);
        });
}

/**
 * Populate the tabs table with current tab data
 */
function populateTabsTable() {
    const tableBody = document.getElementById('tabsList');
    tableBody.innerHTML = '';
    
    // Process tabs for display
    const processedTabs = tabData.map(tab => {
        // Create processed tab object
        const processed = {...tab};
        
        // Handle missing created date
        if (!processed.createdAt) {
            // Try to extract date from URL
            const extractedDate = extractDateFromURL(processed.url);
            if (extractedDate) {
                processed.extractedDate = extractedDate;
                processed.ageSource = 'url';
            } else {
                processed.ageSource = 'unknown';
            }
        } else {
            processed.ageSource = 'created';
        }
        
        // Calculate age information
        if (processed.ageSource === 'created') {
            processed.days = getDaysSince(processed.createdAt);
        } else if (processed.ageSource === 'url') {
            processed.days = getDaysSince(processed.extractedDate.toISOString());
        } else {
            processed.days = null;
        }
        
        // Determine age category
        if (processed.days === null) {
            processed.category = 'Unknown Age';
            processed.categoryClass = 'category-unknown';
        } else if (processed.days < 1) {
            processed.category = 'Opened Today';
            processed.categoryClass = 'category-today';
        } else if (processed.days < 8) {
            processed.category = 'Open 1-7 Days';
            processed.categoryClass = 'category-week';
        } else if (processed.days < 31) {
            processed.category = 'Open 8-30 Days';
            processed.categoryClass = 'category-month';
        } else {
            processed.category = 'Open >30 Days';
            processed.categoryClass = 'category-older';
        }
        
        return processed;
    });
    
    // Sort tabs by age (oldest first, unknown age at the end)
    const sortedTabs = [...processedTabs].sort((a, b) => {
        // Always put unknown age at the end
        if (a.days === null && b.days === null) return 0;
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        // Otherwise sort by age
        return a.days - b.days;
    });
    
    sortedTabs.forEach(tab => {
        const row = document.createElement('tr');
        
        // Format the age display with source indicator
        let ageDisplay;
        if (tab.days === null) {
            ageDisplay = 'Unknown';
        } else {
            ageDisplay = formatAge(tab.days);
            if (tab.ageSource === 'url') {
                ageDisplay += ' <small>(from URL)</small>';
            }
        }
        
        // Create the row content
        row.innerHTML = `
            <td title="${sanitize(tab.title)}">${truncateString(sanitize(tab.title), 50)}</td>
            <td title="${sanitize(tab.url)}">${truncateString(sanitize(tab.url), 50)}</td>
            <td>${ageDisplay}</td>
            <td><span class="category-pill ${tab.categoryClass}">${tab.category}</span></td>
        `;
        
        tableBody.appendChild(row);
    });
}

/**
 * Filter tabs based on search input and category filter
 */
function filterTabs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const sortOption = document.getElementById('sortOption').value;
    const tableBody = document.getElementById('tabsList') || document.querySelector('#tabs-table tbody');
    const searchStatusElem = document.getElementById('searchStatus');
    
    if (!tableBody) return; // Exit if no table body found
    
    // Get all rows except the first one if it's a "no data" message
    let rows = Array.from(tableBody.getElementsByTagName('tr'));
    if (rows.length === 1 && rows[0].cells.length === 1 && rows[0].cells[0].colSpan === 4) {
        return; // Only has a "no data" row, nothing to filter
    }
    
    // Reset search status
    if (searchStatusElem) {
        searchStatusElem.textContent = '';
        searchStatusElem.style.display = 'none';
    }
    
    // Create a new array with row data for sorting
    const rowsData = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Check if this is a real data row
        if (row.cells.length < 3) continue;
        
        const titleCell = row.cells[0];
        const ageCell = row.cells[1];
        const createdCell = row.cells[2];
        const urlCell = row.cells[3];
        
        const title = titleCell.textContent.toLowerCase();
        const url = urlCell.textContent.toLowerCase();
        const categoryText = ageCell.textContent.toLowerCase();
        
        // Extract domain for more accurate searching
        let domain = '';
        try {
            if (url.includes('://')) {
                domain = new URL(url).hostname.toLowerCase();
            }
        } catch (e) {
            // URL parsing failed, use the full URL
        }
        
        let matchesSearch = true;
        
        if (searchTerm) {
            // Split search into words for AND search (all words must match somewhere)
            const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
            
            if (searchWords.length > 0) {
                matchesSearch = searchWords.every(word => 
                    title.includes(word) || 
                    url.includes(word) || 
                    domain.includes(word)
                );
            }
        }
        
        const matchesCategory = categoryFilter === 'all' || 
            (categoryFilter === 'today' && categoryText.includes('today')) ||
            (categoryFilter === 'week' && (categoryText.includes('day') || categoryText.includes('week'))) ||
            (categoryFilter === 'month' && categoryText.includes('month')) ||
            (categoryFilter === 'older' && (categoryText.includes('month') || categoryText.includes('year'))) ||
            (categoryFilter === 'unknown' && categoryText.includes('unknown'));
        
        // Create data object for sorting
        rowsData.push({
            row: row,
            title: title,
            url: url,
            domain: domain,
            createdDate: createdCell.textContent,
            visible: matchesSearch && matchesCategory
        });
    }
    
    // Apply sort option
    switch (sortOption) {
        case 'age-desc': // Oldest first
            rowsData.sort((a, b) => {
                // Handle unknown dates - treat them as oldest
                if (a.createdDate.includes('Unknown')) return -1; 
                if (b.createdDate.includes('Unknown')) return 1;
                // Compare dates
                return new Date(a.createdDate) - new Date(b.createdDate);
            });
            break;
        case 'age-asc': // Newest first
            rowsData.sort((a, b) => {
                // Handle unknown dates - treat them as oldest
                if (a.createdDate.includes('Unknown')) return 1; 
                if (b.createdDate.includes('Unknown')) return -1;
                // Compare dates
                return new Date(b.createdDate) - new Date(a.createdDate);
            });
            break;
        case 'title': // By title
            rowsData.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }
    
    // Reattach sorted rows to the table with appropriate visibility
    tableBody.innerHTML = ''; // Clear table body
    
    // Count visible rows and update search status
    const visibleRows = rowsData.filter(data => data.visible).length;
    const totalRows = rowsData.length;
    
    // Update clear button visibility
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearSearch');
    
    if (clearButton) {
        clearButton.style.display = searchTerm ? 'block' : 'none';
        
        // Set up clear button if not already done
        if (!clearButton.hasAttribute('data-initialized')) {
            clearButton.setAttribute('data-initialized', 'true');
            clearButton.addEventListener('click', function() {
                searchInput.value = '';
                clearButton.style.display = 'none';
                filterTabs();
            });
        }
    }
    
    // Update search status
    if (searchStatusElem) {
        if (searchTerm) {
            searchStatusElem.textContent = `Found ${visibleRows} matching tab${visibleRows !== 1 ? 's' : ''} out of ${totalRows} total`;
            searchStatusElem.style.display = 'block';
        } else {
            searchStatusElem.style.display = 'none';
        }
    }
    
    if (visibleRows === 0) {
        // Create a "no results" row
        const noDataRow = document.createElement('tr');
        const noDataCell = document.createElement('td');
        noDataCell.colSpan = 4;
        noDataCell.textContent = 'No matching tabs found. Try adjusting your filters.';
        noDataCell.style.textAlign = 'center';
        noDataCell.style.padding = '20px';
        noDataRow.appendChild(noDataCell);
        tableBody.appendChild(noDataRow);
    } else {
        // Add rows back to table with appropriate visibility
        rowsData.forEach(data => {
            data.row.style.display = data.visible ? '' : 'none';
            tableBody.appendChild(data.row);
        });
    }
}

/**
 * Calculate the number of days since a given date
 * @param {string} dateString - ISO date string
 * @returns {number} - Number of days
 */
function getDaysSince(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays;
}

/**
 * Format a date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date string (MM/DD/YYYY)
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${date.getFullYear()}`;
}

/**
 * Format an age in days for display
 * @param {number} days - Number of days
 * @returns {string} - Formatted age string
 */
function formatAge(days) {
    if (days < 1) {
        const hours = Math.round(days * 24);
        return hours === 1 ? '1 hour' : `${hours} hours`;
    } else if (days < 30) {
        const roundedDays = Math.round(days);
        return roundedDays === 1 ? '1 day' : `${roundedDays} days`;
    } else if (days < 365) {
        const months = Math.round(days / 30);
        return months === 1 ? '1 month' : `${months} months`;
    } else {
        const years = Math.round(days / 365 * 10) / 10;
        return years === 1 ? '1 year' : `${years} years`;
    }
}

/**
 * Truncate a string to a specific length
 * @param {string} str - The string to truncate
 * @param {number} length - Maximum length
 * @returns {string} - Truncated string
 */
function truncateString(str, length = 50) {
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
}

/**
 * Sanitize a string for safe HTML insertion
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Show a success message
 * @param {string} message - The message to show
 */
function showMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message success';
    messageElement.textContent = message;
    messageElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #4CAF50;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    `;
    
    document.body.appendChild(messageElement);
    
    setTimeout(() => {
        messageElement.style.opacity = '0';
        messageElement.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            document.body.removeChild(messageElement);
        }, 500);
    }, 3000);
}

/**
 * Show an error message
 * @param {string} message - The error message to show
 */
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'message error';
    errorElement.textContent = message;
    errorElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #F44336;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    `;
    
    document.body.appendChild(errorElement);
    
    setTimeout(() => {
        errorElement.style.opacity = '0';
        errorElement.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            document.body.removeChild(errorElement);
        }, 500);
    }, 5000);
}

/**
 * Extract date from URL patterns
 * @param {string} url - The URL to extract date from
 * @returns {Date|null} - Extracted date or null if not found
 */
function extractDateFromURL(url) {
    if (!url) return null;
    
    try {
        // Common date patterns in URLs
        
        // Pattern: /YYYY/MM/DD/ (e.g., /2024/04/02/)
        const slashPattern = /\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//;
        const slashMatch = url.match(slashPattern);
        if (slashMatch) {
            const [_, year, month, day] = slashMatch;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            if (!isNaN(date.getTime())) return date;
        }
        
        // Pattern: /YYYY-MM-DD/ or ?date=YYYY-MM-DD
        const dashPattern = /[\/\?].*?(\d{4}-\d{1,2}-\d{1,2})/;
        const dashMatch = url.match(dashPattern);
        if (dashMatch) {
            const date = new Date(dashMatch[1]);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Pattern: publication dates for news sites (common formats)
        const pubDatePattern = /published[=\/](\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i;
        const pubMatch = url.match(pubDatePattern);
        if (pubMatch) {
            const date = new Date(pubMatch[1]);
            if (!isNaN(date.getTime())) return date;
        }
        
        return null;
    } catch (e) {
        console.warn("Error extracting date from URL:", e);
        return null;
    }
}

/**
 * Display the top 5 oldest tabs
 */
function displayOldestTabs() {
    const container = document.getElementById('oldestTabsContainer');
    
    // Clear the container
    container.innerHTML = '';
    
    if (!tabData || tabData.length === 0) {
        container.innerHTML = '<p>No tab data available. Please sync your data from the extension.</p>';
        return;
    }
    
    // Process tabs to calculate age consistently
    const processedTabs = tabData.map(tab => {
        const processed = {...tab};
        
        // Handle missing created date
        if (!processed.createdAt) {
            // Try to extract date from URL
            const extractedDate = extractDateFromURL(processed.url);
            if (extractedDate) {
                processed.extractedDate = extractedDate;
                processed.ageSource = 'url';
                processed.ageDays = getDaysSince(extractedDate.toISOString());
            } else {
                processed.ageSource = 'unknown';
                processed.ageDays = Number.MAX_SAFE_INTEGER; // Treat unknown as oldest
            }
        } else {
            processed.ageSource = 'created';
            processed.ageDays = getDaysSince(processed.createdAt);
        }
        
        return processed;
    });
    
    // Sort tabs by age (oldest first, unknown age at the end)
    const sortedTabs = [...processedTabs].sort((a, b) => {
        // If both have unknown age, sort by title
        if (a.ageSource === 'unknown' && b.ageSource === 'unknown') {
            return a.title.localeCompare(b.title);
        }
        
        // Put unknown age at the end
        if (a.ageSource === 'unknown') return 1;
        if (b.ageSource === 'unknown') return -1;
        
        // Otherwise sort by age in days (descending)
        return b.ageDays - a.ageDays;
    });
    
    // Take the top 5 oldest tabs
    const oldestTabs = sortedTabs.slice(0, 5);
    
    // Create HTML for each tab
    oldestTabs.forEach(tab => {
        const tabElement = document.createElement('div');
        tabElement.className = 'top-tab-item';
        
        // Create age display
        let ageDisplay = '';
        if (tab.ageSource === 'unknown') {
            ageDisplay = 'Unknown Age';
        } else {
            ageDisplay = formatAge(tab.ageDays);
            if (tab.ageSource === 'url') {
                ageDisplay += ' (from URL)';
            }
        }
        
        // Create tab HTML
        tabElement.innerHTML = `
            <div class="top-tab-content">
                <div class="top-tab-title">${sanitize(truncateString(tab.title, 60))}</div>
                <div class="top-tab-url">${sanitize(truncateString(tab.url, 80))}</div>
            </div>
            <div class="top-tab-age">${ageDisplay}</div>
        `;
        
        container.appendChild(tabElement);
    });
    
    // Add a message if no tabs were found
    if (oldestTabs.length === 0) {
        container.innerHTML = '<p>No tab data available. Please sync your data from the extension.</p>';
    }
}