import asyncio
import json
from typing import List, Dict
from fastapi import WebSocket
import redis.asyncio as redis
from datetime import datetime

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.redis_client = None
        
    async def init_redis(self):
        """Initialize Redis connection"""
        try:
            self.redis_client = await redis.from_url(
                "redis://markets_redis:6379",
                encoding="utf-8",
                decode_responses=True
            )
            print("✅ Redis connected for WebSocket")
        except Exception as e:
            print(f"⚠️  Redis not available: {e}")
            self.redis_client = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"📡 WebSocket connected. Total: {len(self.active_connections)}")
        
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"📡 WebSocket disconnected. Total: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"Error sending message: {e}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error broadcasting: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected
        for conn in disconnected:
            self.disconnect(conn)
    
    async def get_cached(self, key: str) -> Dict:
        """Get cached data from Redis"""
        if not self.redis_client:
            return None
        try:
            data = await self.redis_client.get(f"market:{key}")
            return json.loads(data) if data else None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    
    async def set_cached(self, key: str, data: Dict, ttl: int = 30):
        """Cache data in Redis with TTL"""
        if not self.redis_client:
            return
        try:
            await self.redis_client.setex(
                f"market:{key}",
                ttl,
                json.dumps(data)
            )
        except Exception as e:
            print(f"Cache set error: {e}")

manager = ConnectionManager()
