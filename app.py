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

@app.route('/')
def home():
    """Home page redirects to index.html"""
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
    # The query parameters are just for cache busting - we ignore them
    return send_from_directory('.', 'tab-age-tracker-v1.9.2-fixed-search.zip', as_attachment=True)

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