/**
 * Tab Age Tracker Web Dashboard
 */

// Global variables
let tabData = null;
let tabHistory = null;
let ageDistributionChart = null;
let tabTrendChart = null;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners
    document.getElementById('importButton').addEventListener('click', importData);
    document.getElementById('searchInput').addEventListener('input', filterTabs);
    document.getElementById('categoryFilter').addEventListener('change', filterTabs);

    // Check for data in URL parameters (for direct links from the extension)
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get('data');
    
    if (dataParam) {
        try {
            // Decode and parse the data
            const decodedData = decodeURIComponent(dataParam);
            const parsedData = JSON.parse(decodedData);
            
            // Process the imported data
            processImportedData(parsedData);
        } catch (error) {
            showError('Failed to load data from URL: ' + error.message);
        }
    }
});

/**
 * Import tab data from a JSON file
 */
function importData() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('Please select a file to import');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            processImportedData(data);
        } catch (error) {
            showError('Failed to parse import file: ' + error.message);
        }
    };
    
    reader.onerror = () => {
        showError('Error reading the file');
    };
    
    reader.readAsText(file);
}

/**
 * Process the imported tab data
 * @param {Object} data - The imported data object
 */
function processImportedData(data) {
    // Validate the imported data
    if (!data.tabs || !data.history || !Array.isArray(data.tabs) || !Array.isArray(data.history)) {
        showError('Invalid import data format');
        return;
    }
    
    // Store the imported data
    tabData = data.tabs;
    tabHistory = data.history;
    
    // Update the dashboard with the imported data
    updateDashboard();
    
    // Show success message
    showMessage('Data imported successfully');
}

/**
 * Update the dashboard with the current tab data
 */
function updateDashboard() {
    if (!tabData || !tabHistory) return;
    
    // Update summary statistics
    updateSummaryStats();
    
    // Initialize or update charts
    initializeCharts();
    
    // Populate the tabs table
    populateTabsTable();
}

/**
 * Update the summary statistics section
 */
function updateSummaryStats() {
    const totalTabs = tabData.length;
    let oldestTabAge = 0;
    let totalAge = 0;
    let peakTabCount = 0;
    
    // Calculate statistics
    tabData.forEach(tab => {
        const age = getDaysSince(tab.createdAt);
        totalAge += age;
        if (age > oldestTabAge) {
            oldestTabAge = age;
        }
    });
    
    // Get peak tab count from history
    if (tabHistory.length > 0) {
        peakTabCount = Math.max(...tabHistory.map(entry => entry.count));
    }
    
    // Update the UI
    document.getElementById('totalTabs').textContent = totalTabs;
    document.getElementById('oldestTab').textContent = formatAge(oldestTabAge);
    document.getElementById('averageAge').textContent = totalTabs > 0 ? formatAge(totalAge / totalTabs) : '-';
    document.getElementById('peakTabCount').textContent = peakTabCount;
    
    // Update progress bar
    const progressPercentage = peakTabCount > 0 ? Math.max(0, 100 - (totalTabs / peakTabCount * 100)) : 0;
    document.getElementById('progressBar').style.width = progressPercentage + '%';
    document.getElementById('progressPercentage').textContent = Math.round(progressPercentage) + '%';
    document.getElementById('peakCount').textContent = peakTabCount;
}

/**
 * Initialize or update the charts
 */
function initializeCharts() {
    initAgeDistributionChart();
    initTabTrendChart();
}

/**
 * Initialize or update the age distribution chart
 */
function initAgeDistributionChart() {
    // Group tabs by age category
    const categories = {
        'today': 0,
        'week': 0,
        'month': 0,
        'older': 0
    };
    
    tabData.forEach(tab => {
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
    });
    
    // Set up chart data
    const data = {
        labels: [
            'Opened Today',
            'Open 1-7 Days',
            'Open 8-30 Days',
            'Open >30 Days'
        ],
        datasets: [{
            data: [
                categories.today,
                categories.week,
                categories.month,
                categories.older
            ],
            backgroundColor: [
                '#4CAF50',  // Green for today
                '#2196F3',  // Blue for week
                '#FF9800',  // Orange for month
                '#F44336'   // Red for older
            ],
            borderWidth: 0,
            hoverOffset: 4
        }]
    };
    
    const ctx = document.getElementById('ageDistributionChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (ageDistributionChart) {
        ageDistributionChart.destroy();
    }
    
    // Create new chart
    ageDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20
                    }
                }
            },
            cutout: '70%'
        }
    });
}

/**
 * Initialize or update the tab trend chart
 */
function initTabTrendChart() {
    // Prepare data for chart
    const dates = [];
    const counts = [];
    
    // Sort history by date
    const sortedHistory = [...tabHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sortedHistory.forEach(entry => {
        dates.push(formatDate(entry.date));
        counts.push(entry.count);
    });
    
    // Set up chart data
    const data = {
        labels: dates,
        datasets: [{
            label: 'Tab Count',
            data: counts,
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#2196F3'
        }]
    };
    
    const ctx = document.getElementById('tabTrendChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (tabTrendChart) {
        tabTrendChart.destroy();
    }
    
    // Create new chart
    tabTrendChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 10
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/**
 * Populate the tabs table with current tab data
 */
function populateTabsTable() {
    const tableBody = document.getElementById('tabsList');
    tableBody.innerHTML = '';
    
    // Sort tabs by age (oldest first)
    const sortedTabs = [...tabData].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    sortedTabs.forEach(tab => {
        const row = document.createElement('tr');
        
        // Determine the age category
        const days = getDaysSince(tab.createdAt);
        let category, categoryClass;
        
        if (days < 1) {
            category = 'Opened Today';
            categoryClass = 'category-today';
        } else if (days < 8) {
            category = 'Open 1-7 Days';
            categoryClass = 'category-week';
        } else if (days < 31) {
            category = 'Open 8-30 Days';
            categoryClass = 'category-month';
        } else {
            category = 'Open >30 Days';
            categoryClass = 'category-older';
        }
        
        // Create the row content
        row.innerHTML = `
            <td title="${sanitize(tab.title)}">${truncateString(sanitize(tab.title), 50)}</td>
            <td title="${sanitize(tab.url)}">${truncateString(sanitize(tab.url), 50)}</td>
            <td>${formatAge(days)}</td>
            <td><span class="category-pill ${categoryClass}">${category}</span></td>
        `;
        
        tableBody.appendChild(row);
    });
}

/**
 * Filter tabs based on search input and category filter
 */
function filterTabs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const tableBody = document.getElementById('tabsList');
    const rows = tableBody.getElementsByTagName('tr');
    
    for (let i = 0; i < rows.length; i++) {
        const titleCell = rows[i].cells[0];
        const urlCell = rows[i].cells[1];
        const categoryCell = rows[i].cells[3];
        
        const title = titleCell.textContent.toLowerCase();
        const url = urlCell.textContent.toLowerCase();
        const categoryText = categoryCell.textContent.toLowerCase();
        
        const matchesSearch = title.includes(searchTerm) || url.includes(searchTerm);
        const matchesCategory = categoryFilter === 'all' || 
            (categoryFilter === 'today' && categoryText.includes('opened today')) ||
            (categoryFilter === 'week' && categoryText.includes('1-7 days')) ||
            (categoryFilter === 'month' && categoryText.includes('8-30 days')) ||
            (categoryFilter === 'older' && categoryText.includes('>30 days'));
        
        rows[i].style.display = matchesSearch && matchesCategory ? '' : 'none';
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