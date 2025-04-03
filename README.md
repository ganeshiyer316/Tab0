# Tab Age Tracker - Chrome Extension

A Chrome extension that provides intelligent tab management through advanced analytics, user-friendly visualizations, and interactive features to help users reduce digital clutter and reach "tab zero".

## Features

- **Tab Age Tracking**: Monitor how long each tab has been open with accurate age tracking
- **Visual Analytics**: Interactive charts and visualizations for tab usage patterns
- **Smart Grouping**: Suggestions for tab organization based on domains and content
- **Progress Tracking**: Track your journey toward reaching "tab zero"
- **Web Dashboard**: Comprehensive analytics dashboard accessible outside the extension

## Latest Version: 1.7

### What's New in v1.7
- Fixed tab sorting functionality (particularly for "newest to oldest" option)
- Improved handling of unknown age tabs in sorting operations
- Enhanced filtering and sorting for the tabs table
- Better feedback when no tabs match search/filter criteria
- Performance optimizations

## Installation

### For Beta Testers
1. Download the extension zip file from the [releases page](https://github.com/yourusername/tab-age-tracker/releases)
2. Extract the zip file to a folder on your computer
3. Open Chrome and navigate to `chrome://extensions`
4. Enable "Developer mode" by toggling the switch in the top right corner
5. Click "Load unpacked" and select the folder where you extracted the extension files
6. The Tab Age Tracker extension should now be installed and visible in your browser toolbar

### For Developers
1. Clone this repository
2. Make your changes to the extension code
3. Load the extension in Chrome using Developer mode (steps 3-5 above)

## Architecture

- **Extension**: Chrome browser extension built with JavaScript
- **Backend**: Flask API for storing and analyzing tab data
- **Database**: PostgreSQL for long-term analytics storage
- **Dashboard**: Web-based analytics interface with Chart.js visualizations

## Privacy

Tab Age Tracker respects your privacy:
- All detailed tab data (URLs, titles) remains within your browser
- Only aggregated metrics are optionally sent to the server for long-term trend analysis
- No authentication is required for the MVP version

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.