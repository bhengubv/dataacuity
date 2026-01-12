# Market Dashboard - Financial Data Platform

A comprehensive, production-ready financial markets data platform with real-time analytics, mobile-responsive design, and secure API access.

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.11-brightgreen)
![FastAPI](https://img.shields.io/badge/FastAPI-latest-teal)

## Features

### 📊 Dashboard
- **Multi-Asset Support**: Stocks, ETFs, Cryptocurrencies, Commodities/Futures
- **Real-Time Data**: Live price updates with automatic refresh
- **Interactive Charts**: Multiple timeframes (1H, 24H, 7D, 30D, 90D, 1Y)
- **Market Movers**: Top gainers and losers by category
- **AI Predictions**: Automated trend analysis and forecasting
- **Multi-Language**: Support for 15+ languages
- **Mobile Responsive**: Tabbed interface optimized for all devices

### 🔒 Security
- **API Key Authentication**: Optional authentication for production
- **Rate Limiting**: Prevent abuse with configurable limits
- **CORS Protection**: Whitelist-based origin control
- **SQL Injection Prevention**: Parameterized queries throughout
- **Input Validation**: Pydantic models for all inputs
- **Environment Variables**: Secure credential management

### 📤 Data Export
- **CSV Export**: Download historical data, top movers, symbols
- **JSON Export**: API-friendly data format
- **Custom Intervals**: Export any timeframe
- **Filtered Exports**: By exchange, asset type, category

### 🌐 Multi-Exchange Support
- **Global Coverage**: NYSE, NASDAQ, LSE, JSE, TSE, and more
- **Crypto Exchanges**: Binance, Coinbase, Kraken, etc.
- **Easy Switching**: Horizontal scroll bar with all exchanges

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git
- 2GB+ RAM available

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd markets
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set your values:
   ```bash
   # Database
   DB_NAME=openbb_data
   DB_USER=openbb
   DB_PASSWORD=your_secure_password_here

   # CORS (comma-separated origins)
   ALLOWED_ORIGINS=http://localhost:5010,http://localhost:3000

   # Optional: API Authentication
   API_KEY_ENABLED=false
   API_KEYS=your-generated-key-1,your-generated-key-2
   ```

3. **Generate secure API keys (optional)**
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

4. **Start the services**
   ```bash
   docker-compose up -d
   ```

5. **Access the dashboard**
   - Dashboard: http://localhost:5010
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Architecture

```
markets/
├── api/                    # FastAPI backend
│   ├── main.py            # API endpoints
│   ├── requirements.txt   # Python dependencies
│   └── Dockerfile         # API container
├── dashboard/             # Frontend
│   ├── index.html         # Main UI
│   ├── app.js             # Dashboard logic
│   └── Dockerfile.dashboard
├── docker-compose.yml     # Service orchestration
└── .env.example           # Configuration template
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| `markets_dashboard` | 5010 | Nginx-served frontend |
| `market-api` | 8000 | FastAPI backend |
| `markets_db` | 5432 | PostgreSQL database |
| `openbb-backend` | 8080 | OpenBB Platform integration |

## API Documentation

### Authentication (Optional)

When `API_KEY_ENABLED=true`, include API key in header:
```bash
curl -H "X-API-Key: your-api-key" http://localhost:8000/api/stats
```

### Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Health checks | 60/minute |
| Market data | 60/minute |
| Predictions | 30/minute |
| Latest prices | 30/minute |
| Export | 10/minute |

### Core Endpoints

#### Get Market Statistics
```bash
GET /api/stats
```

Response:
```json
{
  "total_symbols": 1250,
  "total_records": 450000,
  "last_update": "2025-01-21T10:30:00",
  "breakdown": [...]
}
```

#### Get Historical Data
```bash
GET /api/historical/{symbol}?interval=30d
```

Intervals: `1h`, `24h`, `7d`, `30d`, `90d`, `1y`

#### Get Top Movers
```bash
GET /api/top-movers?category=stocks
```

Categories: `stocks`, `crypto`, `metals`, `indices`, `all`

#### Export Data (CSV/JSON)
```bash
# Export historical data as CSV
GET /api/export/historical/AAPL?interval=30d&format=csv

# Export top movers as JSON
GET /api/export/top-movers?category=stocks&format=json

# Export symbols list
GET /api/export/symbols?exchange=NYSE&format=csv
```

### Full API Documentation

Visit `http://localhost:8000/docs` for interactive Swagger documentation.

## Mobile Features

### Tabbed Interface
- **Chart Tab**: Interactive price charts with interval selector
- **Stats Tab**: Market statistics and AI predictions
- **Movers Tab**: Top gainers and losers

### Touch Gestures
- **Swipe Left/Right**: Navigate between tabs
- **Tap**: Select exchanges, symbols, intervals
- **Horizontal Scroll**: Browse all exchanges

### Responsive Design
- **Breakpoints**: 1024px (tablet), 768px (mobile), 480px (small)
- **Touch Targets**: Minimum 44px (WCAG AAA)
- **Viewport Optimized**: No scrolling required

## Configuration

### Database

```yaml
# docker-compose.yml
environment:
  - POSTGRES_DB=${DB_NAME:-openbb_data}
  - POSTGRES_USER=${DB_USER:-openbb}
  - POSTGRES_PASSWORD=${DB_PASSWORD:-openbb_pass}
```

### CORS

```bash
# .env
ALLOWED_ORIGINS=http://localhost:5010,https://yourdomain.com
```

### API Security

```bash
# Enable authentication
API_KEY_ENABLED=true

# Add multiple API keys (comma-separated)
API_KEYS=key1,key2,key3
```

## Development

### Running Locally (without Docker)

1. **Start PostgreSQL**
   ```bash
   docker run -p 5432:5432 -e POSTGRES_PASSWORD=openbb_pass postgres:15
   ```

2. **Run API**
   ```bash
   cd api
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

3. **Serve Dashboard**
   ```bash
   cd dashboard
   python -m http.server 5010
   ```

### Adding Dependencies

**API (Python)**
```bash
cd api
pip install package-name
pip freeze > requirements.txt
```

**Dashboard (JavaScript)**
```html
<!-- Add to index.html -->
<script src="https://cdn.jsdelivr.net/npm/package@version"></script>
```

## Deployment

### Production Checklist

- [ ] Set strong database password in `.env`
- [ ] Enable API authentication (`API_KEY_ENABLED=true`)
- [ ] Generate secure API keys
- [ ] Configure production CORS origins
- [ ] Set up HTTPS/SSL certificates
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Enable logging and monitoring
- [ ] Test mobile responsiveness
- [ ] Verify all exports work

### Docker Deployment

```bash
# Production build
docker-compose -f docker-compose.yml up -d

# View logs
docker-compose logs -f

# Update services
docker-compose pull
docker-compose up -d
```

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Troubleshooting

### Database Connection Issues
```bash
# Check if database is running
docker-compose ps markets_db

# View database logs
docker-compose logs markets_db

# Restart database
docker-compose restart markets_db
```

### API Not Responding
```bash
# Check API logs
docker-compose logs market-api

# Verify environment variables
docker-compose exec market-api env | grep DATABASE_URL

# Restart API
docker-compose restart market-api
```

### Dashboard Not Loading
```bash
# Check dashboard logs
docker-compose logs markets_dashboard

# Verify nginx configuration
docker-compose exec markets_dashboard nginx -t

# Restart dashboard
docker-compose restart markets_dashboard
```

### Rate Limit Exceeded
```bash
# Temporarily disable rate limiting (development only)
# Remove @limiter.limit() decorators from api/main.py
```

## Performance Optimization

### Caching
- LRU cache on market stats (`@lru_cache`)
- Client-side caching with 60s refresh interval
- Chart data cached per symbol/interval

### Database Indexes
```sql
-- Add indexes for better performance
CREATE INDEX idx_symbol_date ON stock_prices(symbol, date);
CREATE INDEX idx_asset_type ON stock_prices(asset_type);
CREATE INDEX idx_exchange_active ON symbols(exchange_id, is_active);
```

### Image Optimization
- Replaced base64 images with file references
- Reduced from 404KB to 18KB (95% reduction)

## Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Rotate API keys regularly** - Generate new keys monthly
3. **Use HTTPS in production** - Set up SSL certificates
4. **Monitor rate limits** - Check logs for abuse patterns
5. **Keep dependencies updated** - Regular security patches
6. **Backup database regularly** - Automated daily backups
7. **Restrict database access** - Firewall rules for port 5432
8. **Validate all inputs** - Pydantic models on all endpoints

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: https://github.com/yourusername/markets/issues
- **Documentation**: http://localhost:8000/docs
- **Email**: support@yourdomain.com

## Changelog

### Version 2.0 (2025-01-21)
- ✅ Added API key authentication
- ✅ Implemented rate limiting on all endpoints
- ✅ SQL injection prevention with parameterized queries
- ✅ Mobile-responsive tabbed interface
- ✅ Multiple chart intervals (1H-1Y)
- ✅ CSV/JSON export functionality
- ✅ Input validation with Pydantic
- ✅ CORS security improvements
- ✅ Environment variable configuration
- ✅ Image optimization (95% size reduction)

### Version 1.0
- Initial release with basic functionality

## Acknowledgments

- [OpenBB Platform](https://openbb.co/) - Financial data integration
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Chart.js](https://www.chartjs.org/) - Interactive charting library
- [PostgreSQL](https://www.postgresql.org/) - Robust database system
