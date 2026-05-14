# Brokerly — Financial Dashboard

A full-stack fintech dashboard with live market data, interactive charts, portfolio tracking, and a dark neon theme.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Charts | TradingView Lightweight Charts (candlestick) + Recharts (pie) |
| Backend | Express + Node.js (TypeScript via tsx) |
| Data | Yahoo Finance (via `yahoo-finance2` — no API key needed) |

---

## Setup

### 1. Install dependencies

```bash
npm install                         # root (concurrently)
npm install --prefix backend        # backend deps
npm install --prefix frontend       # frontend deps
```

Or use the convenience script:
```bash
npm run install:all
```

### 2. Configure environment (optional)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env if you want to change the port (default: 3001)
```

### 3. Run

```bash
npm run dev
```

This starts:
- **Backend** at `http://localhost:3001` (Express proxy for Yahoo Finance)
- **Frontend** at `http://localhost:5173` (Vite dev server)

---

## Features

### Dashboard
- Live indices: S&P 500, NASDAQ, Dow Jones, Bitcoin
- % change badges (green/red)
- Stats table with volume data
- Auto-refreshes every 30 seconds

### Charts
- Symbol search (stocks, crypto, ETFs)
- Candlestick and line chart modes
- Timeframe selector: 1D / 1W / 1M / 1Y
- Powered by TradingView Lightweight Charts

### Portfolio
- Add positions (ticker, shares, avg cost)
- Live P&L calculation
- Allocation pie chart (Recharts)
- Total value & return summary
- Positions saved in localStorage

### Watchlist
- Add/remove symbols
- Live price table: price, change, %, volume, day range
- Market cap cards
- 30s polling, persisted in localStorage
- Defaults: AAPL, MSFT, GOOGL, BTC-USD, ETH-USD

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quote/:symbol` | Current quote |
| GET | `/api/history/:symbol?timeframe=1M` | OHLCV history |
| GET | `/api/market-overview` | Indices batch |
| GET | `/api/search?q=apple` | Symbol search |
| POST | `/api/multi-quote` | Batch quotes `{ symbols: [] }` |

Timeframes: `1D` (5m), `1W` (1h), `1M` (1d), `1Y` (1d)

---

## Notes

- **No API key required** — data comes from Yahoo Finance via `yahoo-finance2`
- Market data is delayed ~15 minutes for free Yahoo Finance feeds
- The backend runs as a CORS proxy to avoid browser restrictions
- All user data (portfolio, watchlist) is stored in browser localStorage
