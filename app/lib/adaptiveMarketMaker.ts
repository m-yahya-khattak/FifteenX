/**
 * Adaptive Market Maker Controller
 * 
 * Implements risk-aware market-making with:
 * - Volatility-based spread adjustment (sigma from EWMA returns)
 * - Order-flow toxicity detection (from L2 book deltas)
 * - Inventory-based skew and one-sided quoting
 * - Adaptive size reduction/pause under high toxicity
 * 
 * Integration points:
 * - Reuses: useCLOBOrderBook for L2 data, performance.inventory for positions
 * - Replaces: Fixed spread logic in rebalanceOrders() in useMarketMaker.ts
 */

// ============================================================================
// 1. VOLATILITY ESTIMATOR (Sigma from EWMA of log returns)
// ============================================================================

export interface VolatilityConfig {
  halfLifeMinutes?: number; // Half-life for EWMA (default: 10 minutes)
  minSamples?: number; // Minimum samples before returning sigma (default: 10)
  maxSamples?: number; // Maximum samples to keep (default: 1000)
}

export class VolatilityEstimator {
  private config: Required<VolatilityConfig>;
  private midPrices: Array<{ price: number; timestamp: number }> = [];
  private returns: number[] = [];
  private ewmaMean: number | null = null;
  private ewmaVariance: number | null = null;
  private alpha: number; // EWMA decay factor

  constructor(config: VolatilityConfig = {}) {
    this.config = {
      halfLifeMinutes: config.halfLifeMinutes ?? 10,
      minSamples: config.minSamples ?? 10,
      maxSamples: config.maxSamples ?? 1000,
    };
    
    // Calculate alpha from half-life
    // For EWMA: alpha = 1 - exp(-ln(2) / (halfLife * samplesPerMinute))
    // Assuming ~1 sample per second (60 per minute), adjust if needed
    const samplesPerMinute = 60;
    const halfLifeSamples = this.config.halfLifeMinutes * samplesPerMinute;
    this.alpha = 1 - Math.exp(-Math.LN2 / halfLifeSamples);
  }

  /**
   * Update with new mid price
   * @param mid - Current mid price
   * @param timestamp - Timestamp in ms
   */
  update(mid: number, timestamp: number): void {
    if (isNaN(mid) || mid <= 0) return;

    // Add to history
    this.midPrices.push({ price: mid, timestamp });
    
    // Keep only recent samples
    if (this.midPrices.length > this.config.maxSamples) {
      this.midPrices.shift();
    }

    // Calculate log return if we have previous price
    if (this.midPrices.length >= 2) {
      const prev = this.midPrices[this.midPrices.length - 2].price;
      const current = this.midPrices[this.midPrices.length - 1].price;
      
      if (prev > 0) {
        const logReturn = Math.log(current / prev);
        this.returns.push(logReturn);
        
        // Keep only recent returns
        if (this.returns.length > this.config.maxSamples) {
          this.returns.shift();
        }

        // Update EWMA of mean and variance
        if (this.ewmaMean === null) {
          this.ewmaMean = logReturn;
          this.ewmaVariance = 0;
        } else {
          // EWMA mean
          this.ewmaMean = this.alpha * logReturn + (1 - this.alpha) * this.ewmaMean;
          
          // EWMA variance (using squared deviations)
          const deviation = logReturn - this.ewmaMean;
          this.ewmaVariance = this.alpha * (deviation * deviation) + (1 - this.alpha) * (this.ewmaVariance ?? 0);
        }
      }
    }
  }

  /**
   * Get current volatility estimate (sigma)
   * Returns standard deviation of log returns
   */
  getSigma(): number {
    if (this.returns.length < this.config.minSamples) {
      return 0; // Not enough data
    }

    // Use EWMA variance if available, otherwise compute from returns
    if (this.ewmaVariance !== null && this.ewmaVariance > 0) {
      return Math.sqrt(this.ewmaVariance);
    }

    // Fallback: compute from recent returns
    if (this.returns.length === 0) return 0;
    
    const mean = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
    const variance = this.returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / this.returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Reset estimator (useful for backtests)
   */
  reset(): void {
    this.midPrices = [];
    this.returns = [];
    this.ewmaMean = null;
    this.ewmaVariance = null;
  }
}

// ============================================================================
// 2. TOXICITY ESTIMATOR (Order-flow toxicity from L2 deltas)
// ============================================================================

export interface ToxicityConfig {
  windowMinutes?: number; // Rolling window for toxicity (default: 5 minutes)
  topKLevels?: number; // Number of top levels to track (default: 3)
  minVolumeForToxicity?: number; // Minimum volume to consider (default: 1)
}

export interface OrderBookSnapshot {
  bestBid: number | null;
  bestAsk: number | null;
  bidLevels?: Array<{ price: number; size: number }>; // Top K bid levels
  askLevels?: Array<{ price: number; size: number }>; // Top K ask levels
  timestamp: number;
}

export class ToxicityEstimator {
  private config: Required<ToxicityConfig>;
  private previousBook: OrderBookSnapshot | null = null;
  private aggressiveBuyVolume: number = 0;
  private aggressiveSellVolume: number = 0;
  private totalObservedVolume: number = 0;
  private volumeHistory: Array<{ buy: number; sell: number; total: number; timestamp: number }> = [];
  private windowMs: number;

  constructor(config: ToxicityConfig = {}) {
    this.config = {
      windowMinutes: config.windowMinutes ?? 5,
      topKLevels: config.topKLevels ?? 3,
      minVolumeForToxicity: config.minVolumeForToxicity ?? 1,
    };
    this.windowMs = this.config.windowMinutes * 60 * 1000;
  }

  /**
   * Update with new orderbook snapshot
   * Detects aggressive flow by comparing bid/ask size changes
   */
  update(book: OrderBookSnapshot): void {
    if (!this.previousBook) {
      this.previousBook = book;
      return;
    }

    const now = book.timestamp;
    const prev = this.previousBook;

    // Detect aggressive BUY: ask sizes decrease (buyers lifting asks)
    if (prev.bestAsk !== null && book.bestAsk !== null) {
      // If best ask moved down, aggressive buy occurred
      if (book.bestAsk < prev.bestAsk) {
        const estimatedVol = Math.abs(prev.bestAsk - book.bestAsk) * 100; // Rough estimate
        if (estimatedVol >= this.config.minVolumeForToxicity) {
          this.aggressiveBuyVolume += estimatedVol;
          this.totalObservedVolume += estimatedVol;
        }
      }
      // If ask levels provided, check size decreases
      if (prev.askLevels && book.askLevels) {
        for (let i = 0; i < Math.min(prev.askLevels.length, book.askLevels.length, this.config.topKLevels); i++) {
          const prevSize = prev.askLevels[i]?.size ?? 0;
          const currSize = book.askLevels[i]?.size ?? 0;
          if (currSize < prevSize && prev.askLevels[i]?.price === book.askLevels[i]?.price) {
            const vol = prevSize - currSize;
            if (vol >= this.config.minVolumeForToxicity) {
              this.aggressiveBuyVolume += vol;
              this.totalObservedVolume += vol;
            }
          }
        }
      }
    }

    // Detect aggressive SELL: bid sizes decrease (sellers hitting bids)
    if (prev.bestBid !== null && book.bestBid !== null) {
      // If best bid moved up, aggressive sell occurred
      if (book.bestBid > prev.bestBid) {
        const estimatedVol = Math.abs(book.bestBid - prev.bestBid) * 100; // Rough estimate
        if (estimatedVol >= this.config.minVolumeForToxicity) {
          this.aggressiveSellVolume += estimatedVol;
          this.totalObservedVolume += estimatedVol;
        }
      }
      // If bid levels provided, check size decreases
      if (prev.bidLevels && book.bidLevels) {
        for (let i = 0; i < Math.min(prev.bidLevels.length, book.bidLevels.length, this.config.topKLevels); i++) {
          const prevSize = prev.bidLevels[i]?.size ?? 0;
          const currSize = book.bidLevels[i]?.size ?? 0;
          if (currSize < prevSize && prev.bidLevels[i]?.price === book.bidLevels[i]?.price) {
            const vol = prevSize - currSize;
            if (vol >= this.config.minVolumeForToxicity) {
              this.aggressiveSellVolume += vol;
              this.totalObservedVolume += vol;
            }
          }
        }
      }
    }

    // Store in history for rolling window
    this.volumeHistory.push({
      buy: this.aggressiveBuyVolume,
      sell: this.aggressiveSellVolume,
      total: this.totalObservedVolume,
      timestamp: now,
    });

    // Remove old entries outside window
    const cutoff = now - this.windowMs;
    this.volumeHistory = this.volumeHistory.filter((v) => v.timestamp >= cutoff);

    // Recalculate totals from window
    if (this.volumeHistory.length > 0) {
      const latest = this.volumeHistory[this.volumeHistory.length - 1];
      const oldest = this.volumeHistory[0];
      this.aggressiveBuyVolume = latest.buy - (oldest.buy ?? 0);
      this.aggressiveSellVolume = latest.sell - (oldest.sell ?? 0);
      this.totalObservedVolume = latest.total - (oldest.total ?? 0);
    }

    this.previousBook = book;
  }

  /**
   * Get current toxicity metric (0..1)
   * Higher = more aggressive flow (more toxic)
   */
  getToxicity(): number {
    const eps = 0.0001;
    if (this.totalObservedVolume < eps) {
      return 0; // No volume observed
    }
    
    // Toxicity = (aggressive_buy + aggressive_sell) / total_observed
    return Math.min(1, (this.aggressiveBuyVolume + this.aggressiveSellVolume) / this.totalObservedVolume);
  }

  /**
   * Get directional toxicity (which side is more aggressive)
   * Returns positive for buy pressure, negative for sell pressure
   */
  getDirectionalToxicity(): number {
    const eps = 0.0001;
    const total = this.aggressiveBuyVolume + this.aggressiveSellVolume;
    if (total < eps) return 0;
    
    return (this.aggressiveBuyVolume - this.aggressiveSellVolume) / total;
  }

  /**
   * Reset estimator
   */
  reset(): void {
    this.previousBook = null;
    this.aggressiveBuyVolume = 0;
    this.aggressiveSellVolume = 0;
    this.totalObservedVolume = 0;
    this.volumeHistory = [];
  }
}

// ============================================================================
// 3. INVENTORY RISK (Inventory ratio calculator)
// ============================================================================

export interface InventoryRiskConfig {
  maxInventory?: number; // Maximum inventory limit (default: 1000)
}

export class InventoryRisk {
  private config: Required<InventoryRiskConfig>;

  constructor(config: InventoryRiskConfig = {}) {
    this.config = {
      maxInventory: config.maxInventory ?? 1000,
    };
  }

  /**
   * Get normalized inventory ratio (-1..1)
   * Positive = long, Negative = short
   */
  getInventoryRatio(inventory: number): number {
    if (this.config.maxInventory <= 0) return 0;
    
    // Clamp inventory to maxInventory range
    const clamped = Math.max(-this.config.maxInventory, Math.min(this.config.maxInventory, inventory));
    return clamped / this.config.maxInventory;
  }

  /**
   * Get absolute inventory ratio (0..1)
   */
  getAbsInventoryRatio(inventory: number): number {
    return Math.abs(this.getInventoryRatio(inventory));
  }

  /**
   * Get raw inventory (pass-through)
   */
  getInventory(inventory: number): number {
    return inventory;
  }
}

// ============================================================================
// 4. ADAPTIVE MARKET MAKER CONTROLLER (Core adaptive logic)
// ============================================================================

export interface AdaptiveControllerConfig {
  // Spread parameters
  K?: number; // Spread multiplier (default: 2.0)
  minSpreadBps?: number; // Minimum spread in basis points (default: 10 = 0.1%)
  maxSpreadBps?: number; // Maximum spread in basis points (default: 500 = 5%)
  
  // Inventory skew
  gamma?: number; // Inventory skew factor (default: 0.5)
  
  // Size parameters
  baseSize?: number; // Base order size (default: 10)
  minSize?: number; // Minimum order size (default: 1)
  maxSize?: number; // Maximum order size (default: 1000)
  
  // Toxicity thresholds
  pauseToxicityThreshold?: number; // Pause quoting above this (default: 0.65)
  reduceSizeToxicityThreshold?: number; // Reduce size above this (default: 0.5)
  sizeReductionFactor?: number; // Factor to reduce size by (default: 0.5)
  
  // Inventory thresholds
  maxInventoryRatioSoft?: number; // Soft limit (default: 0.5 = 50%)
  maxInventoryRatioHard?: number; // Hard limit (default: 0.8 = 80%)
  
  // Refresh cadence
  refreshMs?: number; // Order refresh interval (default: 5000ms)
  
  // Fill tracking
  noFillTightenMinutes?: number; // Minutes without fill before tightening (default: 10)
  noFillTightenFactor?: number; // Factor to tighten spread by (default: 0.9)
  noFillSizeIncreaseFactor?: number; // Factor to increase size by (default: 1.1)
  
  // Tick size
  tickSize?: number; // Minimum price increment (default: 0.0001)
  
  // Price bounds
  minPrice?: number; // Minimum valid price (default: 0.0)
  maxPrice?: number; // Maximum valid price (default: 1.0)
}

export interface ControllerOutput {
  // Quote prices
  bid: number | null; // Bid price (null = don't quote)
  ask: number | null; // Ask price (null = don't quote)
  
  // Order size
  size: number; // Order size to use
  
  // Mode
  mode: "normal" | "reduce-size" | "pause" | "one-sided-buy" | "one-sided-sell";
  
  // Metrics (for logging)
  mid: number;
  sigma: number;
  toxicity: number;
  inventoryRatio: number;
  spread: number;
  skew: number;
  
  // Fill tracking
  lastFillAge: number; // Seconds since last fill
}

export class AdaptiveMarketMakerController {
  private config: Required<AdaptiveControllerConfig>;
  private volatilityEstimator: VolatilityEstimator;
  private toxicityEstimator: ToxicityEstimator;
  private inventoryRisk: InventoryRisk;
  private lastFillTime: number | null = null;
  private lastMidPrice: number | null = null;

  constructor(config: AdaptiveControllerConfig = {}) {
    this.config = {
      K: config.K ?? 2.0,
      minSpreadBps: config.minSpreadBps ?? 10,
      maxSpreadBps: config.maxSpreadBps ?? 500,
      gamma: config.gamma ?? 0.5,
      baseSize: config.baseSize ?? 10,
      minSize: config.minSize ?? 1,
      maxSize: config.maxSize ?? 1000,
      pauseToxicityThreshold: config.pauseToxicityThreshold ?? 0.65,
      reduceSizeToxicityThreshold: config.reduceSizeToxicityThreshold ?? 0.5,
      sizeReductionFactor: config.sizeReductionFactor ?? 0.5,
      maxInventoryRatioSoft: config.maxInventoryRatioSoft ?? 0.5,
      maxInventoryRatioHard: config.maxInventoryRatioHard ?? 0.8,
      refreshMs: config.refreshMs ?? 5000,
      noFillTightenMinutes: config.noFillTightenMinutes ?? 10,
      noFillTightenFactor: config.noFillTightenFactor ?? 0.9,
      noFillSizeIncreaseFactor: config.noFillSizeIncreaseFactor ?? 1.1,
      tickSize: config.tickSize ?? 0.0001,
      minPrice: config.minPrice ?? 0.0,
      maxPrice: config.maxPrice ?? 1.0,
    };

    this.volatilityEstimator = new VolatilityEstimator({ halfLifeMinutes: 10 });
    this.toxicityEstimator = new ToxicityEstimator({ windowMinutes: 5 });
    this.inventoryRisk = new InventoryRisk({ maxInventory: 1000 });
  }

  /**
   * Update estimators with latest market data
   */
  updateMarketData(
    mid: number,
    book: OrderBookSnapshot,
    inventory: number,
    timestamp: number
  ): void {
    // Update volatility
    this.volatilityEstimator.update(mid, timestamp);
    
    // Update toxicity
    this.toxicityEstimator.update(book);
    
    // Store mid price
    this.lastMidPrice = mid;
  }

  /**
   * Record a fill event
   */
  recordFill(timestamp: number): void {
    this.lastFillTime = timestamp;
  }

  /**
   * Compute adaptive quotes
   */
  computeQuotes(
    mid: number,
    inventory: number,
    timestamp: number
  ): ControllerOutput {
    // Get metrics
    const sigma = this.volatilityEstimator.getSigma();
    const toxicity = this.toxicityEstimator.getToxicity();
    const I = this.inventoryRisk.getInventoryRatio(inventory);
    const absI = Math.abs(I);

    // Calculate last fill age
    const lastFillAge = this.lastFillTime
      ? (timestamp - this.lastFillTime) / 1000 // Convert to seconds
      : Infinity;

    // Compute raw spread: K * sigma * (1 + toxicity) * (1 + abs(I))
    const spreadRaw = this.config.K * sigma * (1 + toxicity) * (1 + absI);
    
    // Convert to basis points and clamp
    const spreadBps = Math.max(
      this.config.minSpreadBps,
      Math.min(this.config.maxSpreadBps, spreadRaw * 10000)
    );
    
    // Convert back to price units
    const spread = (spreadBps / 10000) * mid;

    // Apply no-fill tightening (only if toxicity is low)
    let adjustedSpread = spread;
    if (lastFillAge > this.config.noFillTightenMinutes * 60 && toxicity < 0.3) {
      adjustedSpread = spread * this.config.noFillTightenFactor;
      // Re-clamp
      const adjustedBps = (adjustedSpread / mid) * 10000;
      const clampedBps = Math.max(
        this.config.minSpreadBps,
        Math.min(this.config.maxSpreadBps, adjustedBps)
      );
      adjustedSpread = (clampedBps / 10000) * mid;
    }

    // Compute inventory skew: gamma * I * spread
    const skew = this.config.gamma * I * adjustedSpread;

    // Determine mode and size
    let mode: ControllerOutput["mode"] = "normal";
    let size = this.config.baseSize;

    // Toxicity-based adjustments
    if (toxicity >= this.config.pauseToxicityThreshold) {
      mode = "pause";
      size = 0;
    } else if (toxicity >= this.config.reduceSizeToxicityThreshold) {
      mode = "reduce-size";
      size = this.config.baseSize * this.config.sizeReductionFactor;
    }

    // Inventory-based adjustments
    if (absI >= this.config.maxInventoryRatioHard) {
      // Hard limit: quote only the side that reduces inventory
      if (I > 0) {
        mode = "one-sided-sell"; // Long inventory, only quote sell
      } else {
        mode = "one-sided-buy"; // Short inventory, only quote buy
      }
      // Reduce size further
      size = size * 0.5;
    } else if (absI >= this.config.maxInventoryRatioSoft) {
      // Soft limit: apply additional skew and size reduction
      size = size * 0.75;
    }

    // Apply no-fill size increase (only if toxicity is low and not paused)
    if (lastFillAge > this.config.noFillTightenMinutes * 60 && 
        toxicity < 0.3 && 
        mode !== "pause" && 
        mode !== "one-sided-buy" && 
        mode !== "one-sided-sell") {
      size = Math.min(this.config.maxSize, size * this.config.noFillSizeIncreaseFactor);
    }

    // Clamp size
    size = Math.max(this.config.minSize, Math.min(this.config.maxSize, size));

    // Compute quoted prices
    let bid: number | null = null;
    let ask: number | null = null;

    if (mode !== "pause") {
      // Bid: mid - spread/2 - skew (skew negative when long, positive when short)
      if (mode !== "one-sided-sell") {
        bid = mid - adjustedSpread / 2 - skew;
        bid = this.roundToTick(bid);
        bid = Math.max(this.config.minPrice, Math.min(this.config.maxPrice, bid));
      }

      // Ask: mid + spread/2 - skew (skew negative when long, positive when short)
      if (mode !== "one-sided-buy") {
        ask = mid + adjustedSpread / 2 - skew;
        ask = this.roundToTick(ask);
        ask = Math.max(this.config.minPrice, Math.min(this.config.maxPrice, ask));
      }
    }

    return {
      bid,
      ask,
      size,
      mode,
      mid,
      sigma,
      toxicity,
      inventoryRatio: I,
      spread: adjustedSpread,
      skew,
      lastFillAge,
    };
  }

  /**
   * Round price to tick size
   */
  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  /**
   * Reset all estimators
   */
  reset(): void {
    this.volatilityEstimator.reset();
    this.toxicityEstimator.reset();
    this.lastFillTime = null;
    this.lastMidPrice = null;
  }
}

