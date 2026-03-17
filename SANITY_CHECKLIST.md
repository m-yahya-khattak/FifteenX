# Market Maker Backtest - Manual Sanity Checklist

This checklist verifies determinism, accounting correctness, and lifecycle correctness after the fixes.

## Prerequisites
- Market Maker dashboard UI is accessible
- Backtest mode is functional
- Console is open for debugging

---

## 1. Backtest Starts "Doing Work" on Step 0 ✅

**Test Steps:**
1. Open Market Maker page
2. Configure short backtest (1-5 minutes) with small order size (e.g., $1-5)
3. Start backtest
4. Watch first update tick

**What to Check:**
- [ ] Orders appear immediately (at least 1-2 resting orders)
- [ ] Backtest status shows "Running"
- [ ] Step index increments in console/logs
- [ ] No "dead start" - activity within first 1-3 steps

**Code Verification:**
- `lastRebalanceTimeRef.current = 0` ensures first rebalance happens immediately
- `shouldRebalanceNow = backtestIndexRef.current === 0 || shouldRebalance()` forces step 0 rebalance
- `isBacktestingRef.current` check in `checkFills()` allows fills from step 0

**Pass Criteria:**
✅ Orders and/or inventory changes visible within first 1-3 steps

---

## 2. Fill Simulation Behaves and Updates PnL Consistently ✅

**Test Steps:**
1. Start backtest
2. Watch metrics panel during execution

**What to Check:**
- [ ] Trades count increments only when fills happen
- [ ] Inventory changes in direction of fills (BUY → +inventory, SELL → -inventory)
- [ ] Fees increase monotonically (never decrease)
- [ ] Realized PnL changes only on fills
- [ ] Unrealized PnL changes when mid price changes (even with no fills)
- [ ] Total PnL = Realized PnL + Unrealized PnL (displayed correctly)
- [ ] Net PnL = Total PnL - Fees (displayed correctly)

**Code Verification:**
- `simulateFill()` updates `realizedPnL` immediately
- `useEffect` watching `orderBook` updates `unrealizedPnL` and recalculates `totalPnL`
- Single source of truth: `totalPnL = realizedPnL + unrealizedPnL` in one place
- `netPnL = totalPnL - totalFees` calculated consistently

**Pass Criteria:**
✅ No contradictions between netPnL, totalPnL, and fees
✅ No negative fees
✅ Realized PnL only changes on fills

---

## 3. Equity Consistency (Cash + Inventory Value) ✅

**Test Steps:**
1. Note initial balance and inventory
2. Watch during backtest execution
3. Manually compute: `equity ≈ balance + inventory * midPrice`

**What to Check:**
- [ ] Equity moves smoothly
- [ ] Equity aligns with PnL direction
- [ ] No unrealistic explosions or drifts
- [ ] Equity responds predictably to midPrice changes

**Code Verification:**
- `perf.balance` updated on fills (cash accounting)
- `perf.inventory` validated against `positionHistoryRef` in `simulateFill()`
- Inventory drift correction: `if (Math.abs(calculatedInventory - perf.inventory) > 0.0001)`

**Pass Criteria:**
✅ Equity doesn't explode or drift unrealistically
✅ Equity responds predictably to midPrice changes

---

## 4. Tick Size Enforcement ✅

**Test Steps:**
1. Set `tickSize` to obvious value (e.g., 0.01 or 0.05)
2. Start backtest or live mode
3. Inspect placed order prices

**What to Check:**
- [ ] Every order price aligns to tick increments
- [ ] No fractional "off-grid" prices

**Code Verification:**
- `placeOrder()`: `const tickedPrice = Math.round(price / configRef.current.tickSize) * configRef.current.tickSize`
- `rebalanceOrders()`: Both bid and ask prices rounded to tick size

**Pass Criteria:**
✅ All order prices are multiples of tickSize
✅ No off-grid prices visible

---

## 5. Cancellation Correctness (No Phantom Liquidity) ✅

**Test Steps:**
1. Set low `rebalanceInterval` (e.g., 1000ms) to cause frequent cancel/replace
2. Start backtest
3. Watch order lifecycle

**What to Check:**
- [ ] Orders are placed
- [ ] Orders get cancelled/updated
- [ ] New orders appear
- [ ] No fills occur against previously cancelled orders
- [ ] Queue volume doesn't grow without bound after many cancels

**Code Verification:**
- `BacktestEngine.processCancellations()` now calls `removeOrderFromQueue()` before deleting
- Orders removed from both `orderQueue` map and `bidQueues/askQueues` structures

**Pass Criteria:**
✅ No fills against cancelled orders
✅ Queue volume stays bounded

---

## 6. Determinism Test (MOST IMPORTANT) ✅

**Test Steps:**
1. **First Run:**
   - Use same market, same historical time range, same config
   - Run backtest to completion
   - Record:
     - Total trades
     - Final inventory
     - Total fees
     - Final netPnL
     - Max drawdown

2. **Second Run:**
   - Use IDENTICAL settings
   - Run backtest immediately after
   - Compare results

**What to Check:**
- [ ] Results match exactly (or within tiny tolerance for rounding)
- [ ] Same number of trades
- [ ] Same final inventory
- [ ] Same total fees
- [ ] Same final netPnL
- [ ] Same max drawdown

**Code Verification:**
- `deterministicRandom()` uses fixed seed (12345) - LCG generator
- All `Math.random()` replaced with deterministic version
- Fixed `VOLUME_MULTIPLIER = 100` constant
- Same inputs → same outputs

**Pass Criteria:**
✅ Results match exactly (within rounding tolerance)
✅ If different, must be due to non-deterministic external data (real historical data)

---

## 7. Pause/Stop/Reset Behavior ✅

**Test Steps:**
1. Start backtest
2. Stop it mid-run (if UI supports)
3. Start again
4. Check state

**What to Check:**
- [ ] No duplicated subscriptions
- [ ] No "double speed" stepping
- [ ] State resets cleanly:
  - [ ] Trades array doesn't append across runs
  - [ ] Orders array doesn't append across runs
  - [ ] History arrays don't append across runs
- [ ] Backtest loop stops in background after stop

**Code Verification:**
- `reset()` clears: `tradesRef.current = []`, `ordersRef.current = []`, `performanceHistoryRef.current = []`
- `stopBacktest()` sets `isBacktestingRef.current = false` which stops loop
- `processBacktestStep()` checks `if (!isBacktestingRef.current)` at start

**Pass Criteria:**
✅ Clean state reset between runs
✅ No background processes after stop

---

## 8. Live Mode Unaffected by Backtest Fixes ✅

**Test Steps:**
1. Switch to live mode
2. Enable market maker
3. Watch behavior

**What to Check:**
- [ ] Orderbook updates flow from websocket
- [ ] Strategy places orders when enabled
- [ ] UI remains responsive
- [ ] No console errors

**Code Verification:**
- `mode === "backtest"` checks prevent backtest logic from running in live mode
- `isBacktestingRef.current` only true during backtest
- Live mode uses `Date.now()`, backtest uses `simTimeRef.current`

**Pass Criteria:**
✅ Live mode works normally
✅ No backtest-specific errors in live mode

---

## 9. Rebalance Intent Sanity ✅

**Test Steps:**
1. Trigger a rebalance (or wait for interval)
2. Inspect placed orders

**What to Check:**
- [ ] Orders placed on expected asset(s)
- [ ] If binary YES/NO market: both orders on same asset
- [ ] If cross-asset hedging: orders split across assets
- [ ] UI shows which `assetId` each order targets

**Code Verification:**
- Currently: Both BUY and SELL use `upAssetId`
- TODO comment added: "If SELL should be on downAssetId instead of upAssetId, change here"
- Line ~405 in `rebalanceOrders()`

**Pass Criteria:**
✅ Behavior matches intended market structure
✅ UI makes assetId explicit

---

## 10. Risk Metrics Don't Lag or Contradict History ✅

**Test Steps:**
1. Observe Sharpe ratio, drawdown, win-rate during backtest
2. Check at completion

**What to Check:**
- [ ] Metrics update steadily during backtest
- [ ] At completion, metrics reflect same trade/performance history shown
- [ ] No obvious lag (metrics represent current run, not previous)
- [ ] No "NaN", "Infinity", or negative variance issues

**Code Verification:**
- `calculateRiskMetrics()` uses `tradesRef.current` (not stale state)
- Uses `performanceHistoryRef.current` for drawdown calculation
- Sharpe calculation handles division by zero: `if (stdDev > 0)`
- Win rate: `currentTrades.filter((t) => (t.pnl || 0) > 0).length`

**Pass Criteria:**
✅ Metrics update in real-time
✅ No NaN/Infinity errors
✅ Metrics match displayed history

---

## Quick Reference: Expected Console Logs

During backtest, you should see:
- `"Backtest rebalancing at step X"` - on first step and when interval elapses
- `"Placed BUY order:"` / `"Placed SELL order:"` - when orders placed
- `"Rebalance complete:"` - after rebalancing
- No errors about `deterministicRandom is not defined`
- No errors about stale closures

## Common Issues to Watch For

1. **Orders not appearing on step 0:**
   - Check `lastRebalanceTimeRef.current = 0` was set
   - Check `shouldRebalanceNow` logic

2. **Non-deterministic results:**
   - Verify `deterministicRandom()` is used everywhere (not `Math.random()`)
   - Check seed is fixed (12345)

3. **PnL inconsistencies:**
   - Verify `totalPnL = realizedPnL + unrealizedPnL` in one place
   - Check `netPnL = totalPnL - totalFees` calculation

4. **Phantom queue volume:**
   - Verify `removeOrderFromQueue()` called in `processCancellations()`

5. **Stale state in backtest completion:**
   - Verify `tradesRef.current` and `configRef.current` used (not state)

---

## Test Results Template

```
Date: ___________
Tester: ___________

1. Backtest starts on step 0: [ ] PASS [ ] FAIL
   Notes: _________________________________

2. Fill simulation consistent: [ ] PASS [ ] FAIL
   Notes: _________________________________

3. Equity consistency: [ ] PASS [ ] FAIL
   Notes: _________________________________

4. Tick size enforcement: [ ] PASS [ ] FAIL
   Notes: _________________________________

5. Cancellation correctness: [ ] PASS [ ] FAIL
   Notes: _________________________________

6. Determinism test: [ ] PASS [ ] FAIL
   Run 1: trades=___, inventory=___, fees=___, netPnL=___
   Run 2: trades=___, inventory=___, fees=___, netPnL=___
   Match: [ ] YES [ ] NO
   Notes: _________________________________

7. Pause/stop/reset: [ ] PASS [ ] FAIL
   Notes: _________________________________

8. Live mode unaffected: [ ] PASS [ ] FAIL
   Notes: _________________________________

9. Rebalance intent: [ ] PASS [ ] FAIL
   Notes: _________________________________

10. Risk metrics: [ ] PASS [ ] FAIL
    Notes: _________________________________

Overall: [ ] ALL PASS [ ] ISSUES FOUND
```

