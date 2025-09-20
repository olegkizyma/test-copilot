#!/usr/bin/env python3
"""
ATLAS Minimal Frontend Server
Простий Flask сервер тільки для статичних файлів та 3D моделі
Вся логіка перенесена в orchestrator
"""

import os
import logging
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger('atlas.frontend')

# Get paths
CURRENT_DIR = Path(__file__).parent
TEMPLATE_DIR = CURRENT_DIR / 'templates'
STATIC_DIR = CURRENT_DIR / 'static'

# Create Flask app
app = Flask(__name__, 
           template_folder=str(TEMPLATE_DIR),
           static_folder=str(STATIC_DIR))

# Configuration
FRONTEND_PORT = int(os.environ.get('FRONTEND_PORT', 5001))

@app.route('/')
def index():
    """Serve the main interface with 3D model"""
    return render_template('index.html', 
                         current_time=datetime.now().strftime('%H:%M:%S'),
                         timestamp=int(datetime.now().timestamp()))

@app.route('/health')
def health():
    """Simple health check"""
    return {
        'status': 'ok',
        'service': 'atlas-frontend',
        'timestamp': datetime.now().isoformat(),
        'port': FRONTEND_PORT
    }

@app.route('/logs')
def get_logs():
    """Get system logs - proxy to orchestrator"""
    try:
        import requests
        response = requests.get('http://localhost:5101/logs', timeout=5)
        return response.json()
    except Exception:
        return {'error': 'Failed to get logs', 'logs': []}

if __name__ == '__main__':
    logger.info(f"Starting ATLAS Minimal Frontend Server on port {FRONTEND_PORT}")
    logger.info("Serving static files and 3D model interface")
    logger.info("All API logic handled by orchestrator on port 5101")
    
    app.run(host='0.0.0.0', port=FRONTEND_PORT, debug=False)
