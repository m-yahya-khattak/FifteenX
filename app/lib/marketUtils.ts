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

