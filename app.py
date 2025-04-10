import os
import json
import base64
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, cast, Date, text
import pandas as pd
import urllib.parse
from collections import defaultdict
import re
from urllib.parse import urlparse

# Import Google Sheets API libraries
import gspread
from oauth2client.service_account import ServiceAccountCredentials

app = Flask(__name__, static_folder='.')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Database Models
class TabSnapshot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    count = db.Column(db.Integer)
    today_count = db.Column(db.Integer)
    week_count = db.Column(db.Integer)
    month_count = db.Column(db.Integer)
    older_count = db.Column(db.Integer)
    unknown_count = db.Column(db.Integer, default=0)
    peak_count = db.Column(db.Integer)
    new_tabs = db.Column(db.Integer, default=0)
    closed_tabs = db.Column(db.Integer, default=0)

class TabDetail(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    snapshot_id = db.Column(db.Integer, db.ForeignKey('tab_snapshot.id'))
    browser_tab_id = db.Column(db.Integer)
    title = db.Column(db.String(255))
    url = db.Column(db.Text)
    created_at = db.Column(db.DateTime)
    age_days = db.Column(db.Integer)

# Ensure tables are created
with app.app_context():
    db.create_all()

def get_latest_version_info():
    """Get the latest version information from release JSON files"""
    try:
        # Get a list of all release files
        import glob
        import re
        release_files = glob.glob('release-v*.json')
        
        if not release_files:
            app.logger.warning("No release files found, using default values")
            return {'version': '2.1.0', 'date': '2025-04-10', 'changes': []}
        
        # Parse versions more carefully
        version_pattern = re.compile(r'release-v(\d+)\.(\d+)(?:\.(\d+))?\.json')
        
        # Create a list of (filename, version_tuple) pairs
        versioned_files = []
        for filename in release_files:
            match = version_pattern.match(filename)
            if match:
                # Extract version numbers, default to 0 for patch if not present
                major = int(match.group(1))
                minor = int(match.group(2))
                patch = int(match.group(3) or 0)
                versioned_files.append((filename, (major, minor, patch)))
            else:
                app.logger.warning(f"Couldn't parse version from filename: {filename}")
        
        # Sort by version tuple (major, minor, patch)
        versioned_files.sort(key=lambda x: x[1])
        
        if not versioned_files:
            app.logger.warning("No valid versioned files found")
            return {'version': '2.1.0', 'date': '2025-04-10', 'changes': []}
        
        # Get the latest release file
        latest_release_file = versioned_files[-1][0]
        app.logger.info(f"Found latest release file: {latest_release_file}")
        
        # Read the release file
        with open(latest_release_file, 'r') as f:
            release_info = json.load(f)
            
        return release_info
    except Exception as e:
        app.logger.error(f"Error getting latest version info: {str(e)}")
        return {'version': '2.1.0', 'date': '2025-04-10', 'changes': []}

@app.route('/')
def home():
    """Home page redirects to index.html"""
    try:
        # Get the latest version info
        latest_version = get_latest_version_info()
        version = latest_version.get('version', '2.1.0')
        name = latest_version.get('name', 'Google Analytics Integration')
        changes = latest_version.get('changes', [])
        bug_fixes = latest_version.get('bug_fixes', [])
        
        # Read index.html
        with open('index.html', 'r') as f:
            html_content = f.read()
            
        # Update version information automatically
        html_content = html_content.replace('Download v2.1 GOOGLE', f'Download v{version} {name.upper()}')
        html_content = html_content.replace('<strong>LATEST UPDATE:</strong> v2.1', f'<strong>LATEST UPDATE:</strong> v{version}')
        
        # If we can find the What's New section for the latest version, update it with the contents from the JSON file
        whats_new_marker = f"<h2>What's New in v{version.split('.')[0]}.{version.split('.')[1]} (Latest)</h2>"
        changes_list = ""
        
        # Generate HTML list items for changes
        if changes:
            for change in changes:
                changes_list += f'                <li><strong>{change.split(" - ")[0] if " - " in change else change}</strong>'
                if " - " in change:
                    changes_list += f' - {change.split(" - ", 1)[1]}'
                changes_list += '</li>\n'
        
        # Add bug fixes if any
        if bug_fixes:
            for fix in bug_fixes:
                changes_list += f'                <li><strong>Fixed:</strong> {fix}</li>\n'
        
        # If we have changes, try to find and replace the existing What's New section
        if changes_list:
            # Find position of the latest what's new section heading
            whats_new_pos = html_content.find(f"<h2>What's New in v2.1 (Latest)</h2>")
            if whats_new_pos != -1:
                # Find the end of the current list
                list_start = html_content.find("<ul>", whats_new_pos) + 4
                list_end = html_content.find("</ul>", list_start)
                
                # Replace the list content
                if list_start != -1 and list_end != -1:
                    # Replace the existing list with our new changes
                    html_content = html_content[:list_start] + "\n" + changes_list + "            " + html_content[list_end:]
                    
                    # Update the heading if version changed
                    if version != "2.1":
                        html_content = html_content.replace(
                            f"<h2>What's New in v2.1 (Latest)</h2>", 
                            f"<h2>What's New in v{version} (Latest)</h2>"
                        )
        
        return html_content
    except Exception as e:
        app.logger.error(f"Error rendering home page: {str(e)}")
        # Fallback to static file if something goes wrong
        return send_from_directory('.', 'index.html')

@app.route('/website/<path:path>')
def serve_website(path):
    """Serve any file from the website directory"""
    return send_from_directory('website', path)

@app.route('/<path:path>')
def serve_file(path):
    """Serve any file from the current directory"""
    return send_from_directory('.', path)

@app.route('/download-extension')
def download_extension():
    """Download the latest version of the extension
    Accepts query parameters for cache busting but ignores them
    """
    try:
        # Get latest version info
        latest_version_info = get_latest_version_info()
        latest_version = latest_version_info.get('version', '2.1.0')
        latest_version_short = '.'.join(latest_version.split('.')[:2])  # Convert 2.1.0 to 2.1
        
        # Get the version from query parameter or default to the latest
        version = request.args.get('v', latest_version_short)
        
        # Build version map dynamically
        version_map = {}
        import glob
        zip_files = glob.glob('tab-age-tracker-v*.zip')
        
        for zip_file in zip_files:
            # Extract version from filename (tab-age-tracker-v1.9.9.zip -> 1.9.9)
            file_version = zip_file.replace('tab-age-tracker-v', '').replace('.zip', '')
            # Create mapping (1.9.9 -> tab-age-tracker-v1.9.9.zip)
            version_map[file_version] = zip_file
        
        # Add backward compatibility mappings (2.1.0 -> 2.1)
        for v in list(version_map.keys()):
            if len(v.split('.')) > 2:
                short_v = '.'.join(v.split('.')[:2])
                if short_v not in version_map:
                    version_map[short_v] = version_map[v]
        
        # Get the file name or default to the latest version
        latest_zip = f'tab-age-tracker-v{latest_version}.zip'
        file_name = version_map.get(version, latest_zip)
        
        # Ensure the file exists, if not fall back to checking if the formatted version exists
        if not os.path.exists(file_name):
            formatted_file = f'tab-age-tracker-v{version}.zip'
            if os.path.exists(formatted_file):
                file_name = formatted_file
            else:
                # If nothing else works, use the latest version
                file_name = latest_zip
                
        app.logger.info(f"Downloading extension version: {version}, file: {file_name}")
        return send_from_directory('.', file_name, as_attachment=True)
        
    except Exception as e:
        app.logger.error(f"Error in download_extension: {str(e)}")
        # Fall back to a known good version if anything goes wrong
        return send_from_directory('.', 'tab-age-tracker-v2.1.zip', as_attachment=True)

@app.route('/api/import-data', methods=['POST'])
def import_data():
    """Handle data import from the extension and save to database"""
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        # Extract tab data
        tabs = data.get('tabData', {}).get('tabs', [])
        tab_count = len(tabs)
        
        # Skip if no tabs
        if tab_count == 0:
            return jsonify({"error": "No tabs provided"}), 400
            
        # Create age categories
        age_categories = categorize_tabs_by_age(tabs)
        
        # Get peak count
        peak_count = data.get('peakTabCount', tab_count)
        
        # Get new and closed tabs count if available
        new_tabs = data.get('newTabs', 0)
        closed_tabs = data.get('closedTabs', 0)
        
        # Get previous snapshot for comparing
        previous_snapshot = TabSnapshot.query.order_by(TabSnapshot.timestamp.desc()).first()
        
        # If we have previous data but don't have explicit new/closed counts,
        # calculate based on difference in total tabs
        if previous_snapshot and new_tabs == 0 and closed_tabs == 0:
            previous_count = previous_snapshot.count
            
            # If current count > previous count, some tabs were added
            if tab_count > previous_count:
                new_tabs = tab_count - previous_count
                closed_tabs = 0
            # If current count < previous count, some tabs were closed
            elif tab_count < previous_count:
                closed_tabs = previous_count - tab_count
                new_tabs = 0
        
        # Create a new snapshot
        snapshot = TabSnapshot(
            count=tab_count,
            today_count=age_categories.get('today', 0),
            week_count=age_categories.get('week', 0),
            month_count=age_categories.get('month', 0),
            older_count=age_categories.get('older', 0),
            unknown_count=age_categories.get('unknown', 0),
            peak_count=peak_count,
            new_tabs=new_tabs,
            closed_tabs=closed_tabs
        )
        
        db.session.add(snapshot)
        db.session.flush()  # Get the ID without committing
        
        # Add individual tab details
        for tab in tabs:
            # For tabs with unknown/unverified creation dates
            if not tab.get('createdAt') or (tab.get('isVerified') is False):
                # Try to extract date from URL
                url = tab.get('url', '')
                extracted_date = extract_date_from_url(url)
                
                if extracted_date:
                    # Use the extracted date
                    age_days = (datetime.utcnow() - extracted_date).days
                    tab_detail = TabDetail(
                        snapshot_id=snapshot.id,
                        browser_tab_id=tab.get('id'),
                        title=tab.get('title', '')[:255],  # Truncate to fit column
                        url=url,
                        created_at=extracted_date,
                        age_days=age_days
                    )
                else:
                    # No date could be extracted
                    tab_detail = TabDetail(
                        snapshot_id=snapshot.id,
                        browser_tab_id=tab.get('id'),
                        title=tab.get('title', '')[:255],  # Truncate to fit column
                        url=url,
                        created_at=None,
                        age_days=None
                    )
            else:
                # Normal case with verified creation date
                created_at = datetime.fromisoformat(tab.get('createdAt').replace('Z', '+00:00'))
                age_days = (datetime.utcnow() - created_at).days
                
                tab_detail = TabDetail(
                    snapshot_id=snapshot.id,
                    browser_tab_id=tab.get('id'),
                    title=tab.get('title', '')[:255],  # Truncate to fit column
                    url=tab.get('url', ''),
                    created_at=created_at,
                    age_days=age_days
                )
            
            db.session.add(tab_detail)
        
        db.session.commit()
        
        return jsonify({"success": True, "message": "Data imported successfully"})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats/trend', methods=['GET'])
def get_trend_data():
    """Get tab count trend data for the dashboard"""
    try:
        # Get trend data by day
        trend_data = db.session.query(
            cast(TabSnapshot.timestamp, Date).label('date'),
            func.avg(TabSnapshot.count).label('avg_count'),
            func.max(TabSnapshot.count).label('max_count'),
            func.min(TabSnapshot.count).label('min_count')
        ).group_by(cast(TabSnapshot.timestamp, Date)).order_by(cast(TabSnapshot.timestamp, Date)).all()
        
        # Format the result
        result = [
            {
                'date': item.date.isoformat(),
                'avg': round(item.avg_count),
                'max': item.max_count,
                'min': item.min_count
            }
            for item in trend_data
        ]
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
@app.route('/api/stats/daily-progress', methods=['GET'])
def get_daily_progress():
    """Get daily progress data for the dashboard"""
    try:
        # Get the last 14 days of snapshots from the database
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=14)
        
        # Get one snapshot per day for the date range
        progress_data = db.session.query(
            cast(TabSnapshot.timestamp, Date).label('date'),
            func.avg(TabSnapshot.count).label('avg_count'),
            func.min(TabSnapshot.count).label('min_count'),
            func.max(TabSnapshot.count).label('max_count'),
            func.sum(TabSnapshot.new_tabs).label('new_tabs'),
            func.sum(TabSnapshot.closed_tabs).label('closed_tabs')
        ).filter(
            TabSnapshot.timestamp.between(start_date, end_date)
        ).group_by(
            cast(TabSnapshot.timestamp, Date)
        ).order_by(
            cast(TabSnapshot.timestamp, Date)
        ).all()
        
        # Format the result
        result = [
            {
                'date': item.date.isoformat(),
                'avg': round(item.avg_count),
                'min': item.min_count,
                'max': item.max_count,
                'new': item.new_tabs or 0,
                'closed': item.closed_tabs or 0
            }
            for item in progress_data
        ]
        
        return jsonify(result)
        
    except Exception as e:
        app.logger.error(f"Error getting daily progress data: {str(e)}")
        return jsonify({"error": str(e)}), 500
        
@app.route('/api/stats/tab-changes', methods=['GET'])
def get_tab_changes():
    """Get daily tab changes (new, closed, total)"""
    try:
        # Get the last 14 days of data
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=14)
        
        # Get daily summary
        daily_data = db.session.query(
            cast(TabSnapshot.timestamp, Date).label('date'),
            func.sum(TabSnapshot.new_tabs).label('new_tabs'),
            func.sum(TabSnapshot.closed_tabs).label('closed_tabs'),
            func.avg(TabSnapshot.count).label('total_tabs')
        ).filter(
            TabSnapshot.timestamp.between(start_date, end_date)
        ).group_by(
            cast(TabSnapshot.timestamp, Date)
        ).order_by(
            cast(TabSnapshot.timestamp, Date)
        ).all()
        
        # Format the result
        result = [
            {
                'date': item.date.isoformat(),
                'new_tabs': item.new_tabs or 0,
                'closed_tabs': item.closed_tabs or 0,
                'total_tabs': round(item.total_tabs or 0)
            }
            for item in daily_data
        ]
        
        return jsonify(result)
        
    except Exception as e:
        app.logger.error(f"Error getting tab changes data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats/distribution', methods=['GET'])
def get_distribution_data():
    """Get current tab age distribution data"""
    try:
        # Get latest snapshot
        latest = TabSnapshot.query.order_by(TabSnapshot.timestamp.desc()).first()
        
        if not latest:
            return jsonify([])
        
        # Format data for the client
        result = {
            'timestamp': latest.timestamp.isoformat(),
            'count': latest.count,
            'distribution': [
                {'category': 'Today', 'count': latest.today_count},
                {'category': 'This Week', 'count': latest.week_count},
                {'category': 'This Month', 'count': latest.month_count},
                {'category': 'Older', 'count': latest.older_count},
                {'category': 'Unknown Age', 'count': latest.unknown_count}
            ],
            'peak': latest.peak_count
        }
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/suggest/groups', methods=['GET'])
def suggest_tab_groups():
    """Suggest tab groupings based on URL patterns and titles"""
    try:
        # Get latest snapshot ID
        latest_snapshot = TabSnapshot.query.order_by(TabSnapshot.timestamp.desc()).first()
        
        if not latest_snapshot:
            return jsonify([])
        
        # Get tab details for the latest snapshot
        tabs = TabDetail.query.filter_by(snapshot_id=latest_snapshot.id).all()
        
        # Group by domain
        domain_groups = defaultdict(list)
        for tab in tabs:
            domain = extract_domain(tab.url)
            if domain:
                domain_groups[domain].append({
                    'id': tab.browser_tab_id,
                    'title': tab.title,
                    'url': tab.url,
                    'age_days': tab.age_days if tab.age_days is not None else -1  # Use -1 to indicate unknown age
                })
        
        # Filter groups with more than 2 tabs
        suggestions = [
            {
                'name': domain,
                'count': len(tabs),
                'tabs': tabs,
                'oldest_age': max((tab['age_days'] for tab in tabs if tab['age_days'] >= 0), default=0),
                'reason': f'{len(tabs)} tabs from the same domain'
            }
            for domain, tabs in domain_groups.items() if len(tabs) >= 3
        ]
        
        # Sort suggestions by tab count (descending)
        suggestions.sort(key=lambda x: x['count'], reverse=True)
        
        return jsonify(suggestions[:10])  # Return top 10 suggestions
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/submit-feedback', methods=['POST'])
def submit_feedback():
    """Handle feedback submission and store in Google Sheets"""
    try:
        # Get feedback data from request
        data = request.json
        email = data.get('email', '')
        feedback = data.get('feedback', '')
        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # For debugging
        app.logger.info(f"Received feedback - Email: {email}, Date: {current_date}")
        
        # Store feedback in a file as a backup
        feedback_entry = {
            'email': email,
            'feedback': feedback,
            'date': current_date
        }
        
        try:
            # Try to append to existing feedback file
            with open('feedback_data.json', 'r') as f:
                feedback_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            # Create new feedback data if file doesn't exist or is invalid
            feedback_data = []
        
        # Add new feedback and save
        feedback_data.append(feedback_entry)
        with open('feedback_data.json', 'w') as f:
            json.dump(feedback_data, f, indent=2)
            
        # Try to send to Google Sheets if credentials exist
        credentials_path = 'client_secret.json'
        
        if os.path.exists(credentials_path):
            try:
                # Set up the credentials for the Google Sheets API
                scope = ['https://spreadsheets.google.com/feeds',
                         'https://www.googleapis.com/auth/drive']
                credentials = ServiceAccountCredentials.from_json_keyfile_name(credentials_path, scope)
                client = gspread.authorize(credentials)
                
                # Try to open by sheet ID first
                sheet_key = os.environ.get('FEEDBACK_SHEET_ID', None)
                if sheet_key:
                    try:
                        sheet = client.open_by_key(sheet_key).sheet1
                    except Exception:
                        app.logger.warning(f"Could not open sheet by ID '{sheet_key}', trying by name")
                        sheet_key = None
                
                # If sheet_key is None or opening by key failed, try by name
                if not sheet_key:
                    sheet_name = os.environ.get('FEEDBACK_SHEET_NAME', 'Tab Age Tracker Feedback')
                    sheet = client.open(sheet_name).sheet1
                
                # Add the feedback as a new row
                sheet.append_row([current_date, email, feedback])
                
                app.logger.info(f"Successfully added feedback to Google Sheets")
            except Exception as sheet_error:
                app.logger.error(f"Error sending feedback to Google Sheets: {str(sheet_error)}")
                # Continue with success response even if Google Sheets fails
        else:
            app.logger.warning("Google Sheets credentials not found. Feedback saved to local file only.")
        
        return jsonify({
            'status': 'success',
            'message': 'Feedback received! Thank you for helping improve Tab Age Tracker.'
        })
    
    except Exception as e:
        app.logger.error(f"Error submitting feedback: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'An error occurred: {str(e)}'
        }), 500

def categorize_tabs_by_age(tabs):
    """Categorize tabs by age"""
    now = datetime.utcnow()
    categories = {'today': 0, 'week': 0, 'month': 0, 'older': 0, 'unknown': 0}
    
    for tab in tabs:
        # First check if tab has a verified creation date
        if tab.get('createdAt') and tab.get('isVerified') is not False:
            created_at = datetime.fromisoformat(tab.get('createdAt').replace('Z', '+00:00'))
            age_days = (now - created_at).days
            
            if age_days < 1:
                categories['today'] += 1
            elif age_days < 7:
                categories['week'] += 1
            elif age_days < 30:
                categories['month'] += 1
            else:
                categories['older'] += 1
        else:
            # No verified creation date - try to extract date from URL
            url = tab.get('url', '')
            extracted_date = extract_date_from_url(url)
            
            if extracted_date:
                age_days = (now - extracted_date).days
                
                if age_days < 1:
                    categories['today'] += 1
                elif age_days < 7:
                    categories['week'] += 1
                elif age_days < 30:
                    categories['month'] += 1
                else:
                    categories['older'] += 1
            else:
                categories['unknown'] += 1
            
    return categories

def extract_domain(url):
    """Extract domain from URL"""
    try:
        parsed_url = urlparse(url)
        domain = parsed_url.netloc
        
        # Remove www. prefix
        if domain.startswith('www.'):
            domain = domain[4:]
            
        return domain
    except:
        return None

def extract_date_from_url(url):
    """Extract date from URL patterns"""
    if not url:
        return None
    
    try:
        # Pattern: /YYYY/MM/DD/ (e.g., /2024/04/02/)
        slash_pattern = r'/(\d{4})/(\d{1,2})/(\d{1,2})/'
        slash_match = re.search(slash_pattern, url)
        if slash_match:
            year, month, day = map(int, slash_match.groups())
            try:
                return datetime(year, month, day)
            except ValueError:
                pass
        
        # Pattern: /YYYY-MM-DD/ or ?date=YYYY-MM-DD
        dash_pattern = r'[\/\?].*?(\d{4}-\d{1,2}-\d{1,2})'
        dash_match = re.search(dash_pattern, url)
        if dash_match:
            date_str = dash_match.group(1)
            try:
                return datetime.strptime(date_str, '%Y-%m-%d')
            except ValueError:
                pass
        
        # Pattern: publication dates for news sites (common formats)
        pub_date_pattern = r'published[=\/](\d{4}[-\/]\d{1,2}[-\/]\d{1,2})'
        pub_match = re.search(pub_date_pattern, url, re.IGNORECASE)
        if pub_match:
            date_str = pub_match.group(1)
            try:
                # Try dash format first (YYYY-MM-DD)
                if '-' in date_str:
                    return datetime.strptime(date_str, '%Y-%m-%d')
                # Try slash format (YYYY/MM/DD)
                else:
                    return datetime.strptime(date_str, '%Y/%m/%d')
            except ValueError:
                pass
        
        return None
    except Exception as e:
        print(f"Error extracting date from URL: {e}")
        return None

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)