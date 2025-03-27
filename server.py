import os
import json
import base64
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, cast, Date
import pandas as pd

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
    peak_count = db.Column(db.Integer)

class TabDetail(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    snapshot_id = db.Column(db.Integer, db.ForeignKey('tab_snapshot.id'))
    browser_tab_id = db.Column(db.Integer)
    title = db.Column(db.String(255))
    url = db.Column(db.Text)
    created_at = db.Column(db.DateTime)
    age_days = db.Column(db.Integer)

# Create database tables
with app.app_context():
    db.create_all()

@app.route('/')
def index():
    """Redirect to the web dashboard"""
    return redirect('/website/index.html')

@app.route('/website/<path:path>')
def serve_website(path):
    """Serve files from the website directory"""
    return send_from_directory('website', path)

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from the root directory"""
    return send_from_directory('.', path)

@app.route('/api/import-data', methods=['POST'])
def import_data():
    """Handle data import from the extension and save to database"""
    try:
        data = request.json
        
        # Process data based on format
        if 'tabData' in data and 'tabs' in data['tabData']:
            tabs = data['tabData']['tabs']
            peak_count = data.get('peakTabCount', 0)
        elif 'tabs' in data:
            tabs = data['tabs']
            peak_count = data.get('peakTabCount', 0)
        else:
            return jsonify({"status": "error", "message": "Invalid data format"}), 400
        
        # Count tabs by age category
        tab_counts = categorize_tabs_by_age(tabs)
        
        # Create new snapshot record
        snapshot = TabSnapshot(
            count=len(tabs),
            today_count=tab_counts['today'],
            week_count=tab_counts['week'],
            month_count=tab_counts['month'],
            older_count=tab_counts['older'],
            peak_count=peak_count
        )
        db.session.add(snapshot)
        db.session.flush()  # Get ID without committing
        
        # Add tab details
        for tab in tabs:
            created_at = datetime.fromisoformat(tab['createdAt'].replace('Z', '+00:00'))
            age_days = (datetime.utcnow() - created_at).days
            
            tab_detail = TabDetail(
                snapshot_id=snapshot.id,
                browser_tab_id=tab.get('id', 0),
                title=tab.get('title', 'Untitled'),
                url=tab.get('url', ''),
                created_at=created_at,
                age_days=age_days
            )
            db.session.add(tab_detail)
        
        db.session.commit()
        return jsonify({"status": "success", "message": "Data imported successfully"})
    
    except Exception as e:
        db.session.rollback()
        print(f"Error importing data: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

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
        
        # Format data for the client
        result = [
            {
                'date': date.strftime('%Y-%m-%d'),
                'avg_count': float(avg_count),
                'max_count': int(max_count),
                'min_count': int(min_count)
            } 
            for date, avg_count, max_count, min_count in trend_data
        ]
        
        return jsonify(result)
    
    except Exception as e:
        print(f"Error getting trend data: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

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
            'distribution': {
                'today': latest.today_count,
                'week': latest.week_count,
                'month': latest.month_count,
                'older': latest.older_count
            },
            'peak_count': latest.peak_count
        }
        
        return jsonify(result)
    
    except Exception as e:
        print(f"Error getting distribution data: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

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
        
        # Use pandas for easier data manipulation
        df = pd.DataFrame([
            {
                'id': tab.browser_tab_id,
                'title': tab.title,
                'url': tab.url,
                'age_days': tab.age_days,
                'created_at': tab.created_at
            }
            for tab in tabs
        ])
        
        # Skip if not enough tabs
        if len(df) < 3:
            return jsonify([])
        
        # Extract domains from URLs
        df['domain'] = df['url'].apply(extract_domain)
        
        # Create suggested groups
        suggested_groups = []
        
        # 1. Domain-based groups (with subdomains)
        domain_counts = df['domain'].value_counts()
        domains_with_multiple_tabs = domain_counts[domain_counts >= 2].index.tolist()
        
        for domain in domains_with_multiple_tabs:
            domain_tabs = df[df['domain'] == domain]
            if len(domain_tabs) >= 2:
                suggested_groups.append({
                    'name': f"{domain.capitalize()} Tabs",
                    'reason': f"Same website ({len(domain_tabs)} tabs)",
                    'count': len(domain_tabs),
                    'tabs': domain_tabs[['id', 'title', 'url', 'age_days']].to_dict('records')
                })
        
        # 2. Age-based groups
        # Very old tabs (30+ days)
        very_old_tabs = df[df['age_days'] > 30]
        if len(very_old_tabs) >= 2:
            suggested_groups.append({
                'name': 'Old Tabs (30+ days)',
                'reason': f"Tabs older than 30 days ({len(very_old_tabs)} tabs)",
                'count': len(very_old_tabs),
                'tabs': very_old_tabs[['id', 'title', 'url', 'age_days']].to_dict('records')
            })
        
        # Medium-aged tabs (7-30 days)
        medium_age_tabs = df[(df['age_days'] > 7) & (df['age_days'] <= 30)]
        if len(medium_age_tabs) >= 3:
            suggested_groups.append({
                'name': 'Week-old Tabs (7-30 days)',
                'reason': f"Tabs between 1-4 weeks old ({len(medium_age_tabs)} tabs)",
                'count': len(medium_age_tabs),
                'tabs': medium_age_tabs[['id', 'title', 'url', 'age_days']].to_dict('records')
            })
        
        # 3. Title keyword-based groups
        # Extract common words from titles (excluding stop words)
        stop_words = {'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was'}
        
        # Extract words from titles
        all_title_words = []
        for title in df['title']:
            words = [word.lower() for word in title.split() if len(word) > 3 and word.lower() not in stop_words]
            all_title_words.extend(words)
        
        # Count word occurrences
        from collections import Counter
        word_counts = Counter(all_title_words)
        
        # Find common words that appear in multiple tab titles
        common_words = {word: count for word, count in word_counts.items() if count >= 3}
        
        # For each common word, create a group
        for word, count in common_words.items():
            # Find tabs containing this word in the title
            matching_tabs = df[df['title'].str.contains(word, case=False)]
            if len(matching_tabs) >= 3:
                suggested_groups.append({
                    'name': f"{word.capitalize()} Tabs",
                    'reason': f"Tabs with '{word}' in the title ({len(matching_tabs)} tabs)",
                    'count': len(matching_tabs),
                    'tabs': matching_tabs[['id', 'title', 'url', 'age_days']].to_dict('records')
                })
        
        # 4. Recently opened tabs (within the last 24 hours)
        recent_tabs = df[df['age_days'] == 0]
        if len(recent_tabs) >= 3:
            suggested_groups.append({
                'name': 'Recent Tabs (Today)',
                'reason': f"Tabs opened today ({len(recent_tabs)} tabs)",
                'count': len(recent_tabs),
                'tabs': recent_tabs[['id', 'title', 'url', 'age_days']].to_dict('records')
            })
        
        # Sort groups by tab count (descending)
        suggested_groups.sort(key=lambda x: x['count'], reverse=True)
        
        return jsonify(suggested_groups)
    
    except Exception as e:
        print(f"Error suggesting groups: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Helper functions
def categorize_tabs_by_age(tabs):
    """Categorize tabs by age"""
    counts = {
        'today': 0,
        'week': 0,
        'month': 0,
        'older': 0
    }
    
    now = datetime.utcnow()
    
    for tab in tabs:
        created_at = datetime.fromisoformat(tab['createdAt'].replace('Z', '+00:00'))
        age_days = (now - created_at).days
        
        if age_days == 0:
            counts['today'] += 1
        elif age_days <= 7:
            counts['week'] += 1
        elif age_days <= 30:
            counts['month'] += 1
        else:
            counts['older'] += 1
    
    return counts

def extract_domain(url):
    """Extract domain from URL"""
    try:
        if not url:
            return 'unknown'
        
        # Remove protocol
        domain = url.split('//')[1] if '//' in url else url
        
        # Get domain part
        domain = domain.split('/')[0]
        
        # Remove www prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        
        return domain
    except:
        return 'unknown'

if __name__ == '__main__':
    # Get port from environment or use 5000 as default
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)