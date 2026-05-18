#!/usr/bin/env bash
# Verify Slack bot token and channel before deploying GhostStack.
# Usage: ./scripts/verify-slack.sh xoxb-your-token C0B0YHKH4QM
set -euo pipefail
TOKEN="${1:?Usage: $0 <SLACK_BOT_TOKEN> <CHANNEL_ID>}"
CHANNEL="${2:?Usage: $0 <SLACK_BOT_TOKEN> <CHANNEL_ID>}"

echo "== auth.test =="
AUTH=$(curl -sS -H "Authorization: Bearer $TOKEN" https://slack.com/api/auth.test)
echo "$AUTH" | python3 -m json.tool 2>/dev/null || echo "$AUTH"
echo "$AUTH" | grep -q '"ok":true' || { echo "auth.test failed"; exit 1; }

echo ""
echo "== chat.postMessage (probe) =="
POST=$(curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"$CHANNEL\",\"text\":\"GhostStack verify-slack probe\"}")
echo "$POST" | python3 -m json.tool 2>/dev/null || echo "$POST"
echo "$POST" | grep -q '"ok":true' || { echo "chat.postMessage failed — invite bot to channel or fix channel ID"; exit 1; }

echo ""
echo "Slack OK for channel $CHANNEL"
