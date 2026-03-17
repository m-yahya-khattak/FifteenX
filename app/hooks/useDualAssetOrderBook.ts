/**
 * Dual Asset OrderBook Hook
 * 
 * Tracks separate orderbooks for YES (upAssetId) and NO (downAssetId) assets.
 * Each asset has its own WebSocket subscription and orderbook state.
 * 
 * Used for dual-asset market making where we quote both sides of both assets.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useCLOBOrderBook } from "./useCLOBOrderBook";

export interface DualAssetOrderBookState {
  yesOrderBook: {
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    bestBid: string | null;
    bestAsk: string | null;
    lastTradePrice: string | null;
    spread: string | null;
  };
  noOrderBook: {
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    bestBid: string | null;
    bestAsk: string | null;
    lastTradePrice: string | null;
    spread: string | null;
  };
  yesConnected: boolean;
  noConnected: boolean;
}

export function useDualAssetOrderBook(assetIds: string[] | null) {
  const upAssetId = assetIds?.[0] || null;
  const downAssetId = assetIds?.[1] || null;

  // Separate orderbook hooks for YES and NO
  const yesOrderBookData = useCLOBOrderBook(upAssetId ? [upAssetId] : null);
  const noOrderBookData = useCLOBOrderBook(downAssetId ? [downAssetId] : null);

  const [dualOrderBook, setDualOrderBook] = useState<DualAssetOrderBookState>({
    yesOrderBook: {
      bids: [],
      asks: [],
      bestBid: null,
      bestAsk: null,
      lastTradePrice: null,
      spread: null,
    },
    noOrderBook: {
      bids: [],
      asks: [],
      bestBid: null,
      bestAsk: null,
      lastTradePrice: null,
      spread: null,
    },
    yesConnected: false,
    noConnected: false,
  });

  // Update dual orderbook when individual orderbooks change
  useEffect(() => {
    setDualOrderBook({
      yesOrderBook: yesOrderBookData.orderBook || {
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        lastTradePrice: null,
        spread: null,
      },
      noOrderBook: noOrderBookData.orderBook || {
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        lastTradePrice: null,
        spread: null,
      },
      yesConnected: yesOrderBookData.isConnected,
      noConnected: noOrderBookData.isConnected,
    });
  }, [yesOrderBookData.orderBook, noOrderBookData.orderBook, yesOrderBookData.isConnected, noOrderBookData.isConnected]);

  // Helper to get mid price for YES asset
  const getYesMidPrice = useCallback((): number | null => {
    const yes = dualOrderBook.yesOrderBook;
    if (!yes.bestBid || !yes.bestAsk) return null;
    const bid = parseFloat(yes.bestBid);
    const ask = parseFloat(yes.bestAsk);
    if (isNaN(bid) || isNaN(ask)) return null;
    return (bid + ask) / 2;
  }, [dualOrderBook.yesOrderBook]);

  // Helper to get mid price for NO asset
  const getNoMidPrice = useCallback((): number | null => {
    const no = dualOrderBook.noOrderBook;
    if (!no.bestBid || !no.bestAsk) return null;
    const bid = parseFloat(no.bestBid);
    const ask = parseFloat(no.bestAsk);
    if (isNaN(bid) || isNaN(ask)) return null;
    return (bid + ask) / 2;
  }, [dualOrderBook.noOrderBook]);

  // Helper to check if both orderbooks are available
  const isBothConnected = dualOrderBook.yesConnected && dualOrderBook.noConnected;

  return {
    dualOrderBook,
    getYesMidPrice,
    getNoMidPrice,
    isBothConnected,
    yesConnected: dualOrderBook.yesConnected,
    noConnected: dualOrderBook.noConnected,
  };
}

