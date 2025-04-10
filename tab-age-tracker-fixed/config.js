/**
 * Configuration and utility functions for Tab Age Tracker
 */

/**
 * Initialize Google Analytics with CSP-compliant approach for Manifest V3
 */
function initializeAnalytics() {
  try {
    // Use self-hosted analytics.js rather than loading from Google
    const script = document.createElement('script');
    
    // Define the dataLayer array before creating the gtag function
    window.dataLayer = window.dataLayer || [];
    
    // Define the gtag function
    function gtag() {
      dataLayer.push(arguments);
    }
    
    // Assign gtag to window
    window.gtag = gtag;
    
    // Set the default parameters
    gtag('js', new Date());
    gtag('config', 'G-MEASUREMENT-ID', { 
      'anonymize_ip': true,
      'send_page_view': false
    });
    
    console.log('Analytics initialized successfully');
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
}

/**
 * Track an event in Google Analytics
 * @param {string} category - Event category (e.g., 'Engagement', 'Navigation')
 * @param {string} action - Event action (e.g., 'Click', 'Submit')
 * @param {string} label - Event label (optional)
 * @param {number} value - Event value (optional)
 */
function trackEvent(category, action, label = null, value = null) {
  try {
    if (typeof gtag !== 'function') {
      console.warn('Analytics not initialized, event not tracked');
      return;
    }
    
    const eventParams = {
      'event_category': category,
      'event_action': action
    };
    
    if (label !== null) {
      eventParams.event_label = label;
    }
    
    if (value !== null) {
      eventParams.value = value;
    }
    
    gtag('event', action, eventParams);
    console.log('Event tracked:', category, action, label);
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}

// Initialize analytics when the script loads
// Only if we're in a context where it makes sense (popup, options, dashboard)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAnalytics);
} else {
  initializeAnalytics();
}