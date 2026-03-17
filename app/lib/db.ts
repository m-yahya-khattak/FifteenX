import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Database file path
const dbPath = path.join(process.cwd(), "data", "backtests.db");

// Ensure data directory exists
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      initial_capital REAL NOT NULL,
      final_balance REAL NOT NULL,
      total_pnl REAL NOT NULL,
      realized_pnl REAL NOT NULL,
      total_trades INTEGER NOT NULL,
      buy_trades INTEGER NOT NULL,
      sell_trades INTEGER NOT NULL,
      spread_captured REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      max_drawdown_percent REAL NOT NULL,
      sharpe_ratio REAL,
      win_rate REAL,
      risk_of_loss REAL NOT NULL,
      config_spread_bps INTEGER NOT NULL,
      config_order_size REAL NOT NULL,
      config_max_position REAL NOT NULL,
      config_rebalance_interval INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS backtest_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id INTEGER NOT NULL,
      trade_id TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      size REAL NOT NULL,
      pnl REAL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backtest_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      balance REAL NOT NULL,
      inventory REAL NOT NULL,
      unrealized_pnl REAL NOT NULL,
      realized_pnl REAL NOT NULL,
      total_pnl REAL NOT NULL,
      FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS virtual_trading (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      balance REAL NOT NULL DEFAULT 10000,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id)
    );

    CREATE TABLE IF NOT EXISTS virtual_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      position_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_title TEXT NOT NULL,
      side TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity REAL NOT NULL,
      entry_value REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      end_time TEXT,
      UNIQUE(user_id, position_id)
    );

    CREATE TABLE IF NOT EXISTS virtual_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      trade_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_title TEXT NOT NULL,
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      quantity REAL NOT NULL,
      value REAL NOT NULL,
      pnl REAL,
      timestamp INTEGER NOT NULL,
      UNIQUE(user_id, trade_id)
    );

    CREATE INDEX IF NOT EXISTS idx_backtests_timestamp ON backtests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
    CREATE INDEX IF NOT EXISTS idx_backtest_snapshots_backtest_id ON backtest_snapshots(backtest_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_positions_user_id ON virtual_positions(user_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_trades_user_id ON virtual_trades(user_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_trades_timestamp ON virtual_trades(timestamp);

    CREATE TABLE IF NOT EXISTS historical_orderbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      window_start INTEGER NOT NULL,
      asset_id TEXT NOT NULL,
      market TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      message_data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_historical_orderbook_window ON historical_orderbook(window_start, asset_id);
    CREATE INDEX IF NOT EXISTS idx_historical_orderbook_timestamp ON historical_orderbook(timestamp);
    CREATE INDEX IF NOT EXISTS idx_historical_orderbook_asset ON historical_orderbook(asset_id, timestamp);

    -- Live Market Maker Performance (per market/side)
    CREATE TABLE IF NOT EXISTS live_mm_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      balance REAL NOT NULL,
      inventory REAL NOT NULL,
      realized_pnl REAL NOT NULL,
      unrealized_pnl REAL NOT NULL,
      total_pnl REAL NOT NULL,
      total_trades INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(market_symbol, side, market_id)
    );

    -- Live Market Maker Orders
    CREATE TABLE IF NOT EXISTS live_mm_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      market_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      order_side TEXT NOT NULL,
      price REAL NOT NULL,
      size REAL NOT NULL,
      filled_size REAL DEFAULT 0,
      is_filled INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Live Market Maker Trades
    CREATE TABLE IF NOT EXISTS live_mm_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL,
      market_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      trade_side TEXT NOT NULL,
      price REAL NOT NULL,
      size REAL NOT NULL,
      pnl REAL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Market Maker Config (user settings per market/side)
    CREATE TABLE IF NOT EXISTS mm_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      spread_bps INTEGER NOT NULL,
      order_size REAL NOT NULL,
      max_position REAL NOT NULL,
      initial_capital REAL NOT NULL DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(market_symbol, side)
    );

    -- Market Settlements
    CREATE TABLE IF NOT EXISTS market_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT NOT NULL UNIQUE,
      symbol TEXT NOT NULL,
      outcome TEXT,
      final_price REAL,
      settlement_pnl REAL,
      settled_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_live_mm_performance_symbol ON live_mm_performance(market_symbol, side);
    CREATE INDEX IF NOT EXISTS idx_live_mm_orders_symbol ON live_mm_orders(market_symbol, side, market_id);
    CREATE INDEX IF NOT EXISTS idx_live_mm_trades_symbol ON live_mm_trades(market_symbol, side, market_id);
    CREATE INDEX IF NOT EXISTS idx_live_mm_trades_timestamp ON live_mm_trades(timestamp);
    CREATE INDEX IF NOT EXISTS idx_mm_config_symbol ON mm_config(market_symbol, side);
  `);

  // Add initial_capital column if it doesn't exist (for existing databases)
  // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
  // This must run AFTER the table creation above
  try {
    const tableInfo = db.prepare("PRAGMA table_info(mm_config)").all();
    const hasInitialCapital = tableInfo.some((col: any) => col.name === 'initial_capital');
    if (!hasInitialCapital) {
      db.exec("ALTER TABLE mm_config ADD COLUMN initial_capital REAL NOT NULL DEFAULT 100");
      console.log("[DB] Added initial_capital column to mm_config table");
    }
  } catch (error) {
    // Column might already exist or table might not exist yet, ignore
    console.log("[DB] initial_capital column migration check:", error);
  }

  return db;
}

// Close database connection
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

