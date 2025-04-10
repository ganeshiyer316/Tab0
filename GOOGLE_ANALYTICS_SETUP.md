# Google Analytics Setup and Usage Guide

## Overview
Tab Age Tracker includes Google Analytics integration to help track user behavior and improve the extension. This document explains how to access and interpret the analytics data.

## Accessing Google Analytics Data

1. **Go to Google Analytics Dashboard**: 
   - Visit [https://analytics.google.com/](https://analytics.google.com/)
   - Sign in with the Google account associated with the tracking ID: `G-TXDM9FWL7M`

2. **Navigate to the Tab Age Tracker Property**:
   - In the GA dashboard, select the "Tab Age Tracker" property
   - If you don't see it, you may need to request access from the property owner

3. **View Reports**:
   - **Real-time**: See who is currently using the extension
   - **Acquisition**: Understand where your users are coming from
   - **Engagement**: See how users interact with the extension
   - **User**: Get insights into user demographics and behaviors

## Key Metrics Being Tracked

The extension tracks the following events:

1. **Page Views**:
   - Extension popup opening
   - Options page views
   - Web dashboard visits

2. **User Interactions**:
   - Feedback submissions
   - Search actions
   - Tab management actions

3. **Feature Usage**:
   - Feature adoption rates
   - Time spent on different sections

## Troubleshooting Analytics Issues

If you notice that analytics aren't being properly tracked:

1. **Check Browser Console**: Look for errors related to Google Analytics or tracking
2. **Verify Tracking ID**: Ensure the config.js file contains the correct tracking ID
3. **Check Content Security Policy**: The manifest.json should allow connections to Google Analytics domains
4. **Disable Ad Blockers**: Some ad blockers might prevent analytics from loading

## Privacy Considerations

Tab Age Tracker's analytics implementation:
- Does not track personal browsing data
- Does not collect any personally identifiable information
- Only tracks aggregated, anonymous usage patterns
- Complies with GDPR and other privacy regulations

## Future Analytics Enhancements

Consider implementing:
- Custom dimensions for tracking user settings preferences
- Goal tracking for "Tab Zero" progress
- More detailed event tracking for specific features

For additional support or questions about analytics implementation, please contact the development team.