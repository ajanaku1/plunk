#!/usr/bin/env bash
# K3 kill test (T008) on mainnet: one ~$1 swap through the Rhea router with Plunk's app fee on,
# to settle what appFeeRate=10 means (docs say "per mille" but their example says 0.1%).
# Usage: bash kill/k3.sh <setup|swap|fee>     Spends: 0.25 NEAR swapped to ~0.93 USDC (kept) + ~0.02 NEAR storage.
set -euo pipefail
ME=plunk.near; AGG=aggregatedex.near
USDC=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
AMT=250000000000000000000000   # 0.25 NEAR in yocto
NET=(network-config mainnet sign-with-keychain send)
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "$4" attached-deposit "$5" sign-as $ME "${NET[@]}"; }
fee_balance() { near contract call-function as-read-only $AGG query_user_exist_balance json-args "{\"user\":\"$ME\",\"from_index\":0,\"count\":100}" network-config mainnet now 2>&1 | sed -n '/return value/,$p'; }

case "${1:-}" in
  setup)  # register plunk.near on wrap.near, USDC and the router, then wrap 0.25 NEAR
    call wrap.near storage_deposit "{\"account_id\":\"$ME\"}" '30 Tgas' '0.00125 NEAR'
    call $USDC storage_deposit "{\"account_id\":\"$ME\"}" '30 Tgas' '0.00125 NEAR'
    call $AGG tokens_storage_deposit "{\"user\":\"$ME\",\"tokens\":[\"wrap.near\",\"usdt.tether-token.near\",\"$USDC\"]}" '30 Tgas' '0.015 NEAR'
    call wrap.near near_deposit '{}' '30 Tgas' '0.25 NEAR' ;;
  swap)   # fresh route with appFeeRate=10 and plunk.near as fee recipient, then execute it
    echo "fee balance BEFORE:"; fee_balance
    Q=$(curl -s "https://smartx.rhea.finance/swapMultiDexPath?amountIn=$AMT&tokenIn=wrap.near&tokenOut=$USDC&slippage=0.01&user=$ME&appFeeRate=10&appFeeRecipient=$ME")
    MSG=$(printf '%s' "$Q" | python3 -c 'import json,sys;r=json.load(sys.stdin);r=r.get("result_data",r);print(json.dumps({"msg":r["msg"],"signature":r["signature"]}))')
    ARGS=$(python3 -c 'import json,sys;print(json.dumps({"receiver_id":"aggregatedex.near","amount":sys.argv[1],"msg":sys.argv[2]}))' "$AMT" "$MSG")
    call wrap.near ft_transfer_call "$ARGS" '300 Tgas' '1 yoctoNEAR'
    echo "fee balance AFTER:"; fee_balance ;;
  fee)    fee_balance ;;
  *) echo "steps: setup | swap | fee"; exit 1 ;;
esac
