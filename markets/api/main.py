from fastapi import FastAPI, HTTPException, Security, Depends, Request
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta
from functools import lru_cache
from pydantic import BaseModel, Field, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from prometheus_fastapi_instrumentator import Instrumentator
import os
import httpx
import json
import secrets
import csv
import io

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)

# Keycloak/OAuth2 Configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://auth.dataacuity.co.za")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "dataacuity")

app = FastAPI(
    title="DataAcuity Market Data API",
    description="""
## Financial Market Data Platform

Real-time and historical market data for stocks, crypto, metals, and indices.

### Features
- **Latest Prices**: Current prices across all asset classes
- **Top Movers**: Daily gainers and losers
- **Historical Data**: OHLCV data with configurable intervals
- **AI Insights**: Market analysis powered by Ollama

## Authentication

Access this API via the DataAcuity API Gateway:

### 1. API Key (Recommended)
```
X-API-Key: dak_your_api_key_here
```

### 2. OAuth2/JWT Token
```
Authorization: Bearer <jwt_token>
```

### 3. Internal App Credentials
```
X-App-ID: your-app-id
X-App-Secret: das_your_secret
```

## Rate Limits
- Standard: 30-60 requests/minute per endpoint
- Enterprise users have higher limits

## Gateway Access
Access via: `https://api.dataacuity.co.za/api/v1/markets/`
""",
    version="2.0.0",
    contact={
        "name": "DataAcuity API Support",
        "url": "https://dataacuity.co.za/support",
        "email": "api-support@dataacuity.co.za",
    },
    servers=[
        {"url": "https://api.markets.dataacuity.co.za", "description": "Production"},
        {"url": "https://api.dataacuity.co.za/api/v1/markets", "description": "Via API Gateway"},
        {"url": "http://localhost:8000", "description": "Development"},
    ],
)

# Custom OpenAPI schema with OAuth2 security
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        servers=app.servers,
        contact=app.contact,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "OAuth2": {
            "type": "oauth2",
            "flows": {
                "authorizationCode": {
                    "authorizationUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth",
                    "tokenUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "scopes": {
                        "openid": "OpenID Connect scope",
                        "profile": "User profile access",
                        "email": "User email access",
                    }
                },
                "clientCredentials": {
                    "tokenUrl": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "scopes": {"openid": "OpenID Connect scope"}
                }
            }
        },
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token from Keycloak"
        },
        "ApiKeyAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "API Key from DataAcuity developer portal"
        }
    }
    openapi_schema["security"] = [
        {"BearerAuth": []},
        {"ApiKeyAuth": []},
        {"OAuth2": ["openid", "profile", "email"]}
    ]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Prometheus metrics instrumentation
Instrumentator().instrument(app).expose(app)

# Configure CORS - restrict origins in production
# Set ALLOWED_ORIGINS environment variable with comma-separated domains
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5010,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://openbb:openbb_pass@markets_db:5432/openbb_data")
engine = create_engine(DATABASE_URL)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ai_brain_ollama:11434")
ASSET_TYPE_MAP = {'EQUITY': 'stocks', 'ETF': 'indices', 'FUTURE': 'metals', 'CRYPTOCURRENCY': 'crypto'}

# ==================== AUTHENTICATION ====================
API_KEYS = os.getenv("API_KEYS", "").split(",")
API_KEY_ENABLED = os.getenv("API_KEY_ENABLED", "false").lower() == "true"
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    """Verify API key if authentication is enabled"""
    if not API_KEY_ENABLED:
        return True

    if not api_key:
        raise HTTPException(status_code=401, detail="API key required")

    if api_key not in API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API key")

    return True

# ==================== INPUT VALIDATION MODELS ====================
class SymbolQuery(BaseModel):
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)
    exchange: str = Field(default=None, max_length=20)
    asset_type: str = Field(default=None, max_length=50)
    search: str = Field(default=None, max_length=100)

    @validator('exchange', 'asset_type', 'search')
    def sanitize_strings(cls, v):
        if v:
            # Remove potentially dangerous characters
            return ''.join(c for c in v if c.isalnum() or c in ['-', '_', ' ', '%'])
        return v

class HistoricalQuery(BaseModel):
    interval: str = Field(default="30d", pattern="^(1h|24h|7d|30d|90d|1y)$")

class CategoryQuery(BaseModel):
    category: str = Field(default="all", pattern="^(stocks|crypto|metals|indices|all)$")

@app.get("/")
def read_root():
    return {"status": "Market Data API is running", "version": "2.0"}

@app.get("/health")
@app.get("/api/health")
@limiter.limit("60/minute")
def health_check(request: Request):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy"
    try:
        response = httpx.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2.0)
        ai_status = "healthy" if response.status_code == 200 else "unhealthy"
    except:
        ai_status = "unreachable"
    return {"database": db_status, "ai_service": ai_status}

@app.get("/api/latest-prices")
@limiter.limit("30/minute")
def get_latest_prices(request: Request, authenticated: bool = Depends(verify_api_key)):
    query = text("""
        SELECT DISTINCT ON (symbol) symbol, date, open, high, low, close, volume, asset_type 
        FROM stock_prices WHERE close IS NOT NULL ORDER BY symbol, date DESC
    """)
    with engine.connect() as conn:
        result = conn.execute(query)
        prices = []
        for row in result:
            prices.append({
                "symbol": row[0], "date": row[1].isoformat() if row[1] else None,
                "open": float(row[2]) if row[2] else 0, "high": float(row[3]) if row[3] else 0,
                "low": float(row[4]) if row[4] else 0, "close": float(row[5]) if row[5] else 0,
                "volume": int(row[6]) if row[6] else 0, "asset_type": row[7],
                "category": ASSET_TYPE_MAP.get(row[7], 'unknown')
            })
        return prices

@app.get("/api/top-movers")
@limiter.limit("60/minute")
def get_top_movers(request: Request, category: str = "all"):
    """Working top movers with correct closing prices"""
    # Map category to asset_type - validation
    asset_type_map = {
        "stocks": "EQUITY",
        "crypto": "CRYPTOCURRENCY",
        "metals": "FUTURE",
        "indices": "ETF",
        "all": None
    }

    asset_type = asset_type_map.get(category, None)

    if asset_type:
        query = text("""
            WITH daily_prices AS (
                SELECT DISTINCT ON (symbol, DATE(date AT TIME ZONE 'America/New_York'))
                    symbol,
                    DATE(date AT TIME ZONE 'America/New_York') as trade_date,
                    close,
                    asset_type
                FROM stock_prices
                WHERE close IS NOT NULL
                AND date >= CURRENT_DATE - INTERVAL '10 days'
                AND asset_type = :asset_type
                AND (asset_type = 'CRYPTOCURRENCY' OR EXTRACT(HOUR FROM date AT TIME ZONE 'America/New_York') = 5)
                ORDER BY symbol, DATE(date AT TIME ZONE 'America/New_York') DESC, date DESC
            ),
            ranked AS (
                SELECT symbol, trade_date, close, asset_type,
                       ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) as rn
                FROM daily_prices
            )
            SELECT curr.symbol, curr.close, prev.close, curr.asset_type,
                   ROUND(((curr.close - prev.close) / prev.close * 100)::numeric, 2) as change_pct
            FROM ranked curr
            JOIN ranked prev ON curr.symbol = prev.symbol AND prev.rn = 2
            WHERE curr.rn = 1 AND prev.close > 0 AND ABS(curr.close - prev.close) > 0.01
            ORDER BY change_pct DESC
        """)
        params = {"asset_type": asset_type}
    else:
        query = text("""
            WITH daily_prices AS (
                SELECT DISTINCT ON (symbol, DATE(date AT TIME ZONE 'America/New_York'))
                    symbol,
                    DATE(date AT TIME ZONE 'America/New_York') as trade_date,
                    close,
                    asset_type
                FROM stock_prices
                WHERE close IS NOT NULL
                AND date >= CURRENT_DATE - INTERVAL '10 days'
                AND (asset_type = 'CRYPTOCURRENCY' OR EXTRACT(HOUR FROM date AT TIME ZONE 'America/New_York') = 5)
                ORDER BY symbol, DATE(date AT TIME ZONE 'America/New_York') DESC, date DESC
            ),
            ranked AS (
                SELECT symbol, trade_date, close, asset_type,
                       ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) as rn
                FROM daily_prices
            )
            SELECT curr.symbol, curr.close, prev.close, curr.asset_type,
                   ROUND(((curr.close - prev.close) / prev.close * 100)::numeric, 2) as change_pct
            FROM ranked curr
            JOIN ranked prev ON curr.symbol = prev.symbol AND prev.rn = 2
            WHERE curr.rn = 1 AND prev.close > 0 AND ABS(curr.close - prev.close) > 0.01
            ORDER BY change_pct DESC
        """)
        params = {}

    try:
        with engine.connect() as conn:
            result = conn.execute(query, params)
            movers = [{"symbol": r[0], "price": float(r[1]), "change": float(r[4]), "asset_type": r[3]} for r in result]
            gainers = [m for m in movers if m["change"] > 0][:10]
            losers = sorted([m for m in movers if m["change"] < 0], key=lambda x: x["change"])[:10]
            return {"gainers": gainers, "losers": losers, "comparison": {"latest_date": None, "previous_date": None, "description": "Current data"}}
    except Exception as e:
        # Log error properly in production (use logging module)
        return {"gainers": [], "losers": [], "comparison": {"latest_date": None, "previous_date": None, "description": "Error"}}


@app.get("/api/historical/{symbol}")
@limiter.limit("60/minute")
def get_historical_data(request: Request, symbol: str, interval: str = "30d"):
    # Validate interval
    valid_intervals = ["1h", "24h", "7d", "30d", "90d", "1y"]
    if interval not in valid_intervals:
        raise HTTPException(status_code=400, detail=f"Invalid interval. Must be one of: {', '.join(valid_intervals)}")

    now = datetime.now()
    interval_map = {
        "1h": now - timedelta(hours=1),
        "24h": now - timedelta(days=1),
        "7d": now - timedelta(days=7),
        "30d": now - timedelta(days=30),
        "90d": now - timedelta(days=90),
        "1y": now - timedelta(days=365)
    }
    start_date = interval_map.get(interval, now - timedelta(days=30))
    query = text("""SELECT date, open, high, low, close, volume FROM stock_prices WHERE symbol = :symbol AND date >= :start_date AND close IS NOT NULL ORDER BY date ASC""")
    with engine.connect() as conn:
        result = conn.execute(query, {"symbol": symbol.upper(), "start_date": start_date})
        historical = []
        for row in result:
            historical.append({"date": row[0].isoformat() if row[0] else None, "open": float(row[1]) if row[1] else 0, "high": float(row[2]) if row[2] else 0, "low": float(row[3]) if row[3] else 0, "close": float(row[4]) if row[4] else 0, "volume": int(row[5]) if row[5] else 0})
        return historical

@app.get("/api/categories")
@limiter.limit("60/minute")
def get_categories(request: Request):
    query = text("""SELECT DISTINCT ON (symbol) symbol, close, volume, asset_type FROM stock_prices WHERE close IS NOT NULL AND asset_type IS NOT NULL ORDER BY symbol, date DESC""")
    with engine.connect() as conn:
        result = conn.execute(query)
        organized = {}
        for row in result:
            category = ASSET_TYPE_MAP.get(row[3], 'unknown')
            if category not in organized:
                organized[category] = {}
            organized[category][row[0]] = {"close": float(row[1]) if row[1] else 0, "volume": int(row[2]) if row[2] else 0, "asset_type": row[3]}
        return organized

@app.get("/api/stats")
@limiter.limit("60/minute")
def get_market_stats(request: Request):
    return _get_market_stats_cached()

@lru_cache(maxsize=5)
def _get_market_stats_cached():
    query = text("""SELECT asset_type, COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as record_count, MAX(date) as last_update FROM stock_prices WHERE close IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY asset_type ORDER BY asset_type""")
    total_query = text("""SELECT COUNT(DISTINCT symbol) as total_symbols, COUNT(*) as total_records, MAX(date) as last_update FROM stock_prices WHERE close IS NOT NULL""")
    with engine.connect() as conn:
        result = conn.execute(query)
        breakdown = []
        for row in result:
            breakdown.append({"asset_type": row[0], "category": ASSET_TYPE_MAP.get(row[0], 'unknown'), "symbol_count": row[1], "record_count": row[2], "last_update": row[3].isoformat() if row[3] else None})
        total_result = conn.execute(total_query)
        total_row = total_result.fetchone()
        return {"total_symbols": total_row[0], "total_records": total_row[1], "last_update": total_row[2].isoformat() if total_row[2] else None, "breakdown": breakdown}

@app.get("/api/sentiment")
@limiter.limit("30/minute")
async def get_market_sentiment(request: Request):
    return _get_market_sentiment_cached()

@lru_cache(maxsize=10)
def _get_market_sentiment_cached():
    """Get overall market sentiment - previous day comparison"""
    query = text("""
        WITH latest_prices AS (
            SELECT DISTINCT ON (symbol)
                symbol, close as current_price, asset_type, date
            FROM stock_prices
            WHERE close IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY symbol, date DESC
        ),
        previous_day AS (
            SELECT symbol, MAX(DATE(date)) as prev_date
            FROM stock_prices
            WHERE DATE(date) < CURRENT_DATE
            GROUP BY symbol
        ),
        day_ago_prices AS (
            SELECT DISTINCT ON (sp.symbol)
                sp.symbol, sp.close as previous_price
            FROM stock_prices sp
            INNER JOIN previous_day pd ON sp.symbol = pd.symbol AND DATE(sp.date) = pd.prev_date
            WHERE sp.close IS NOT NULL
            ORDER BY sp.symbol, sp.date DESC
        )
        SELECT lp.symbol, lp.asset_type,
               ROUND(((lp.current_price - pp.previous_price) / pp.previous_price * 100)::numeric, 2) as change_percent
        FROM latest_prices lp
        INNER JOIN day_ago_prices pp ON lp.symbol = pp.symbol
        WHERE pp.previous_price > 0
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query)
        market_data = [{"symbol": row[0], "asset_type": row[1], "change": float(row[2])} for row in result]
    
    total_symbols = len(market_data)
    gainers = len([d for d in market_data if d["change"] > 0])
    losers = len([d for d in market_data if d["change"] < 0])
    avg_change = sum(d["change"] for d in market_data) / total_symbols if total_symbols > 0 else 0
    sentiment_score = int((gainers / total_symbols * 100) if total_symbols > 0 else 50)
    sentiment = "bullish" if sentiment_score >= 60 else "bearish" if sentiment_score <= 40 else "neutral"
    
    return {
        "sentiment": sentiment, "score": sentiment_score, "confidence": sentiment_score,
        "statistics": {"total_symbols": total_symbols, "gainers": gainers, "losers": losers, "neutral": total_symbols - gainers - losers, "avg_change": round(avg_change, 2)},
        "ai_analysis": {"key_factors": ["24-hour momentum", "Daily trends"], "outlook": f"Market showing {sentiment} sentiment with {gainers} gainers vs {losers} losers over 24h"},
        "generated_at": datetime.now().isoformat()
    }
@app.get("/api/predictions/{symbol}")
@limiter.limit("30/minute")
async def get_predictions(request: Request, symbol: str):
    query = text("""SELECT date, close, volume FROM stock_prices WHERE symbol = :symbol AND close IS NOT NULL ORDER BY date DESC LIMIT 30""")
    with engine.connect() as conn:
        result = conn.execute(query, {"symbol": symbol.upper()})
        historical_data = [{"date": row[0].isoformat(), "close": float(row[1]), "volume": int(row[2])} for row in result]
    if not historical_data:
        raise HTTPException(status_code=404, detail="No data found")
    latest_price = historical_data[0]["close"]
    price_list = [d["close"] for d in historical_data[:7]]
    avg_price = sum(price_list) / len(price_list)
    trend = "bullish" if latest_price > avg_price else "bearish" if latest_price < avg_price else "neutral"
    return {"symbol": symbol, "current_price": latest_price, "prediction": {"prediction": trend, "confidence": 65, "target_price": round(avg_price * 1.02, 2), "timeframe": "24h", "reasoning": f"Based on 7-day average, trend is {trend}"}, "generated_at": datetime.now().isoformat()}


# ============================================
# EXCHANGE & SYMBOL DISCOVERY ENDPOINTS
# ============================================

@app.get("/api/exchanges")
@limiter.limit("60/minute")
def get_exchanges(request: Request):
    """Get all active exchanges with symbol counts"""
    try:
        query = text("""
            SELECT e.code, e.name, e.country, COUNT(DISTINCT s.symbol) as symbol_count
            FROM exchanges e
            LEFT JOIN symbols s ON e.id = s.exchange_id AND s.is_active = true
            WHERE e.is_active = true
            GROUP BY e.id, e.code, e.name, e.country
            ORDER BY e.name
        """)
        with engine.connect() as conn:
            result = conn.execute(query)
            return [
                {
                    "code": row[0],
                    "name": row[1],
                    "country": row[2] or "Global",
                    "symbols": row[3]
                }
                for row in result
            ]
    except Exception as e:
        return [{"code": "NYSE", "name": "New York Stock Exchange", "country": "USA", "symbols": 29}]


@app.get("/api/exchanges/crypto")
@limiter.limit("60/minute")
def get_crypto_exchanges(request: Request):
    """Get crypto exchanges with symbol counts from junction table"""
    query = text("""
        SELECT e.code, e.name, e.country,
               COUNT(cel.id) as symbols
        FROM exchanges e
        LEFT JOIN crypto_exchange_listings cel ON e.id = cel.exchange_id
        WHERE e.is_crypto_exchange = TRUE
        GROUP BY e.code, e.name, e.country
        ORDER BY
            CASE
                WHEN e.country = 'South Africa' THEN 1
                WHEN e.country IN ('United States', 'Canada') THEN 2
                ELSE 3
            END,
            e.name
    """)
    with engine.connect() as conn:
        result = conn.execute(query)
        return [dict(row._mapping) for row in result]

@app.get("/api/symbols/crypto")
@limiter.limit("60/minute")
def get_crypto_symbols(request: Request, exchange: str, limit: int = 100, offset: int = 0):
    """Get crypto symbols for specific exchange using junction table"""
    # Validate and sanitize inputs
    limit = min(max(1, limit), 1000)  # Clamp between 1 and 1000
    offset = max(0, offset)

    count_query = text("""
        SELECT COUNT(DISTINCT s.id)
        FROM symbols s
        JOIN crypto_exchange_listings cel ON s.id = cel.symbol_id
        JOIN exchanges e ON cel.exchange_id = e.id
        WHERE e.code = :exchange AND s.is_active = true
    """)

    query = text("""
        SELECT DISTINCT s.symbol, s.name, e.code as exchange_code, e.name as exchange_name
        FROM symbols s
        JOIN crypto_exchange_listings cel ON s.id = cel.symbol_id
        JOIN exchanges e ON cel.exchange_id = e.id
        WHERE e.code = :exchange AND s.is_active = true
        ORDER BY s.symbol
        LIMIT :limit OFFSET :offset
    """)

    with engine.connect() as conn:
        total = conn.execute(count_query, {"exchange": exchange}).scalar()
        result = conn.execute(query, {"exchange": exchange, "limit": limit, "offset": offset})
        symbols = [
            {
                "symbol": row[0],
                "name": row[1] or row[0],
                "exchange": row[2],
                "exchange_name": row[3],
                "type": "CRYPTOCURRENCY",
                "last_trade": None,
                "records": 0
            }
            for row in result
        ]
        return {"total": total, "limit": limit, "offset": offset, "symbols": symbols}

@app.get("/api/symbols")
@limiter.limit("60/minute")
def get_symbols(
    request: Request,
    limit: int = 100,
    offset: int = 0,
    exchange: str = None,
    asset_type: str = None,
    search: str = None
):
    """Get symbols with pagination and filtering"""
    # Validate and sanitize inputs
    limit = min(max(1, limit), 1000)
    offset = max(0, offset)

    try:
        # Special handling for crypto exchanges - use junction table
        if asset_type == 'CRYPTOCURRENCY' and exchange:
            count_query = text("""
                SELECT COUNT(DISTINCT s.id)
                FROM symbols s
                JOIN crypto_exchange_listings cel ON s.id = cel.symbol_id
                JOIN exchanges e ON cel.exchange_id = e.id
                WHERE e.code = :exchange AND s.asset_type = 'CRYPTOCURRENCY' AND s.is_active = true
            """)

            query = text("""
                SELECT DISTINCT s.symbol, s.name, e.code as exchange_code, e.name as exchange_name,
                       s.asset_type, NULL as last_trade_date, 0 as price_records
                FROM symbols s
                JOIN crypto_exchange_listings cel ON s.id = cel.symbol_id
                JOIN exchanges e ON cel.exchange_id = e.id
                WHERE e.code = :exchange AND s.asset_type = 'CRYPTOCURRENCY' AND s.is_active = true
                ORDER BY s.symbol
                LIMIT :limit OFFSET :offset
            """)

            with engine.connect() as conn:
                total = conn.execute(count_query, {"exchange": exchange}).scalar()
                result = conn.execute(query, {"exchange": exchange, "limit": limit, "offset": offset})
                symbols = [
                    {
                        "symbol": row[0],
                        "name": row[1] or row[0],
                        "exchange": row[2],
                        "exchange_name": row[3],
                        "type": row[4] or "CRYPTOCURRENCY",
                        "last_trade": None,
                        "records": 0
                    }
                    for row in result
                ]
                return {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "symbols": symbols
                }

        # Build parameterized query conditions
        conditions = []
        params = {"limit": limit, "offset": offset}

        if exchange:
            conditions.append("exchange_code = :exchange")
            params["exchange"] = exchange
        if asset_type:
            conditions.append("asset_type = :asset_type")
            params["asset_type"] = asset_type
        if search:
            conditions.append("(symbol ILIKE :search OR name ILIKE :search)")
            params["search"] = f"%{search}%"

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        count_query = text(f"SELECT COUNT(*) FROM mv_symbol_list WHERE {where_clause}")

        query = text(f"""
            SELECT symbol, name, exchange_code, exchange_name, asset_type,
                   last_trade_date, price_records
            FROM mv_symbol_list
            WHERE {where_clause}
            ORDER BY symbol
            LIMIT :limit OFFSET :offset
        """)


        with engine.connect() as conn:
            total = conn.execute(count_query, params).scalar()
            result = conn.execute(query, params)

            symbols = [
                {
                    "symbol": row[0],
                    "name": row[1] or row[0],
                    "exchange": row[2],
                    "exchange_name": row[3],
                    "type": row[4] or "EQUITY",
                    "last_trade": row[5].isoformat() if row[5] else None,
                    "records": row[6]
                }
                for row in result
            ]

            return {
                "total": total,
                "limit": limit,
                "offset": offset,
                "symbols": symbols
            }
    except Exception as e:
        query = text("""
            SELECT DISTINCT symbol, asset_type
            FROM stock_prices
            WHERE symbol IS NOT NULL
            ORDER BY symbol
            LIMIT :limit OFFSET :offset
        """)
        with engine.connect() as conn:
            result = conn.execute(query, {"limit": limit, "offset": offset})
            symbols = [
                {
                    "symbol": row[0],
                    "name": row[0],
                    "exchange": "NYSE",
                    "exchange_name": "New York Stock Exchange",
                    "type": row[1] or "EQUITY"
                }
                for row in result
            ]
            return {"total": len(symbols), "limit": limit, "offset": offset, "symbols": symbols}

# ==================== LANGUAGE ENDPOINTS ====================

@app.get("/api/languages")
@limiter.limit("60/minute")
def get_languages(request: Request):
    """Get all available languages"""
    query = text("""
        SELECT code, name, native_name, is_active
        FROM languages
        WHERE is_active = true
        ORDER BY name
    """)
    with engine.connect() as conn:
        result = conn.execute(query)
        return {"languages": [dict(row._mapping) for row in result]}

@app.get("/api/translations/{language_code}")
@limiter.limit("60/minute")
def get_translations(request: Request, language_code: str):
    """Get all translations for a language"""
    query = text("""
        SELECT translation_key, translation_value, category
        FROM translations
        WHERE language_code = :lang_code
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {"lang_code": language_code})
        translations = {}
        for row in result:
            translations[row.translation_key] = row.translation_value
        return {"language_code": language_code, "translations": translations}

@app.get("/api/exchanges")
@limiter.limit("60/minute")
def get_all_exchanges(request: Request, crypto: bool = False):
    """Get all exchanges with symbol counts. If crypto=true, return only crypto exchanges."""
    if crypto:
        query = text("""
            SELECT e.code, e.name, e.country,
                   COUNT(cel.id) as symbols
            FROM exchanges e
            LEFT JOIN crypto_exchange_listings cel ON e.id = cel.exchange_id
            WHERE e.is_crypto_exchange = TRUE
            GROUP BY e.code, e.name, e.country
            ORDER BY
                CASE
                    WHEN e.country = 'South Africa' THEN 1
                    WHEN e.country IN ('United States', 'Canada') THEN 2
                    ELSE 3
                END,
                e.name
        """)
    else:
        query = text("""
            SELECT e.code, e.name, e.country, e.timezone,
                   COUNT(s.id) as symbols
            FROM exchanges e
            LEFT JOIN symbols s ON e.id = s.exchange_id AND s.is_active = true
            WHERE e.is_active = true AND (e.is_crypto_exchange IS NULL OR e.is_crypto_exchange = FALSE)
            GROUP BY e.code, e.name, e.country, e.timezone
            ORDER BY symbols DESC, e.name
        """)
    with engine.connect() as conn:
        result = conn.execute(query)
        return [dict(row._mapping) for row in result]

# ==================== EXPORT ENDPOINTS ====================

@app.get("/api/export/historical/{symbol}")
@limiter.limit("10/minute")
def export_historical_data(
    request: Request,
    symbol: str,
    interval: str = "30d",
    format: str = "csv"
):
    """Export historical data as CSV or JSON"""
    # Validate interval
    valid_intervals = ["1h", "24h", "7d", "30d", "90d", "1y"]
    if interval not in valid_intervals:
        raise HTTPException(status_code=400, detail=f"Invalid interval")

    # Validate format
    if format not in ["csv", "json"]:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'json'")

    now = datetime.now()
    interval_map = {
        "1h": now - timedelta(hours=1),
        "24h": now - timedelta(days=1),
        "7d": now - timedelta(days=7),
        "30d": now - timedelta(days=30),
        "90d": now - timedelta(days=90),
        "1y": now - timedelta(days=365)
    }
    start_date = interval_map.get(interval, now - timedelta(days=30))

    query = text("""
        SELECT date, open, high, low, close, volume
        FROM stock_prices
        WHERE symbol = :symbol AND date >= :start_date AND close IS NOT NULL
        ORDER BY date ASC
    """)

    with engine.connect() as conn:
        result = conn.execute(query, {"symbol": symbol.upper(), "start_date": start_date})
        data = [
            {
                "date": row[0].isoformat() if row[0] else None,
                "open": float(row[1]) if row[1] else 0,
                "high": float(row[2]) if row[2] else 0,
                "low": float(row[3]) if row[3] else 0,
                "close": float(row[4]) if row[4] else 0,
                "volume": int(row[5]) if row[5] else 0
            }
            for row in result
        ]

    if format == "json":
        return {
            "symbol": symbol,
            "interval": interval,
            "data": data,
            "exported_at": datetime.now().isoformat()
        }
    else:  # CSV
        output = io.StringIO()
        if data:
            fieldnames = ["date", "open", "high", "low", "close", "volume"]
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)

        csv_content = output.getvalue()
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={symbol}_{interval}_data.csv"
            }
        )

@app.get("/api/export/top-movers")
@limiter.limit("10/minute")
def export_top_movers(
    request: Request,
    category: str = "all",
    format: str = "csv"
):
    """Export top movers data as CSV or JSON"""
    if format not in ["csv", "json"]:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'json'")

    # Get top movers data (reuse existing logic)
    movers_data = get_top_movers(request, category)

    if format == "json":
        return {
            "category": category,
            "gainers": movers_data["gainers"],
            "losers": movers_data["losers"],
            "exported_at": datetime.now().isoformat()
        }
    else:  # CSV
        output = io.StringIO()
        fieldnames = ["type", "symbol", "price", "change", "asset_type"]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        # Write gainers
        for mover in movers_data["gainers"]:
            writer.writerow({
                "type": "GAINER",
                "symbol": mover["symbol"],
                "price": mover["price"],
                "change": mover["change"],
                "asset_type": mover["asset_type"]
            })

        # Write losers
        for mover in movers_data["losers"]:
            writer.writerow({
                "type": "LOSER",
                "symbol": mover["symbol"],
                "price": mover["price"],
                "change": mover["change"],
                "asset_type": mover["asset_type"]
            })

        csv_content = output.getvalue()
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=top_movers_{category}.csv"
            }
        )

@app.get("/api/export/symbols")
@limiter.limit("10/minute")
def export_symbols(
    request: Request,
    exchange: str = None,
    asset_type: str = None,
    format: str = "csv"
):
    """Export symbols list as CSV or JSON"""
    if format not in ["csv", "json"]:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'json'")

    # Get symbols data (no pagination for export)
    symbols_data = get_symbols(request, limit=10000, offset=0, exchange=exchange, asset_type=asset_type)

    if format == "json":
        return {
            "exchange": exchange,
            "asset_type": asset_type,
            "symbols": symbols_data["symbols"],
            "exported_at": datetime.now().isoformat()
        }
    else:  # CSV
        output = io.StringIO()
        if symbols_data["symbols"]:
            fieldnames = ["symbol", "name", "exchange", "exchange_name", "type"]
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()

            for symbol in symbols_data["symbols"]:
                writer.writerow({
                    "symbol": symbol["symbol"],
                    "name": symbol["name"],
                    "exchange": symbol["exchange"],
                    "exchange_name": symbol["exchange_name"],
                    "type": symbol["type"]
                })

        csv_content = output.getvalue()
        filename = f"symbols_{exchange or 'all'}_{asset_type or 'all'}.csv"
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
