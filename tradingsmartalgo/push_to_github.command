#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Pushing to GitHub..."
git add -A
git commit -m "Fix trade count mismatch — orders and counts now always match

- Removed pre-populated fake orders on page load
- All orders now come only from live trading engine
- Broker trade count computed from sum of strategy trades (single source of truth)
- No more duplicate counting between broker.trades and strategy.trades
- Order timestamps use broker's local timezone
- Recent orders and trades today number always match exactly"
git push origin main
echo "✅ Pushed!"
read -p "Press Enter to close..."
