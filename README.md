# Tab Age Tracker

Tab Age Tracker is a Chrome extension that helps you monitor and manage your open tabs by tracking their age and providing analytics to reduce tab overload.

## Features

- **Tab Age Tracking**: See how long each tab has been open
- **Age Categories**: Tabs are categorized as "Opened Today", "Open 1-7 Days", "Open 8-30 Days", and "Open >30 Days"
- **Analytics Dashboard**: View charts and statistics on your tab usage patterns
- **Progress Tracking**: Track your progress towards reducing your tab count to "Tab Zero"
- **Customizable Notifications**: Get reminders about old tabs
- **Search & Filtering**: Find specific tabs by title, URL, or age category
- **Data Export/Import**: Back up your tab data in CSV or JSON format

## Installation

### Quick Install (Recommended)

1. Download the [tab-age-tracker.zip](tab-age-tracker.zip) file
2. Extract the zip file to a folder on your computer
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" using the toggle in the top-right corner
5. Click "Load unpacked" and select the extracted folder
6. The extension is now installed and ready to use!

### Alternative Installation (For Developers)

If you want to make changes to the extension or build it yourself:

1. Clone this repository or download the source code
2. Make any desired modifications to the code
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" using the toggle in the top-right corner
5. Click "Load unpacked" and select the folder containing the extension files
6. The extension is now installed and ready to use!

## How to Use

1. **View Quick Stats**: Click the extension icon in your toolbar to see a popup with current tab statistics
2. **Check Old Tabs**: Click "Check Old Tabs" to get notifications about tabs you've left open for too long
3. **View Detailed Analytics**: Click "View Details" or "Options" to access the full dashboard
4. **Customize Settings**: Go to the Settings tab to adjust notification preferences, data retention, and display options
5. **Export/Import Data**: Use the Export tab to back up your tab data or transfer it between devices

## Privacy

Tab Age Tracker respects your privacy:
- It only tracks tab URLs, titles, and creation times
- Detailed tab data is stored locally on your computer
- Only aggregated statistics are sent to the server for trend analysis
- No personally identifiable information is collected
- No tab content is read or analyzed
- You can use the extension without the web dashboard if preferred

## License

This extension is available under the MIT License. See the LICENSE file for more details.

## Support

If you encounter any issues or have suggestions for improvements, please open an issue in the GitHub repository.

## Changelog

### Version 1.3
- Fixed Chart.js library inclusion in the extension package
- Added URL date extraction feature to improve tab age accuracy
- Added "from URL" indicator for tabs with age derived from URL patterns
- Improved data synchronization with server for better trends analysis
- Enhanced dashboard with daily progress tracking

### Version 1.2
- Added web dashboard for comprehensive analytics
- Implemented server-side storage for long-term trend analysis
- Added tab grouping suggestions based on URL patterns
- New chart showing daily tab changes (new tabs, closed tabs, total)
- Improved tab age distribution visualization with percentage view

### Version 1.1
- Improved tab age category labels for better clarity:
  - "Opened Today" - For tabs opened in the last 24 hours
  - "Open 1-7 Days" - For tabs open between 1 and 7 days
  - "Open 8-30 Days" - For tabs open between 8 and 30 days
  - "Open >30 Days" - For tabs open more than 30 days
- Fixed chart rendering issues (properly positioned Chart.js script to avoid undefined errors)
- Improved error handling for better stability
- Updated tab distribution algorithm to match new age categories

### Version 1.0
- Initial release with core tab tracking functionality
- Age categorization of open tabs
- Dashboard analytics
- Tab search and filtering
- Data export/import capabilities