# Pause Main App Feature

This feature allows you to pause the main app's WebSocket connections and API calls to allocate resources to the Market Maker.

## How to Use

### Enable Pause Mode

Add this to your `.env` file (or `.env.local`):

```bash
NEXT_PUBLIC_PAUSE_MAIN_APP=true
```

### Disable Pause Mode

Set it to `false` or remove the variable:

```bash
NEXT_PUBLIC_PAUSE_MAIN_APP=false
```

## What Gets Paused

When `NEXT_PUBLIC_PAUSE_MAIN_APP=true`, the following are disabled:

1. **WebSocket Connections:**
   - RTDS WebSocket (real-time price feeds)
   - CLOB WebSocket (orderbook data)
   - Historical data capture WebSocket

2. **API Calls:**
   - Market data fetching (`/api/markets`)
   - Reference price fetching
   - All other main app API requests

3. **Visual Indicators:**
   - A yellow banner appears at the top of the page indicating pause mode
   - Connection status shows as "disconnected"

## What Still Works

- Market Maker page (`/market-maker`) continues to work normally
- All Market Maker WebSocket connections remain active
- Market Maker API calls continue to function

## Restart Required

After changing the environment variable, you need to restart your Next.js development server:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

## Use Cases

- **Resource Allocation**: When running the Market Maker intensively, pause the main app to allocate more resources
- **Testing**: Isolate Market Maker testing without main app interference
- **Performance**: Reduce overall resource usage when focusing on Market Maker development

## Notes

- The pause flag only affects the main app (`/` page)
- Market Maker (`/market-maker`) is not affected by this flag
- The flag is checked at runtime, so you can toggle it without code changes (just restart the server)
