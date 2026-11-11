#!/usr/bin/env bash
# Deploys Plunk to a network you sign for: publishes the coin by hash, deploys + inits the launchpad,
# and registers it with wNEAR. Nothing here holds keys; `near` signs from your keychain.
#
# Usage:  NET=testnet ACCOUNT=plunk.testnet OWNER=plunk.testnet bash scripts/deploy.sh <step>
#   steps: build | publish | deploy | register | config | all
# Mainnet: NET=mainnet ACCOUNT=plunk.near (publishing the coin burns ≈1e-4 NEAR per byte, ≈21 NEAR).
set -euo pipefail
: "${NET:=testnet}"
: "${ACCOUNT:?set ACCOUNT to the launchpad account, e.g. plunk.testnet}"
: "${OWNER:=$ACCOUNT}"
: "${CREATION_FEE:=500000000000000000000000}"   # 0.5 NEAR, FR-002: covers the coin's storage
case "$NET" in
  testnet) EXCHANGE=ref-finance-101.testnet; WNEAR=wrap.testnet ;;
  mainnet) EXCHANGE=v2.ref-finance.near;     WNEAR=wrap.near ;;
  *) echo "NET must be testnet or mainnet"; exit 1 ;;
esac
SIGN="network-config $NET sign-with-keychain send"
COIN=target/near/plunk_coin/plunk_coin.wasm
LP=target/near/plunk_launchpad/plunk_launchpad.wasm
export PATH="$HOME/.cargo/bin:$PATH"

coin_hash() { # sha256 of the coin wasm, base58 (what `coin_code_hash` and `use-global-hash` take)
  python3 -I - "$COIN" <<'EOF'
import hashlib, sys
d = hashlib.sha256(open(sys.argv[1], "rb").read()).digest()
A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n = int.from_bytes(d, "big"); s = ""
while n: n, r = divmod(n, 58); s = A[r] + s
print("1" * (len(d) - len(d.lstrip(b"\0"))) + s)
EOF
}

step=${1:-all}
run() { [ "$step" = all ] || [ "$step" = "$1" ]; }

if run build; then
  (cd contracts/coin && cargo near build non-reproducible-wasm)
  (cd contracts/launchpad && cargo near build non-reproducible-wasm)
  ls -la "$COIN" "$LP"
fi
if run publish; then
  echo "coin hash: $(coin_hash)"
  near contract deploy-as-global use-file "$COIN" as-global-hash "$ACCOUNT" $SIGN
fi
if run deploy; then
  ARGS=$(printf '{"owner":"%s","coin_code_hash":"%s","exchange":"%s","wnear":"%s","creation_fee":"%s"}' "$OWNER" "$(coin_hash)" "$EXCHANGE" "$WNEAR" "$CREATION_FEE")
  near contract deploy "$ACCOUNT" use-file "$LP" with-init-call new json-args "$ARGS" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' $SIGN
fi
if run register; then
  for a in "$ACCOUNT" "$EXCHANGE"; do
    near contract call-function as-transaction "$WNEAR" storage_deposit json-args "{\"account_id\":\"$a\",\"registration_only\":true}" \
      prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as "$ACCOUNT" $SIGN
  done
fi
if run config; then
  near contract call-function as-read-only "$ACCOUNT" get_config json-args '{}' network-config "$NET" now
  echo "Set launchpadPerNetwork.$NET = \"$ACCOUNT\" in app/config.ts"
fi
