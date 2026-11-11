#!/usr/bin/env bash
# K2 kill test (T007) on mainnet: publish the 450-byte tiny contract globally from plunk.near,
# instantiate it on k2.plunk.near by hash, and call it. Cost ~0.15 NEAR (0.1 of it is in k2.plunk.near).
# Usage: bash tiny/k2.sh   (run from the Plunk folder)
set -euo pipefail
W=target/wasm32-unknown-unknown/release/plunk_tiny.wasm
HASH=FFjMkAkxVdCTduWvydeYR3FsaKexnSn2n3fVuVMCHTTa   # same bytes as the testnet publish
PATH="$HOME/.cargo/bin:$PATH" cargo build -p plunk-tiny --target wasm32-unknown-unknown --release -q
near contract deploy-as-global use-file "$W" as-global-hash plunk.near network-config mainnet sign-with-keychain send
near account create-account fund-myself k2.plunk.near '0.1 NEAR' autogenerate-new-keypair save-to-keychain sign-as plunk.near network-config mainnet sign-with-keychain send
near contract deploy k2.plunk.near use-global-hash "$HASH" without-init-call network-config mainnet sign-with-keychain send
near contract call-function as-transaction k2.plunk.near ping json-args '{}' prepaid-gas '10 Tgas' attached-deposit '0 NEAR' sign-as k2.plunk.near network-config mainnet sign-with-keychain send
