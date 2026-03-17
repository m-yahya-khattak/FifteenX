# Adaptive Market Maker Controller

## Overview

This implementation replaces fixed-spread market-making logic with an adaptive, risk-aware controller that auto-configures quoting parameters in real-time based on:

1. **Volatility (sigma)**: EWMA of log returns from mid prices
2. **Order-flow toxicity**: Aggressive flow ratio derived from L2 book deltas
3. **Inventory risk**: Normalized inventory exposure

## Architecture

### Components

#### 1. `VolatilityEstimator` (`app/lib/adaptiveMarketMaker.ts`)
- **Input**: Stream of mid prices (timestamped)
- **Output**: `sigma` (volatility estimate)
- **Method**: EWMA of log returns with configurable half-life (default: 10 minutes)
- **Reuses**: Mid price from `getMidPrice()` in `useMarketMaker.ts`

#### 2. `ToxicityEstimator` (`app/lib/adaptiveMarketMaker.ts`)
- **Input**: L2 orderbook snapshots (best bid/ask, optional top K levels)
- **Output**: `toxicity` (0..1, higher = more aggressive flow)
- **Method**: Tracks aggressive buy/sell volume from book size decreases
- **Reuses**: Orderbook data from `useCLOBOrderBook` hook

#### 3. `InventoryRisk` (`app/lib/adaptiveMarketMaker.ts`)
- **Input**: Raw inventory (signed position)
- **Output**: Normalized inventory ratio (-1..1)
- **Method**: `inventory_ratio = inventory / maxInventory`
- **Reuses**: `performance.inventory` from `useMarketMaker.ts`

#### 4. `AdaptiveMarketMakerController` (`app/lib/adaptiveMarketMaker.ts`)
- **Core logic**: Computes adaptive spread, skew, and order size
- **Integration**: Replaces `rebalanceOrders()` logic in `useMarketMaker.ts`

## Configuration

### Enable Adaptive Controller

Set in `MarketMakerConfig`:

```typescript
{
  useAdaptiveController: true,
  adaptiveConfig: {
    // Spread parameters
    K: 2.0,                    // Spread multiplier
    minSpreadBps: 10,          // Minimum spread (0.1%)
    maxSpreadBps: 500,         // Maximum spread (5%)
    
    // Inventory skew
    gamma: 0.5,                // Inventory skew factor
    
    // Size parameters
    baseSize: 10,              // Base order size
    minSize: 1,                // Minimum order size
    maxSize: 1000,             // Maximum order size
    
    // Toxicity thresholds
    pauseToxicityThreshold: 0.65,      // Pause quoting above this
    reduceSizeToxicityThreshold: 0.5,  // Reduce size above this
    sizeReductionFactor: 0.5,           // Factor to reduce size by
    
    // Inventory thresholds
    maxInventoryRatioSoft: 0.5,  // Soft limit (50%)
    maxInventoryRatioHard: 0.8,   // Hard limit (80%)
    
    // Fill tracking
    noFillTightenMinutes: 10,      // Minutes without fill before tightening
    noFillTightenFactor: 0.9,     // Factor to tighten spread by
    noFillSizeIncreaseFactor: 1.1, // Factor to increase size by
  }
}
```

## Adaptive Logic

### Spread Calculation

```
spread_raw = K * sigma * (1 + toxicity) * (1 + abs(inventory_ratio))
spread = clamp(spread_raw, minSpreadBps, maxSpreadBps)
```

### Inventory Skew

```
skew = gamma * inventory_ratio * spread
bid = mid - spread/2 - skew
ask = mid + spread/2 - skew
```

### Mode Selection

1. **Normal**: Default mode, quotes both sides
2. **Reduce-size**: When `toxicity >= reduceSizeToxicityThreshold`
3. **Pause**: When `toxicity >= pauseToxicityThreshold` (cancels all orders)
4. **One-sided-buy**: When `inventory_ratio <= -maxInventoryRatioHard` (only quote buy to reduce short)
5. **One-sided-sell**: When `inventory_ratio >= maxInventoryRatioHard` (only quote sell to reduce long)

### No-Fill Adaptation

If no fills for `noFillTightenMinutes` AND `toxicity < 0.3`:
- Tighten spread by `noFillTightenFactor`
- Increase size by `noFillSizeIncreaseFactor` (within caps)

## Integration Points

### Files Changed

1. **`app/lib/adaptiveMarketMaker.ts`** (NEW)
   - `VolatilityEstimator` class
   - `ToxicityEstimator` class
   - `InventoryRisk` class
   - `AdaptiveMarketMakerController` class

2. **`app/hooks/useMarketMaker.ts`** (MODIFIED)
   - Added `useAdaptiveController` flag to `MarketMakerConfig`
   - Added `adaptiveConfig` to `MarketMakerConfig`
   - Added adaptive controller refs and initialization
   - Modified `rebalanceOrders()` to support adaptive path
   - Added fill tracking in `simulateFill()`
   - Added structured logging

### Reused Components

- **`useCLOBOrderBook`**: Provides L2 orderbook data (best bid/ask)
- **`getMidPrice()`**: Calculates mid price from orderbook
- **`performance.inventory`**: Tracks signed inventory position
- **`placeOrder()`**: Places orders (unchanged)
- **`simulateFill()`**: Records fills and updates inventory

## Usage

### Enable in UI

The adaptive controller is opt-in via the `useAdaptiveController` config flag. When enabled, it automatically:

1. Updates volatility estimator with each mid price change
2. Updates toxicity estimator with each orderbook update
3. Computes adaptive quotes on each rebalance cycle
4. Places/cancels orders based on controller output

### Logging

Structured logs are emitted in development/test mode:

```
[AdaptiveController] {
  mid: 0.546500,
  sigma: 0.001234,
  toxicity: 0.450,
  inventoryRatio: 0.250,
  spread: 0.002345,
  skew: 0.000123,
  bid: 0.545000,
  ask: 0.548000,
  size: 10.00,
  mode: "normal",
  lastFillAge: "45.2s"
}
```

## Testing

### Unit Tests (TODO)

Create tests for:
- `VolatilityEstimator`: Verify sigma calculation from price series
- `ToxicityEstimator`: Verify toxicity from book deltas
- `AdaptiveMarketMakerController`: Verify spread/skew/mode logic

### Simulation Hooks

Test scenarios:
1. **Volatility spike**: Verify spread widens
2. **Toxicity spike**: Verify pause/reduce-size mode
3. **Inventory drift**: Verify skew and one-sided quoting
4. **No fills**: Verify spread tightening and size increase

## Parameters & Tuning

### K (Spread Multiplier)
- **Default**: 2.0
- **Higher**: Wider spreads (more conservative)
- **Lower**: Tighter spreads (more aggressive)

### gamma (Inventory Skew Factor)
- **Default**: 0.5
- **Higher**: More aggressive inventory rebalancing
- **Lower**: Less inventory skew

### Toxicity Thresholds
- **pauseToxicityThreshold**: 0.65 (pause when 65%+ aggressive flow)
- **reduceSizeToxicityThreshold**: 0.5 (reduce size when 50%+ aggressive flow)

### Inventory Thresholds
- **maxInventoryRatioSoft**: 0.5 (apply size reduction at 50% inventory)
- **maxInventoryRatioHard**: 0.8 (one-sided quoting at 80% inventory)

## Backward Compatibility

The legacy fixed-spread logic remains as a fallback when `useAdaptiveController: false`. This ensures:
- Existing configurations continue to work
- Gradual migration path
- Easy A/B testing

## Future Enhancements

1. **ATR-based volatility**: Alternative to EWMA returns
2. **Directional toxicity**: Separate buy/sell toxicity metrics
3. **Regime detection**: Switch parameters based on market regime
4. **Machine learning**: Learn optimal parameters from historical data

