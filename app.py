from flask import Flask, send_from_directory, redirect

app = Flask(__name__)

@app.route('/')
def home():
    """Home page redirects to index.html"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_file(path):
    """Serve any file from the current directory"""
    return send_from_directory('.', path)

@app.route('/website/<path:path>')
def serve_website(path):
    """Serve any file from the website directory"""
    return send_from_directory('website', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)