#!/usr/bin/env bash
# Plunk — done predicates.
#
# Done means this script exits 0. Nothing else counts: not a session's summary,
# not a checked-off task list, not "it looked right when I ran it."
#
# THIS FILE STARTS RED. On a fresh scaffold every check fails because nothing is
# built yet. That is correct and expected.
#
# NEVER weaken a check to make it pass. If a predicate is wrong, fix the
# predicate deliberately and say so; if the build is wrong, fix the build.
#
# Traceability: each check names [FR/SC ids] <- tasks.md T-ids <- design.md <- ideation report.
#
# Usage:
#   ./verify.sh          run every check
#   ./verify.sh phase-2  run only the checks tagged phase-2

set -uo pipefail
cd "$(dirname "$0")"

FILTER="${1:-}"
pass=0; fail=0; executed=0
R=specs/001-plunk-launchpad/research.md

check() {
  local tag="$1" desc="$2"; shift 2
  if [ -n "$FILTER" ] && [ "$tag" != "$FILTER" ]; then return 0; fi
  executed=$((executed + 1))
  if "$@" >/dev/null 2>&1; then
    printf '  PASS  [%s] %s\n' "$tag" "$desc"; pass=$((pass + 1))
  else
    printf '  FAIL  [%s] %s\n' "$tag" "$desc"; fail=$((fail + 1))
  fi
}
checksh() { local tag="$1" desc="$2" cmd="$3"; check "$tag" "$desc" sh -c "$cmd"; }
# cargo test exits 0 when a filter matches no test, so require at least one test to have run.
ctest() { local tag="$1" desc="$2"; shift 2; checksh "$tag" "$desc" "out=\$(cargo test $* 2>&1) && echo \"\$out\" | grep -Eq 'test result: ok\. [1-9]'"; }

echo "== Plunk verify =="

# --- phase-0: kill tests decide fallbacks (T001–T008; plan risk register K1–K4) ---
check   phase-0 "cargo workspace resolves (T001)" cargo metadata --no-deps --format-version 1
checksh phase-0 "K1 1Click delivery result recorded (T006, FR-027)" "grep -Eq '^- \*\*K1 result:\*\* (PASS|FAIL)' $R"
checksh phase-0 "K2 global-contract result recorded (T007, FR-002)" "grep -Eq '^- \*\*K2 result:\*\* (PASS|FAIL)' $R"
checksh phase-0 "K3 router app-fee result recorded (T008, FR-020)" "grep -Eq '^- \*\*K3 result:\*\* (PASS|FAIL)' $R"
checksh phase-0 "K4 Rust/VM result recorded (T005)" "grep -Eq '^- \*\*K4 result:\*\* (PASS|FAIL)' $R"

# --- phase-1: foundations (T009–T015) ---
ctest   phase-1 "clearing worked example: price 0.4, A=C=250M, B,D refunded (SC-001, FR-008)" -p plunk-launchpad clearing_worked_example
ctest   phase-1 "clearing cap + tie pro-rata + all-market (FR-008)" -p plunk-launchpad clearing_
ctest   phase-1 "in-hour buyer earns 0; lowest-balance; rollover (SC-009, FR-018)" -p plunk-coin epoch_
checksh phase-1 "launchpad + coin wasm build (R1)" '(cd contracts/launchpad && cargo near build non-reproducible-wasm) && (cd contracts/coin && cargo near build non-reproducible-wasm) && ls target/near/*/*.wasm'

# --- phase-2: US1 MVP (T016–T021) ---
ctest   phase-2 "sandbox flow: create→bid→reveal→open→claim; 1% fee; failed refunds 100%; no price pre-reveal (SC-002/004/005)" -p integration box_flow -- --ignored
ctest   phase-2 "ft_on_transfer never rejects (FR-028)" -p plunk-launchpad never_rejects
checksh phase-2 "TS math mirrors Rust fixtures (T013)" 'cd app && pnpm exec vitest run lib/math'
checksh phase-2 "app production build succeeds (FR-029/030)" 'cd app && pnpm build'
checksh phase-2 "brand truth recorded (brand gate)" 'test -s brand/BRAND-TRUTH.md'

# --- phase-3: US2 dev tax (T022–T024) ---
ctest   phase-3 "withdraw W at t: holders W*t (rounded up), dev W*(1-t); 90%/45% at 0h/12h (SC-003, FR-023)" -p plunk-launchpad escrow_tax_
ctest   phase-3 "extend rejected mid-window, restarts at 90% after (FR-024)" -p plunk-launchpad escrow_extend_
ctest   phase-3 "treasury per-deposit 7d curve, oldest first (FR-025)" -p plunk-launchpad escrow_treasury_
ctest   phase-3 "split shifts one-way only (FR-019)" -p plunk-launchpad shift_split_

# --- phase-4: US3 trade + earn (T025–T029, T037) ---
ctest   phase-4 "harvest: 20/5/75 by sqrt(k) growth; coin fees cover buyback first; same-epoch no-op; claim pays (FR-016/017/018)" -p integration harvest -- --ignored
checksh phase-4 "keeper typechecks (T027)" 'cd keeper && pnpm exec tsc --noEmit'
checksh phase-4 "hourly workflow at :17 with manual trigger, no inline keys (R6)" 'f=.github/workflows/harvest.yml; test -f $f && grep -q "17 \* \* \* \*" $f && grep -q workflow_dispatch $f && grep -q "secrets.KEEPER_KEY" $f && ! grep -Eq "ed25519:[1-9A-HJ-NP-Za-km-z]{20,}" $f'

# --- phase-5: US4 cross-chain, or the logged K1 cut (T030–T031) ---
checksh phase-5 "xchain route tests green, OR K1 cut logged (FR-027/028)" 'if grep -Eq "^- \*\*K1 result:\*\* FAIL" '"$R"'; then grep -qi "K1 cut" IMPLEMENTATION.md; else cd app && pnpm exec vitest run api/xchain; fi'

# --- phase-6: US5 + submission hygiene (T032–T036) ---
checksh phase-6 "README has do-X-see-Y steps, NEAR tech list, unaudited, design-origin disclosure (FR-032)" 'test -f README.md && grep -qi "unaudited" README.md && grep -qi "darkroom" README.md && grep -qiE "near intents|1click" README.md && grep -qiE "see:" README.md'
check   phase-6 "LICENSE present (Q-014)" test -s LICENSE
checksh phase-6 "contract files gitignored (local tracking)" 'for f in design.md Goal.md prompt.md plan.md; do grep -qx "$f" .gitignore || exit 1; done'
checksh phase-6 "no secrets in tracked sources" 'test -d contracts && test -d app && ! grep -rEIl --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.next "(ed25519:[1-9A-HJ-NP-Za-km-z]{40,}|secp256k1:[1-9A-HJ-NP-Za-km-z]{40,}|BEGIN [A-Z ]*PRIVATE KEY)" contracts app keeper stub .github'
checksh phase-6 "no .env files outside gitignore" 'test -d app && grep -q "^\.env" .gitignore'

echo
if [ "$executed" -eq 0 ]; then
  printf '  FAIL  [filter] no checks matched "%s"; executed 0 predicates\n' "$FILTER"
  fail=$((fail + 1))
fi
printf 'passed %d, failed %d\n' "$pass" "$fail"

cat <<'MANUAL'

manual (not automatable; confirm before calling the build done):
  [ ] Fresh reader completes the README testnet path in < 15 min (SC-006)
  [ ] $PLUNK box live on mainnet; plunk.near owns the locked LP (Goal DoD 3)
  [ ] Demo video < 2 min follows design.md §6; first line states the problem (SC-007)
  [ ] X post: says built at NEAR HACKATHON, tags @NEARProtocol #NEARHackathon, video attached
  [ ] Repo public by 2026-11-14 23:59 UTC; submission payload confirmed by user; API returned 201
  [ ] Sealed bid takes < 1 min of user time (SC-008)
MANUAL

[ "$fail" -eq 0 ] || exit 1
