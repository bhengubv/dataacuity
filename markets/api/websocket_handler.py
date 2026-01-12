
import asyncio
import json
from datetime import datetime
import redis
from fastapi import WebSocket, WebSocketDisconnect
from typing import List

# Redis connection
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

def get_cached_data(key: str):
    """Get data from Redis cache"""
    try:
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except:
        return None

def set_cached_data(key: str, data: dict, ttl: int = 30):
    """Set data in Redis cache with TTL"""
    try:
        redis_client.setex(key, ttl, json.dumps(data))
    except:
        pass
