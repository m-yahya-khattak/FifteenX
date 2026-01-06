# ⚡ FifteenX – 15-Minute Prediction Markets (Powered by Polymarket)

**FifteenX** (Might need to change name) is a fast, lightweight **15-minute prediction market experience** built on top of Polymarket data. It delivers an intense, game-style environment where users predict short-term market movements (e.g., BTC up/down in 15 minutes), paper-trade, and compete on leaderboards.

This project focuses on:

✔️ Addictive but simple UX  
✔️ Real market data via Polymarket APIs  
✔️ Paper-trading first (no custody / safer experimentation)  
✔️ Web-first today, mobile-ready tomorrow  
✔️ Fully open-source and open for contribution  

---

## 🎯 Vision

Short-interval prediction markets are fun, intense, and highly engaging.

**FifteenX exists to:**
- Create the best **15-minute prediction experience**
- Stream real-time Polymarket market data & prices
- Enable **paper trades** so users can play safely
- Track performance via **leaderboards & stats**
- Grow into:
  - Multiple assets (BTC, ETH, more)
  - Compliance-ready real trading (if ever pursued)
  - Native mobile apps

Right now: **ship a clean MVP fast**.

---

## 🧩 MVP Scope

### ✅ Phase 1 — Market Viewer
- Fetch live Polymarket markets
- Filter short-interval (e.g., BTC 15m)
- Display:
  - Question / Market title  
  - End / resolution time  
  - Yes / No (Up / Down) price odds  

---

### ✅ Phase 2 — Paper Trading Mode
- Demo balance for every user
- Place simulated bets:
  - YES / NO selections
  - Custom stake
- Persist trades
- Auto-settle based on Polymarket outcomes
- Show:
  - Wins / losses  
  - PnL  

---

### 🚧 Phase 3 — Gamification
- Global leaderboard
- Win streak tracking
- Badges / achievements
- Weekly competitions

---

### 🚀 Future (Not MVP)
- React Native mobile app
- Wallet connect + real trading (only if compliant)
- Rewards system
- Referrals
- Notifications (“New round starting!”)
- More market categories

---

## 🏗️ Tech Stack

### Frontend
- Next.js
- React
- (Optional) TailwindCSS

### Backend
- Next.js API routes
- TypeScript
- Polymarket APIs

### Database (Phase 2+)
- Prisma + PostgreSQL / SQLite  
or  
- Supabase

### Mobile (Future)
- React Native / Expo

---

## 🧱 Architecture Overview

```

Client (Next.js UI)
↓
Backend API (Next.js routes)
↓
Polymarket APIs
↓
Database (Users • Paper Trades • Leaderboard)

```

Clean separation ensures future web + mobile reuse.

---

## ▶️ Getting Started

### 1️⃣ Clone Repo
```

git clone [https://github.com/YOUR_REPO/fifteenx.git](https://github.com/YOUR_REPO/fifteenx.git)
cd fifteenx

```

### 2️⃣ Install Dependencies
```

npm install

```

### 3️⃣ Run Dev Server
```

npm run dev

```

### 4️⃣ Open
```

[http://localhost:3000](http://localhost:3000)

```

---

## 📌 Roadmap

**Project Start Date:** January 1, 2026  
**Target Completion:** February 1, 2026

### Current Phase: MVP Development (Phase 2)

| Phase | Status | Timeline | Description |
|------|--------|----------|-------------|
| **Phase 1** | ✅ **Complete** | Jan 1-5, 2026 | Polymarket integration + Market Viewer UI |
| **Phase 2** | 🚀 **In Progress** | Jan 5-15, 2026 | Virtual Trading System + Real-time Data |
| **Phase 3** | ⏳ **Planned** | Jan 15-20, 2026 | Market Resolution + Win/Lose Logic |
| **Phase 4** | ⏳ **Planned** | Jan 20-25, 2026 | Gamification + Leaderboards |
| **Phase 5** | ⏳ **Planned** | Jan 25-30, 2026 | Mobile App (React Native) |
| **Phase 6** | ⏳ **Planned** | Jan 30 - Feb 1, 2026 | Real Trading (if compliant) |

### Detailed Roadmap

#### ✅ Phase 1: Market Viewer (Complete)
- [x] Polymarket API integration
- [x] Market data fetching
- [x] 15-minute market filtering
- [x] Market header with countdown
- [x] Reference price display

#### 🚀 Phase 2: Virtual Trading System (In Progress)
- [x] Real-time price chart with animation
- [x] RTDS WebSocket integration (Chainlink)
- [x] Binance price integration
- [x] Price source switcher (Chainlink/Binance)
- [x] Live orderbook via CLOB WebSocket
- [x] Virtual trading system (buy/sell)
- [x] Portfolio display
- [x] Trade history
- [x] Auto-refresh on market end
- [ ] Market resolution logic
- [ ] Automatic position settlement
- [ ] Win/lose feedback & animations

#### ⏳ Phase 3: Market Resolution (Planned)
- [ ] Market end detection
- [ ] Final price vs "price to beat" comparison
- [ ] Automatic position settlement
- [ ] P&L calculation on market close
- [ ] Win/lose determination
- [ ] Settlement notifications

#### ⏳ Phase 4: Gamification (Planned)
- [ ] Win/lose animations & feedback
- [ ] Global leaderboard
- [ ] Win streak tracking
- [ ] Badges & achievements
- [ ] Statistics dashboard (win rate, total P&L)
- [ ] Weekly competitions

#### ⏳ Phase 5: Mobile App (Planned)
- [ ] React Native setup
- [ ] Mobile-optimized UI
- [ ] Push notifications
- [ ] Mobile-specific features

#### ⏳ Phase 6: Real Trading (Jan 30 - Feb 1, 2026)
- [ ] Legal & compliance review
- [ ] Wallet integration
- [ ] Real trading APIs
- [ ] KYC/AML if required

---

## ✅ Feature Checklist

### Core Features

#### Market Data & Display
- [x] **Market fetching** - Fetch active 15-minute BTC markets from Polymarket
- [x] **Market header** - Display market title, time range, countdown
- [x] **Reference price** - Show "price to beat" with fallback mechanism
- [x] **Auto-refresh** - Automatically fetch new market when current one ends
- [x] **Price source switcher** - Toggle between Chainlink and Binance prices

#### Real-time Price Feed
- [x] **RTDS WebSocket** - Connect to Polymarket RTDS for real-time prices
- [x] **Chainlink prices** - Subscribe to `crypto_prices_chainlink` topic
- [x] **Binance prices** - Subscribe to `crypto_prices` topic (via RTDS)
- [x] **Price chart** - Real-time animated price chart
- [x] **Smooth animation** - Continuous price interpolation animation
- [x] **Historical prices** - Fetch and display price history

#### Live Orderbook
- [x] **CLOB WebSocket** - Connect to Polymarket CLOB WebSocket
- [x] **Live bids/asks** - Display real-time orderbook data
- [x] **Spread calculation** - Show bid-ask spread
- [x] **Last trade price** - Display last executed trade
- [x] **Tab switching** - Separate orderbooks for "Trade Up" and "Trade Down"
- [x] **Auto-reconnect** - Handle WebSocket reconnections

#### Virtual Trading
- [x] **Virtual balance** - Starting balance ($10,000) stored in localStorage
- [x] **Buy orders** - Execute buy orders at best ask price
- [x] **Sell orders** - Execute sell orders at best bid price
- [x] **Position tracking** - Track open positions per market/side
- [x] **Trade history** - Log all completed trades
- [x] **Portfolio display** - Show balance, positions, and P&L
- [x] **P&L calculation** - Calculate unrealized P&L for open positions
- [ ] **Market resolution** - Auto-settle positions when market ends
- [ ] **Win/lose logic** - Determine win/loss based on market outcome

#### UI/UX
- [x] **Responsive design** - Works on desktop
- [x] **Loading states** - Show loading indicators
- [x] **Error handling** - Display error messages
- [x] **Trade feedback** - Success/error messages for trades
- [ ] **Win/lose animations** - Celebration animations for wins
- [ ] **Sound effects** - Optional audio feedback
- [ ] **Dark mode** - Theme switcher

### Gamification Features

#### Statistics & Tracking
- [ ] **Win rate** - Calculate and display win percentage
- [ ] **Total wins/losses** - Track overall performance
- [ ] **Best trade** - Show highest profit trade
- [ ] **Worst trade** - Show largest loss trade
- [ ] **Average P&L** - Calculate average profit/loss per trade
- [ ] **Trading volume** - Track total trading volume

#### Achievements & Badges
- [ ] **First win badge** - Award on first successful trade
- [ ] **Win streak badge** - Award for consecutive wins
- [ ] **High roller badge** - Award for large trades
- [ ] **Perfect week badge** - Award for 100% win rate in a week
- [ ] **Badge system** - Display earned badges

#### Leaderboards
- [ ] **Global leaderboard** - Top traders by P&L
- [ ] **Weekly leaderboard** - Weekly top performers
- [ ] **Win streak leaderboard** - Longest win streaks
- [ ] **Leaderboard API** - Backend for leaderboard data

### Technical Features

#### Performance
- [x] **WebSocket optimization** - Efficient WebSocket connections
- [x] **Throttling** - Throttle price updates for performance
- [x] **Animation optimization** - Smooth 60fps animations
- [ ] **Code splitting** - Lazy load components
- [ ] **Caching** - Cache market data

#### Error Handling
- [x] **WebSocket reconnection** - Auto-reconnect on disconnect
- [x] **API fallbacks** - Fallback mechanisms for API failures
- [x] **Error boundaries** - React error boundaries
- [ ] **Retry logic** - Exponential backoff for failed requests
- [ ] **Error logging** - Track errors for debugging

#### Data Persistence
- [x] **localStorage** - Store trading data in browser
- [ ] **Database integration** - Optional backend database
- [ ] **Data export** - Export trade history
- [ ] **Data import** - Import previous trading data

---

## 🐛 Bug Tracker

### 🔴 Critical Bugs
*No critical bugs currently tracked*

### 🟡 High Priority Bugs
*No high priority bugs currently tracked*

### 🟢 Medium Priority Bugs
- [ ] **Price to beat not consistently fetched** - Polymarket API (`/api/crypto/crypto-price`) fails frequently, causing inconsistent "price to beat" display. Currently has fallback mechanism but needs improvement for better reliability.

### 🔵 Low Priority / Enhancements
*No low priority bugs currently tracked*

### ✅ Resolved Bugs
- [x] **Binance WebSocket CORS error** - Resolved by using RTDS proxy
- [x] **Orderbook infinite re-render loop** - Fixed with `useCallback` and proper dependencies
- [x] **Orderbook not updating on tab switch** - Fixed by clearing state on asset ID change
- [x] **Orderbook not updating on new market** - Fixed with auto-refresh logic
- [x] **Price chart animation stuttering** - Improved with continuous animation loop
- [x] **Reference price fetch failures** - Added hybrid retry mechanism with fallback

### 📝 Known Issues
- Price chart animation may feel slightly delayed on very fast price movements
- Orderbook may take 1-2 seconds to update when switching tabs
- Market data refresh may occasionally miss the exact market end time
- **Price to beat API reliability** - Polymarket's `/api/crypto/crypto-price` endpoint frequently fails, causing "price to beat" to not display consistently. Fallback mechanism exists but needs improvement.

---

## 📊 Progress Tracker

> **⚠️ CURRENT FOCUS:** Perfecting Orderbook & Virtual Buy/Sell Trades  
> **Next Session:** Continue from TODO section below → Optimize orderbook price updates and enhance virtual trading execution logic

### Overall Progress: **~70% Complete**

#### Phase 1: Market Viewer ✅ **100%**
- Market fetching: ✅ 100%
- Market display: ✅ 100%
- Reference price: ✅ 100%

#### Phase 2: Virtual Trading System 🚀 **80%**
- Real-time price feed: ✅ 100%
- Live orderbook: 🚧 90% (Needs optimization - price stability, flickering)
- Virtual trading core: 🚧 85% (Needs perfection - edge cases, validation)
- Market resolution: ❌ 0%
- Win/lose logic: ❌ 0%

#### Phase 3: Market Resolution ⏳ **0%**
- Market end detection: ❌ 0%
- Position settlement: ❌ 0%
- Win/lose determination: ❌ 0%

#### Phase 4: Gamification ⏳ **0%**
- Leaderboards: ❌ 0%
- Achievements: ❌ 0%
- Statistics: ❌ 0%

### Component Status

| Component | Status | Progress |
|-----------|--------|----------|
| **PriceChart** | ✅ Complete | 100% |
| **MarketHeader** | ✅ Complete | 100% |
| **OrderBook** | 🚧 Needs Work | 90% (Price stability, UX improvements needed) |
| **Portfolio** | ✅ Complete | 100% |
| **TradeHistory** | ✅ Complete | 100% |
| **TradingPanel** | ✅ Complete | 100% |
| **Market Resolution** | ❌ Not Started | 0% |
| **Win/Lose Feedback** | ❌ Not Started | 0% |
| **Leaderboard** | ❌ Not Started | 0% |

### Hook Status

| Hook | Status | Progress |
|------|--------|----------|
| **useRTDS** | ✅ Complete | 100% |
| **useCLOBOrderBook** | ✅ Complete | 100% |
| **useVirtualTrading** | 🚧 Partial | 85% (Needs edge case handling, validation) |
| **useBinancePrice** | ✅ Complete | 100% |

### API Status

| API Route | Status | Progress |
|-----------|--------|----------|
| **/api/markets** | ✅ Complete | 100% |

### 🎯 Current TODO (Continue From Here)

**Status:** In Progress  
**Last Updated:** January 2026

#### Priority Tasks

1. **Perfect Orderbook & Virtual Buy/Sell Trades** (Priority: High) ⚠️ **START HERE TOMORROW**
   - [ ] Optimize orderbook price updates (reduce flickering)
   - [ ] Improve price stability using midpoint or throttling
   - [ ] Enhance virtual trading execution logic
   - [ ] Add order confirmation/confirmation dialog
   - [ ] Improve trade feedback and animations
   - [ ] Test edge cases (rapid price changes, insufficient balance, etc.)
   - [ ] Verify best_ask/best_bid usage from WebSocket
   - [ ] Add price validation before trade execution
   - [ ] Improve error handling for failed trades

2. **Market Resolution Logic** (Priority: High)
   - Detect when market ends
   - Compare final price vs reference price
   - Auto-settle positions
   - Calculate final P&L

3. **Win/Lose Feedback** (Priority: High)
   - Visual animations for wins/losses
   - Notification system
   - Summary screen

4. **Statistics Dashboard** (Priority: Medium)
   - Win rate calculation
   - Total P&L tracking
   - Trade statistics

5. **Leaderboard** (Priority: Medium)
   - Global leaderboard
   - Weekly competitions
   - User rankings

### Next Milestones

1. **Market Resolution Logic** (Priority: High)
   - Detect when market ends
   - Compare final price vs reference price
   - Auto-settle positions
   - Calculate final P&L

2. **Win/Lose Feedback** (Priority: High)
   - Visual animations for wins/losses
   - Notification system
   - Summary screen

3. **Statistics Dashboard** (Priority: Medium)
   - Win rate calculation
   - Total P&L tracking
   - Trade statistics

4. **Leaderboard** (Priority: Medium)
   - Global leaderboard
   - Weekly competitions
   - User rankings

---

Build → iterate → refine → scale.

## 🤝 Contributions Welcome

FifteenX is **open-source and open for contribution**.

### Contribution Guidelines
1️⃣ Fork the repo  
2️⃣ Create a feature branch  
3️⃣ Write clean, readable code  
4️⃣ Use meaningful commit messages  
5️⃣ Open a PR with clear description  

### Ideal Contributors
- Web3 / Crypto Devs  
- React / Next.js engineers  
- Backend engineers  
- Product builders  
- Gamification enthusiasts  

---

## ⚠️ Disclaimer
FifteenX currently supports **paper trading only** and does **not** enable real-money trading or gambling. All data is sourced from publicly available Polymarket APIs. Any future monetization or on-chain interaction will only occur following legal + regulatory evaluation.

---

## 👤 Maintainer
**Project Lead:** Yahya  
Open to collaborators, builders, & contributors.

---

## 🌟 Name Meaning
**FifteenX** =  
15-minute round intensity × trading excitement × exponential thrill.

Let’s build something addictive.