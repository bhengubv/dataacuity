import os
import json
import hashlib
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import Json
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
import httpx

app = FastAPI()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://openbb:openbb_pass@markets_db:5432/openbb_data")
OPENBB_API_URL = "http://localhost:8080"

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS api_cache (
            id SERIAL PRIMARY KEY,
            cache_key VARCHAR(255) UNIQUE NOT NULL,
            endpoint VARCHAR(500) NOT NULL,
            params JSONB,
            response JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cache_key ON api_cache(cache_key)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_expires_at ON api_cache(expires_at)")
    conn.commit()
    cur.close()
    conn.close()

def generate_cache_key(endpoint: str, params: dict) -> str:
    key_string = f"{endpoint}:{json.dumps(params, sort_keys=True)}"
    return hashlib.md5(key_string.encode()).hexdigest()

def get_cached_response(cache_key: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT response FROM api_cache WHERE cache_key = %s AND expires_at > NOW()",
        (cache_key,)
    )
    result = cur.fetchone()
    cur.close()
    conn.close()
    return result[0] if result else None

def cache_response(cache_key: str, endpoint: str, params: dict, response: dict, ttl_minutes: int = 60):
    conn = get_db_connection()
    cur = conn.cursor()
    expires_at = datetime.now() + timedelta(minutes=ttl_minutes)
    cur.execute("""
        INSERT INTO api_cache (cache_key, endpoint, params, response, expires_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (cache_key) DO UPDATE SET
            response = EXCLUDED.response,
            expires_at = EXCLUDED.expires_at,
            created_at = CURRENT_TIMESTAMP
    """, (cache_key, endpoint, Json(params), Json(response), expires_at))
    conn.commit()
    cur.close()
    conn.close()

@app.on_event("startup")
async def startup_event():
    init_db()

@app.api_route("/{path:path}", methods=["GET", "POST"])
async def proxy_with_cache(request: Request, path: str):
    params = dict(request.query_params)
    cache_key = generate_cache_key(path, params)
    
    # Check cache
    cached = get_cached_response(cache_key)
    if cached:
        return JSONResponse(content=cached, headers={"X-Cache": "HIT"})
    
    # Fetch from OpenBB API
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method=request.method,
            url=f"{OPENBB_API_URL}/{path}",
            params=params,
            headers=dict(request.headers)
        )
    
    response_data = response.json()
    
    # Cache the response
    cache_response(cache_key, path, params, response_data)
    
    return JSONResponse(
        content=response_data,
        status_code=response.status_code,
        headers={"X-Cache": "MISS"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
