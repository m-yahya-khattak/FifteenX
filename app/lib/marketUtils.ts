/**
 * Calculate the current 15-minute interval timestamp
 * Markets start at :00, :15, :30, :45 of each hour
 */
export function getCurrent15MinInterval(): number {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  
  // Round down to nearest 15-minute mark
  const intervalMinutes = Math.floor(minutes / 15) * 15;
  
  // Create new date with rounded minutes
  const intervalTime = new Date(now);
  intervalTime.setMinutes(intervalMinutes, 0, 0);
  
  // Convert to Unix timestamp (seconds)
  return Math.floor(intervalTime.getTime() / 1000);
}

/**
 * Generate market slug for a given timestamp
 */
export function generateMarketSlug(timestamp: number): string {
  return `btc-updown-15m-${timestamp}`;
}

/**
 * Get timestamps for current, previous, and next intervals
 */
export function getIntervalTimestamps() {
  const current = getCurrent15MinInterval();
  const previous = current - 900; // 15 minutes ago (15 * 60 seconds)
  const next = current + 900; // 15 minutes from now
  
  return {
    current,
    previous,
    next,
  };
}

/**
 * Try to fetch market for a given timestamp
 */
export async function fetchMarketByTimestamp(timestamp: number) {
  const slug = generateMarketSlug(timestamp);
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets/slug/${slug}`,
      {
        cache: "no-store",
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, market: data, slug };
    }
    return { success: false, slug };
  } catch (error) {
    return { success: false, slug, error };
  }
}

/**
 * Find the active 15-minute BTC market
 * Tries current interval, then previous, then next
 */
export async function findActiveMarket() {
  const { current, previous, next } = getIntervalTimestamps();
  
  // Try current interval first
  let result = await fetchMarketByTimestamp(current);
  if (result.success && result.market) {
    return result;
  }
  
  // Try previous interval (market might have just started)
  result = await fetchMarketByTimestamp(previous);
  if (result.success && result.market) {
    return result;
  }
  
  // Try next interval (market might be upcoming)
  result = await fetchMarketByTimestamp(next);
  if (result.success && result.market) {
    return result;
  }
  
  return { success: false, error: "No active market found" };
}

/**
 * Extract timestamp from market slug
 * Format: btc-updown-15m-{timestamp}
 */
export function extractTimestampFromSlug(slug: string): number | null {
  const match = slug.match(/btc-updown-15m-(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Fetch historical BTC price from Chainlink at a specific timestamp
 * Falls back to CoinGecko if Chainlink doesn't work
 */
export async function fetchHistoricalBTCPrice(timestamp: number): Promise<{
  success: boolean;
  price: number | null;
  source: string;
  error?: string;
}> {
  // Convert Unix timestamp (seconds) to milliseconds for Date
  const date = new Date(timestamp * 1000);
  
  console.log(`\n=== FETCHING HISTORICAL BTC PRICE ===`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Date: ${date.toISOString()}`);

  // Try Chainlink first
  try {
    // Chainlink Data Streams API - try to get historical price
    // Note: Chainlink's exact historical endpoint may vary
    // Trying common patterns
    const chainlinkEndpoints = [
      `https://data.chain.link/api/streams/btc-usd/history?timestamp=${timestamp}`,
      `https://data.chain.link/api/streams/btc-usd?timestamp=${timestamp}`,
      `https://data.chain.link/api/v1/btc-usd/history?timestamp=${timestamp}`,
    ];

    for (const endpoint of chainlinkEndpoints) {
      try {
        console.log(`Trying Chainlink endpoint: ${endpoint}`);
        const response = await fetch(endpoint, {
          cache: "no-store",
          headers: {
            "Accept": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Chainlink response:", JSON.stringify(data, null, 2));
          
          // Try to extract price from various possible response structures
          const price = data?.price || 
                       data?.data?.price || 
                       data?.result?.price ||
                       data?.value ||
                       parseFloat(data?.data);
          
          if (price && !isNaN(price) && price > 0) {
            console.log(`✓ Found price from Chainlink: $${price}`);
            return {
              success: true,
              price: parseFloat(price),
              source: "chainlink",
            };
          }
        }
      } catch (chainlinkError) {
        console.log(`Chainlink endpoint failed: ${endpoint}`);
        continue;
      }
    }
  } catch (error) {
    console.log("Chainlink fetch failed:", error);
  }

  // Fallback to CoinGecko
  try {
    console.log("Falling back to CoinGecko...");
    // CoinGecko historical price endpoint
    // Format: /coins/bitcoin/history?date=DD-MM-YYYY
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const [year, month, day] = dateStr.split('-');
    const coingeckoDate = `${day}-${month}-${year}`; // DD-MM-YYYY
    
    // For more precise data, use market_chart with timestamp
    const timestampMs = timestamp * 1000;
    const coingeckoEndpoint = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${timestamp - 60}&to=${timestamp + 60}`;
    
    console.log(`CoinGecko endpoint: ${coingeckoEndpoint}`);
    const response = await fetch(coingeckoEndpoint, {
      cache: "no-store",
      headers: {
        "Accept": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log("CoinGecko response structure:", Object.keys(data));
      
      // CoinGecko returns prices array: [[timestamp, price], ...]
      if (data.prices && Array.isArray(data.prices) && data.prices.length > 0) {
        // Find the closest price to our timestamp
        let closestPrice = data.prices[0];
        let minDiff = Math.abs(data.prices[0][0] - timestampMs);
        
        for (const [ts, price] of data.prices) {
          const diff = Math.abs(ts - timestampMs);
          if (diff < minDiff) {
            minDiff = diff;
            closestPrice = [ts, price];
          }
        }
        
        const price = closestPrice[1];
        if (price && !isNaN(price) && price > 0) {
          console.log(`✓ Found price from CoinGecko: $${price}`);
          return {
            success: true,
            price: parseFloat(price),
            source: "coingecko",
          };
        }
      }
      
      // Alternative: try the history endpoint
      const historyEndpoint = `https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${coingeckoDate}`;
      const historyResponse = await fetch(historyEndpoint, {
        cache: "no-store",
      });
      
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        const price = historyData?.market_data?.current_price?.usd;
        if (price && !isNaN(price) && price > 0) {
          console.log(`✓ Found price from CoinGecko history: $${price}`);
          return {
            success: true,
            price: parseFloat(price),
            source: "coingecko_history",
          };
        }
      }
    }
  } catch (error) {
    console.log("CoinGecko fetch failed:", error);
    return {
      success: false,
      price: null,
      source: "none",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  console.log("✗ Could not fetch historical price from any source");
  return {
    success: false,
    price: null,
    source: "none",
    error: "No historical price data available",
  };
}

