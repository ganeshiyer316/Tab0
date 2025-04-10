/**
 * Configuration file for Tab Age Tracker
 * Contains settings and initialization for analytics
 */

// Google Analytics Measurement ID
const GA_MEASUREMENT_ID = 'G-TXDM9FWL7M';

/**
 * Initialize Google Analytics
 */
function initializeAnalytics() {
    // Add Google Analytics script dynamically
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(gaScript);
    
    // Initialize dataLayer and gtag function
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
    
    // Make gtag function globally available
    window.gtag = gtag;
    
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
    if (typeof gtag !== 'function') {
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
    
    gtag('event', action, eventParams);
    console.log('Event tracked:', category, action, label, value);
}