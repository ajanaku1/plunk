#!/usr/bin/env bash
# K1 kill test (T006): does 1Click deliver Solana USDC into a NEAR contract with a message?
# Usage: ME=you.near SOL=<your Solana address> bash stub/k1.sh <step>
#   steps: setup | quote | status <depositAddress> | logs
set -euo pipefail
: "${ME:?set ME to your mainnet account, e.g. ME=you.near}"
STUB="k1stub.$ME"
NET="network-config mainnet sign-with-keychain send"
WASM="$(dirname "$0")/../target/near/plunk_stub/plunk_stub.wasm"

case "${1:-}" in
  setup)  # 3 transactions, ~1.5 NEAR total (mostly contract storage; recoverable by deleting the account later)
    near account create-account fund-myself "$STUB" '1.5 NEAR' autogenerate-new-keypair save-to-keychain sign-as "$ME" $NET
    near contract deploy "$STUB" use-file "$WASM" without-init-call $NET
    # wrap.near must know the stub before it can receive wNEAR
    near contract call-function as-transaction wrap.near storage_deposit json-args "{\"account_id\":\"$STUB\"}" \
      prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as "$ME" $NET ;;
  quote)  # real (non-dry) quote: prints the Solana deposit address to send 1 USDC to
    : "${SOL:?set SOL to your Solana address (refunds go there)}"
    DEADLINE=$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ)
    MSG="{\"box_id\":\"0\",\"kind\":\"xchain\",\"recipient\":\"$ME\"}"
    curl -s -X POST https://1click.chaindefuser.com/v0/quote -H 'content-type: application/json' -d "$(cat <<EOF
{"dry":false,"swapType":"EXACT_INPUT","slippageTolerance":100,
 "originAsset":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
 "depositType":"ORIGIN_CHAIN","destinationAsset":"nep141:wrap.near","amount":"1000000",
 "refundTo":"$SOL","refundType":"ORIGIN_CHAIN","recipient":"$STUB","recipientType":"DESTINATION_CHAIN",
 "customRecipientMsg":$(printf '%s' "$MSG" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),
 "deadline":"$DEADLINE"}
EOF
)" | python3 -m json.tool ;;
  status)
    curl -s "https://1click.chaindefuser.com/v0/status?depositAddress=${2:?pass the depositAddress}" | python3 -m json.tool ;;
  logs)
    echo "Open https://nearblocks.io/address/$STUB and look for a log line starting with 'K1 token=wrap.near'" ;;
  *) echo "steps: setup | quote | status <depositAddress> | logs"; exit 1 ;;
esac
