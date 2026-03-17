import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";
import WebSocket from "ws";

// Calculate 15-minute window start timestamp
function getWindowStart(timestamp: number): number {
  return Math.floor(timestamp / 900000) * 900000;
}

// Batch messages for efficient database writes
interface QueuedMessage {
  windowStart: number;
  assetId: string;
  market: string;
  eventType: string;
  timestamp: number;
  messageData: string;
}

let messageQueue: QueuedMessage[] = [];
let batchTimeout: NodeJS.Timeout | null = null;
const BATCH_SIZE = 50; // Write every 50 messages
const BATCH_INTERVAL = 2000; // Or every 2 seconds

function flushBatch() {
  if (messageQueue.length === 0) return;
  
  try {
    const db = getDatabase();
    const batch = messageQueue.splice(0, messageQueue.length);
    
    // Get oldest window for cleanup
    const oldestWindow = Math.min(...batch.map(m => m.windowStart));
    const cutoffTime = oldestWindow - 900000; // One window before
    
    // Use transaction for efficiency
    const insertStmt = db.prepare(
      `INSERT INTO historical_orderbook 
       (window_start, asset_id, market, event_type, timestamp, message_data)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    
    const transaction = db.transaction((messages: QueuedMessage[]) => {
      for (const msg of messages) {
        insertStmt.run(
          msg.windowStart,
          msg.assetId,
          msg.market,
          msg.eventType,
          msg.timestamp,
          msg.messageData
        );
      }
      
      // Cleanup old data
      db.prepare(
        `DELETE FROM historical_orderbook WHERE window_start < ?`
      ).run(cutoffTime);
    });
    
    transaction(batch);
  } catch (error) {
    console.error("Error flushing batch:", error);
  }
  
  batchTimeout = null;
}

function queueMessage(msg: QueuedMessage) {
  messageQueue.push(msg);
  
  // Flush if batch size reached
  if (messageQueue.length >= BATCH_SIZE) {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    flushBatch();
  } else if (!batchTimeout) {
    // Schedule flush after interval
    batchTimeout = setTimeout(flushBatch, BATCH_INTERVAL);
  }
}

// Store active WebSocket connections
const activeConnections = new Map<string, WebSocket.WebSocket>();

export async function POST(request: NextRequest) {
  try {
    const { action, assetIds } = await request.json();
    
    if (action === "start") {
      if (!assetIds || assetIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "assetIds required" },
          { status: 400 }
        );
      }
      
      // Check if already connected
      const connectionKey = assetIds.sort().join(",");
      if (activeConnections.has(connectionKey)) {
        return NextResponse.json({ 
          success: true, 
          message: "Already capturing for these assets" 
        });
      }
      
      // Connect to Polymarket WebSocket (server-side)
      const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      
      ws.onopen = () => {
        ws.send(JSON.stringify({
          assets_ids: assetIds,
          type: "market",
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Extract message details
          let assetId: string | null = null;
          let market: string | null = null;
          let timestamp: number = Date.now();
          
          if (data.event_type === "book") {
            assetId = data.asset_id;
            market = data.market;
            timestamp = data.timestamp 
              ? (typeof data.timestamp === "string" ? parseInt(data.timestamp) : data.timestamp)
              : Date.now();
          } else if (data.event_type === "price_change") {
            market = data.market;
            timestamp = data.timestamp
              ? (typeof data.timestamp === "string" ? parseInt(data.timestamp) : data.timestamp)
              : Date.now();
            
            // Handle each price change
            if (data.price_changes && data.price_changes.length > 0) {
              for (const change of data.price_changes) {
                const windowStart = getWindowStart(timestamp);
                queueMessage({
                  windowStart,
                  assetId: change.asset_id,
                  market: market,
                  eventType: "price_change",
                  timestamp,
                  messageData: JSON.stringify(change),
                });
              }
              return;
            }
          } else if (data.event_type === "best_bid_ask") {
            assetId = data.asset_id;
            market = data.market;
            timestamp = data.timestamp
              ? (typeof data.timestamp === "string" ? parseInt(data.timestamp) : data.timestamp)
              : Date.now();
          } else if (data.event_type === "last_trade_price") {
            assetId = data.asset_id;
            market = data.market;
            timestamp = data.timestamp
              ? (typeof data.timestamp === "string" ? parseInt(data.timestamp) : data.timestamp)
              : Date.now();
          }
          
          // Queue message if we have asset_id and market
          if (assetId && market) {
            const windowStart = getWindowStart(timestamp);
            queueMessage({
              windowStart,
              assetId,
              market,
              eventType: data.event_type,
              timestamp,
              messageData: JSON.stringify(data),
            });
          }
        } catch (error) {
          // Silently handle parse errors
        }
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      
      ws.onclose = () => {
        activeConnections.delete(connectionKey);
        // Flush any remaining messages
        if (messageQueue.length > 0) {
          flushBatch();
        }
      };
      
      activeConnections.set(connectionKey, ws);
      
      return NextResponse.json({ 
        success: true, 
        message: "Started capturing historical data" 
      });
    }
    
    if (action === "stop") {
      const { assetIds } = await request.json();
      const connectionKey = assetIds ? assetIds.sort().join(",") : null;
      
      if (connectionKey && activeConnections.has(connectionKey)) {
        const ws = activeConnections.get(connectionKey);
        ws?.close();
        activeConnections.delete(connectionKey);
        
        // Flush any remaining messages
        if (messageQueue.length > 0) {
          flushBatch();
        }
        
        return NextResponse.json({ 
          success: true, 
          message: "Stopped capturing" 
        });
      }
      
      // Stop all connections
      for (const ws of activeConnections.values()) {
        ws.close();
      }
      activeConnections.clear();
      
      // Flush any remaining messages
      if (messageQueue.length > 0) {
        flushBatch();
      }
      
      return NextResponse.json({ 
        success: true, 
        message: "Stopped all captures" 
      });
    }
    
    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error in capture endpoint:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Cleanup on process exit
if (typeof process !== "undefined") {
  process.on("beforeExit", () => {
    for (const ws of activeConnections.values()) {
      ws.close();
    }
    if (messageQueue.length > 0) {
      flushBatch();
    }
  });
}

