"""
Data Acuity System Dashboard API
Real-time system metrics and Docker container monitoring
"""

from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from flasgger import Swagger, swag_from
import psutil
import docker
import time
import threading
from datetime import datetime

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Swagger Configuration
swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/docs"
}

swagger_template = {
    "info": {
        "title": "Data Acuity System Dashboard API",
        "description": "Real-time system metrics, Docker container monitoring, and infrastructure health checks for the Data Acuity platform.",
        "version": "1.0.0",
        "contact": {
            "name": "Data Acuity Support",
            "email": "support@dataacuity.co.za"
        }
    },
    "host": "status.dataacuity.co.za",
    "basePath": "/",
    "schemes": ["https", "http"],
    "tags": [
        {"name": "Metrics", "description": "System metrics endpoints"},
        {"name": "Health", "description": "Health check endpoints"}
    ]
}

swagger = Swagger(app, config=swagger_config, template=swagger_template)

# Docker client initialization
try:
    docker_client = docker.from_env()
    DOCKER_AVAILABLE = True
except:
    DOCKER_AVAILABLE = False


def get_metrics():
    """Collect system metrics"""
    m = psutil.virtual_memory()
    d = psutil.disk_usage('/')
    n = psutil.net_io_counters()
    ds = {
        'available': DOCKER_AVAILABLE,
        'containers_running': 0,
        'containers_total': 0,
        'images_count': 0
    }

    if DOCKER_AVAILABLE:
        try:
            c = docker_client.containers.list(all=True)
            ds['containers_total'] = len(c)
            ds['containers_running'] = len([x for x in c if x.status == 'running'])
            ds['images_count'] = len(docker_client.images.list())
        except:
            pass

    return {
        'timestamp': datetime.now().isoformat(),
        'cpu': {
            'percent': psutil.cpu_percent(1),
            'count': psutil.cpu_count(),
            'frequency': psutil.cpu_freq().current if psutil.cpu_freq() else 0
        },
        'memory': {
            'total': m.total,
            'used': m.used,
            'percent': m.percent
        },
        'swap': {
            'total': psutil.swap_memory().total,
            'used': psutil.swap_memory().used,
            'percent': psutil.swap_memory().percent
        },
        'disk': {
            'total': d.total,
            'used': d.used,
            'free': d.free,
            'percent': d.percent
        },
        'network': {
            'bytes_sent': n.bytes_sent,
            'bytes_recv': n.bytes_recv
        },
        'docker': ds,
        'uptime_seconds': time.time() - psutil.boot_time()
    }


def broadcast():
    """Broadcast metrics via WebSocket"""
    while True:
        try:
            socketio.emit('metrics_update', get_metrics())
        except:
            pass
        time.sleep(2)


@app.route('/api/metrics')
@swag_from({
    'tags': ['Metrics'],
    'summary': 'Get current system metrics',
    'description': 'Returns comprehensive system metrics including CPU, memory, disk, network, and Docker container status.',
    'responses': {
        200: {
            'description': 'System metrics',
            'schema': {
                'type': 'object',
                'properties': {
                    'timestamp': {'type': 'string', 'format': 'date-time', 'description': 'ISO timestamp of metrics collection'},
                    'cpu': {
                        'type': 'object',
                        'properties': {
                            'percent': {'type': 'number', 'description': 'CPU usage percentage'},
                            'count': {'type': 'integer', 'description': 'Number of CPU cores'},
                            'frequency': {'type': 'number', 'description': 'CPU frequency in MHz'}
                        }
                    },
                    'memory': {
                        'type': 'object',
                        'properties': {
                            'total': {'type': 'integer', 'description': 'Total memory in bytes'},
                            'used': {'type': 'integer', 'description': 'Used memory in bytes'},
                            'percent': {'type': 'number', 'description': 'Memory usage percentage'}
                        }
                    },
                    'swap': {
                        'type': 'object',
                        'properties': {
                            'total': {'type': 'integer', 'description': 'Total swap in bytes'},
                            'used': {'type': 'integer', 'description': 'Used swap in bytes'},
                            'percent': {'type': 'number', 'description': 'Swap usage percentage'}
                        }
                    },
                    'disk': {
                        'type': 'object',
                        'properties': {
                            'total': {'type': 'integer', 'description': 'Total disk space in bytes'},
                            'used': {'type': 'integer', 'description': 'Used disk space in bytes'},
                            'free': {'type': 'integer', 'description': 'Free disk space in bytes'},
                            'percent': {'type': 'number', 'description': 'Disk usage percentage'}
                        }
                    },
                    'network': {
                        'type': 'object',
                        'properties': {
                            'bytes_sent': {'type': 'integer', 'description': 'Total bytes sent'},
                            'bytes_recv': {'type': 'integer', 'description': 'Total bytes received'}
                        }
                    },
                    'docker': {
                        'type': 'object',
                        'properties': {
                            'available': {'type': 'boolean', 'description': 'Whether Docker is available'},
                            'containers_running': {'type': 'integer', 'description': 'Number of running containers'},
                            'containers_total': {'type': 'integer', 'description': 'Total number of containers'},
                            'images_count': {'type': 'integer', 'description': 'Number of Docker images'}
                        }
                    },
                    'uptime_seconds': {'type': 'number', 'description': 'System uptime in seconds'}
                }
            }
        }
    }
})
def api_metrics():
    """Get current system metrics"""
    return jsonify(get_metrics())


@app.route('/api/health')
@swag_from({
    'tags': ['Health'],
    'summary': 'Health check endpoint',
    'description': 'Returns the health status of the dashboard API.',
    'responses': {
        200: {
            'description': 'Service is healthy',
            'schema': {
                'type': 'object',
                'properties': {
                    'status': {'type': 'string', 'example': 'ok'}
                }
            }
        }
    }
})
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})


@app.route('/')
@swag_from({
    'tags': ['Health'],
    'summary': 'API information',
    'description': 'Returns basic API information and available endpoints.',
    'responses': {
        200: {
            'description': 'API information',
            'schema': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string'},
                    'version': {'type': 'string'},
                    'documentation': {'type': 'string'},
                    'endpoints': {'type': 'array', 'items': {'type': 'string'}}
                }
            }
        }
    }
})
def root():
    """API root endpoint"""
    return jsonify({
        'name': 'Data Acuity System Dashboard API',
        'version': '1.0.0',
        'documentation': '/docs',
        'endpoints': ['/api/metrics', '/api/health', '/docs']
    })


@socketio.on('connect')
def conn():
    """Handle WebSocket connection"""
    socketio.emit('metrics_update', get_metrics())


if __name__ == '__main__':
    threading.Thread(target=broadcast, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000)
