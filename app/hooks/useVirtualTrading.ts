"use client";

import { useState, useEffect, useCallback } from "react";

export interface Position {
  id: string;
  marketId: string;
  marketTitle: string;
  side: "up" | "down";
  assetId: string;
  entryPrice: number; // Price per share (0-1)
  quantity: number; // Number of shares
  entryValue: number; // Total cost (entryPrice * quantity)
  timestamp: number;
  endTime?: string;
}

export interface Trade {
  id: string;
  marketId: string;
  marketTitle: string;
  side: "up" | "down";
  type: "buy" | "sell";
  price: number;
  quantity: number;
  value: number;
  timestamp: number;
  pnl?: number; // Profit/Loss if this was a closing trade
}

const INITIAL_BALANCE = 10000; // $10,000 virtual starting balance

export function useVirtualTrading() {
  const [balance, setBalance] = useState<number>(INITIAL_BALANCE);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load balance
        const balanceRes = await fetch("/api/trading/balance");
        const balanceData = await balanceRes.json();
        if (balanceData.success) {
          setBalance(balanceData.balance);
        }

        // Load positions
        const positionsRes = await fetch("/api/trading/positions");
        const positionsData = await positionsRes.json();
        if (positionsData.success) {
          // Map database fields to Position interface
          setPositions(positionsData.positions.map((p: any) => ({
            id: p.id,
            marketId: p.market_id,
            marketTitle: p.market_title,
            side: p.side,
            assetId: p.asset_id,
            entryPrice: p.entry_price,
            quantity: p.quantity,
            entryValue: p.entry_value,
            timestamp: p.timestamp,
            endTime: p.end_time,
          })));
        }

        // Load trade history
        const tradesRes = await fetch("/api/trading/trades?limit=100");
        const tradesData = await tradesRes.json();
        if (tradesData.success) {
          // Map database fields to Trade interface
          setTradeHistory(tradesData.trades.map((t: any) => ({
            id: t.id,
            marketId: t.market_id,
            marketTitle: t.market_title,
            side: t.side,
            type: t.type,
            price: t.price,
            quantity: t.quantity,
            value: t.value,
            timestamp: t.timestamp,
            pnl: t.pnl,
          })));
        }
      } catch (error) {
        console.error("Failed to load trading data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Save balance to database whenever it changes (debounced)
  useEffect(() => {
    if (isLoading) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        await fetch("/api/trading/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balance }),
        });
      } catch (error) {
        console.error("Failed to save balance:", error);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [balance, isLoading]);

  // Save positions to database whenever they change (debounced)
  useEffect(() => {
    if (isLoading) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        await fetch("/api/trading/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions }),
        });
      } catch (error) {
        console.error("Failed to save positions:", error);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [positions, isLoading]);

  // Save trade history to database whenever it changes (debounced)
  useEffect(() => {
    if (isLoading) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        await fetch("/api/trading/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trades: tradeHistory }),
        });
      } catch (error) {
        console.error("Failed to save trades:", error);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [tradeHistory, isLoading]);

  // Buy shares (match against best ask price)
  const buy = useCallback((
    marketId: string,
    marketTitle: string,
    side: "up" | "down",
    assetId: string,
    bestAskPrice: number | null,
    quantity: number,
    endTime?: string
  ): { success: boolean; message: string } => {
    if (!bestAskPrice || bestAskPrice <= 0) {
      return { success: false, message: "No ask price available" };
    }

    if (quantity <= 0) {
      return { success: false, message: "Quantity must be greater than 0" };
    }

    const totalCost = bestAskPrice * quantity;

    if (totalCost > balance) {
      return { success: false, message: "Insufficient balance" };
    }

    // Deduct from balance
    const newBalance = balance - totalCost;
    setBalance(newBalance);

    // Create position
    const position: Position = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      marketId,
      marketTitle,
      side,
      assetId,
      entryPrice: bestAskPrice,
      quantity,
      entryValue: totalCost,
      timestamp: Date.now(),
      endTime,
    };

    // Check if we already have a position for this market/side
    const existingPositionIndex = positions.findIndex(
      (p) => p.marketId === marketId && p.side === side && p.assetId === assetId
    );

    if (existingPositionIndex >= 0) {
      // Add to existing position (average entry price)
      const existing = positions[existingPositionIndex];
      const totalQuantity = existing.quantity + quantity;
      const totalValue = existing.entryValue + totalCost;
      const avgEntryPrice = totalValue / totalQuantity;

      const updatedPositions = [...positions];
      updatedPositions[existingPositionIndex] = {
        ...existing,
        quantity: totalQuantity,
        entryPrice: avgEntryPrice,
        entryValue: totalValue,
      };
      setPositions(updatedPositions);
    } else {
      // Create new position
      setPositions([...positions, position]);
    }

    // Add to trade history
    const trade: Trade = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      marketId,
      marketTitle,
      side,
      type: "buy",
      price: bestAskPrice,
      quantity,
      value: totalCost,
      timestamp: Date.now(),
    };
    setTradeHistory((prev) => [trade, ...prev].slice(0, 100)); // Keep last 100 trades

    return { success: true, message: `Bought ${quantity.toFixed(2)} shares at ${(bestAskPrice * 100).toFixed(0)}¢` };
  }, [balance, positions]);

  // Sell shares (match against best bid price)
  const sell = useCallback((
    marketId: string,
    marketTitle: string,
    side: "up" | "down",
    assetId: string,
    bestBidPrice: number | null,
    quantity: number
  ): { success: boolean; message: string } => {
    if (!bestBidPrice || bestBidPrice <= 0) {
      return { success: false, message: "No bid price available" };
    }

    if (quantity <= 0) {
      return { success: false, message: "Quantity must be greater than 0" };
    }

    // Find position
    const positionIndex = positions.findIndex(
      (p) => p.marketId === marketId && p.side === side && p.assetId === assetId
    );

    if (positionIndex < 0) {
      return { success: false, message: "No position found" };
    }

    const position = positions[positionIndex];

    if (quantity > position.quantity) {
      return { success: false, message: "Insufficient shares" };
    }

    const totalValue = bestBidPrice * quantity;
    const pnl = totalValue - (position.entryPrice * quantity);

    // Add to balance
    const newBalance = balance + totalValue;
    setBalance(newBalance);

    // Update or remove position
    const updatedPositions = [...positions];
    if (quantity >= position.quantity) {
      // Close entire position
      updatedPositions.splice(positionIndex, 1);
    } else {
      // Partial close
      updatedPositions[positionIndex] = {
        ...position,
        quantity: position.quantity - quantity,
        entryValue: position.entryValue - (position.entryPrice * quantity),
      };
    }
    setPositions(updatedPositions);

    // Add to trade history
    const trade: Trade = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      marketId,
      marketTitle,
      side,
      type: "sell",
      price: bestBidPrice,
      quantity,
      value: totalValue,
      timestamp: Date.now(),
      pnl,
    };
    setTradeHistory((prev) => [trade, ...prev].slice(0, 100)); // Keep last 100 trades

    const pnlText = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    return { success: true, message: `Sold ${quantity.toFixed(2)} shares at ${(bestBidPrice * 100).toFixed(0)}¢ (${pnlText})` };
  }, [balance, positions]);

  // Close entire position
  const closePosition = useCallback((
    positionId: string,
    bestBidPrice: number | null
  ): { success: boolean; message: string } => {
    const position = positions.find((p) => p.id === positionId);
    if (!position) {
      return { success: false, message: "Position not found" };
    }

    return sell(
      position.marketId,
      position.marketTitle,
      position.side,
      position.assetId,
      bestBidPrice,
      position.quantity
    );
  }, [positions, sell]);

  // Calculate current P&L for a position
  const calculatePositionPnL = useCallback((position: Position, currentPrice: number | null): number => {
    if (!currentPrice) return 0;
    const currentValue = currentPrice * position.quantity;
    return currentValue - position.entryValue;
  }, []);

  // Get total portfolio value (balance + open positions value)
  const getPortfolioValue = useCallback((currentPrices: Map<string, number>): number => {
    const positionsValue = positions.reduce((sum, pos) => {
      const currentPrice = currentPrices.get(pos.assetId) || pos.entryPrice;
      return sum + (currentPrice * pos.quantity);
    }, 0);
    return balance + positionsValue;
  }, [balance, positions]);

  // Reset all data (for testing/debugging)
  const reset = useCallback(async () => {
    setBalance(INITIAL_BALANCE);
    setPositions([]);
    setTradeHistory([]);
    
    // Reset in database
    try {
      await fetch("/api/trading/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: INITIAL_BALANCE }),
      });
      await fetch("/api/trading/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: [] }),
      });
      await fetch("/api/trading/trades", {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Failed to reset trading data:", error);
    }
  }, []);

  return {
    balance,
    positions,
    tradeHistory,
    buy,
    sell,
    closePosition,
    calculatePositionPnL,
    getPortfolioValue,
    reset,
  };
}



