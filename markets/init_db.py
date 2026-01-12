import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://openbb:openbb_pass@markets_db:5432/openbb_data")

engine = create_engine(DATABASE_URL)
Base = declarative_base()

# Stock Price Data
class StockPrice(Base):
    __tablename__ = 'stock_prices'
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(10), index=True)
    date = Column(DateTime, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

# Company Fundamentals
class CompanyFundamentals(Base):
    __tablename__ = 'company_fundamentals'
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(10), unique=True, index=True)
    company_name = Column(String(255))
    sector = Column(String(100))
    industry = Column(String(100))
    market_cap = Column(Float)
    pe_ratio = Column(Float)
    dividend_yield = Column(Float)
    updated_at = Column(DateTime, default=datetime.utcnow)

# Economic Indicators
class EconomicIndicator(Base):
    __tablename__ = 'economic_indicators'
    
    id = Column(Integer, primary_key=True)
    indicator_name = Column(String(100), index=True)
    date = Column(DateTime, index=True)
    value = Column(Float)
    unit = Column(String(50))
    source = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

# News Articles
class NewsArticle(Base):
    __tablename__ = 'news_articles'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(500))
    content = Column(Text)
    source = Column(String(100))
    url = Column(String(500))
    published_date = Column(DateTime, index=True)
    symbols = Column(String(200))  # Comma-separated symbols
    sentiment = Column(Float)  # -1 to 1
    created_at = Column(DateTime, default=datetime.utcnow)

# API Request Cache
class APICache(Base):
    __tablename__ = 'api_cache'
    
    id = Column(Integer, primary_key=True)
    endpoint = Column(String(200), index=True)
    params = Column(Text)
    response = Column(Text)
    cached_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime)

# Crypto Prices
class CryptoPrice(Base):
    __tablename__ = 'crypto_prices'
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), index=True)
    date = Column(DateTime, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    market_cap = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create all tables
try:
    Base.metadata.create_all(engine)
    print("✅ Database tables created successfully!")
except Exception as e:
    print(f"❌ Error creating database tables: {e}")
