# ⚡ FifteenX – 15-Minute Prediction Markets (Powered by Polymarket)

**FifteenX** is a fast, lightweight **15-minute prediction market experience** built on top of Polymarket data. It delivers an intense, game-style environment where users predict short-term market movements (e.g., BTC up/down in 15 minutes), paper-trade, and compete on leaderboards.

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

| Phase | Status | Description |
|------|--------|-------------|
| Phase 1 | 🚀 In Progress | Polymarket integration + UI |
| Phase 2 | ⏳ Planned | Paper trading + DB |
| Phase 3 | ⏳ Planned | Leaderboards + identity |
| Phase 4 | ⏳ Planned | Mobile + gamification |
| Phase 5 | ❓ TBD | Possible compliant real trading |

Build → iterate → refine → scale.

---

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
