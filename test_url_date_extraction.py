import json
import requests
from datetime import datetime

# Test URLs with different date patterns
test_tabs = [
    {
        "id": 1,
        "title": "Blog post with date in URL path (YYYY/MM/DD)",
        "url": "https://example.com/blog/2023/04/15/sample-post",
        "isVerified": False
    },
    {
        "id": 2,
        "title": "News article with date in URL path (YYYY-MM-DD)",
        "url": "https://news-site.com/articles/2022-11-30-breaking-news",
        "isVerified": False
    },
    {
        "id": 3,
        "title": "Publication with date parameter",
        "url": "https://magazine.com/story?date=2024-01-05&category=tech",
        "isVerified": False
    },
    {
        "id": 4,
        "title": "Article with published date in URL",
        "url": "https://news.org/published/2023/12/25/holiday-story",
        "isVerified": False
    },
    {
        "id": 5,
        "title": "Regular page without date",
        "url": "https://nodatehere.com/about-us",
        "isVerified": False
    }
]

# Data to send to the API
data = {
    "tabData": {
        "tabs": test_tabs
    },
    "peakTabCount": 5,
    "newTabs": 5,
    "closedTabs": 0
}

# Test the import API endpoint
response = requests.post('http://localhost:5000/api/import-data', json=data)
print("Import API Response:", response.status_code)
print(response.json())

# Test the distribution API endpoint
dist_response = requests.get('http://localhost:5000/api/stats/distribution')
print("\nDistribution API Response:", dist_response.status_code)
print(json.dumps(dist_response.json(), indent=2))

# Test the tab changes API endpoint
changes_response = requests.get('http://localhost:5000/api/stats/tab-changes')
print("\nTab Changes API Response:", changes_response.status_code)
print(json.dumps(changes_response.json(), indent=2))