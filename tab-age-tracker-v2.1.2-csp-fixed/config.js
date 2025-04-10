/**
 * Configuration file for Tab Age Tracker
 * Contains settings and initialization for analytics
 */

// Google Analytics Measurement ID
const GA_MEASUREMENT_ID = 'G-TXDM9FWL7M';

/**
 * Initialize Google Analytics - Modified for Chrome Extension Manifest V3 CSP
 */
function initializeAnalytics() {
    // Initialize dataLayer and gtag function directly without external script
    window.dataLayer = window.dataLayer || [];
    
    // Define gtag function
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
        'transport_url': 'https://analytics.google.com/g/collect',
        'transport_type': 'beacon'
    });
    
    // Make gtag function globally available
    window.gtag = gtag;
    
    // Send data directly to Google Analytics endpoints
    console.log('Analytics initialized with Measurement ID:', GA_MEASUREMENT_ID);
}

/**
 * Track an event in Google Analytics
 * @param {string} category - Event category (e.g., 'Engagement', 'Navigation')
 * @param {string} action - Event action (e.g., 'Click', 'Submit')
 * @param {string} label - Event label (optional)
 * @param {number} value - Event value (optional)
 */
function trackEvent(category, action, label = null, value = null) {
    if (typeof window.gtag !== 'function') {
        console.warn('Analytics not initialized. Event not tracked:', category, action, label);
        return;
    }
    
    const eventParams = {
        event_category: category,
        event_action: action
    };
    
    if (label) {
        eventParams.event_label = label;
    }
    
    if (value !== null && !isNaN(value)) {
        eventParams.value = value;
    }
    
    window.gtag('event', action, eventParams);
    console.log('Event tracked:', category, action, label, value);
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GA_MEASUREMENT_ID,
        initializeAnalytics,
        trackEvent
    };
}