//! Bids, late deposits and the automatic reveal (FR-004–007, FR-028, research R10/R11).
use crate::clearing::MAX_BIDS;
use crate::types::{LaunchBox, Phase};
use crate::{events, Launchpad, LaunchpadExt};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};
use near_sdk::{env, near, require, AccountId, PromiseOrValue};

pub const REVEAL_NS: u64 = 60_000_000_000;
pub const MAX_TLOCK_LEN: usize = 1024;
const COMMIT_DOMAIN: &[u8] = b"plunk:v1";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BidKind {
    /// `commit` is lowercase hex of the R10 sha256. `tlock` is dropped on reveal to free storage.
    Sealed { commit: String, tlock: Option<String>, revealed_price: Option<U128> },
    Market,
    XChain,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Bid {
    pub id: u32,
    /// Who paid: the wallet, or `intents.near` for cross-chain bids.
    pub bidder: AccountId,
    /// Who receives coins and refunds.
    pub recipient: AccountId,
    pub budget: U128,
    pub kind: BidKind,
    /// Set at Open: coins won (smallest units) and NEAR refunded.
    pub tokens: U128,
    pub refund: U128,
    pub coins_paid: bool,
    pub refund_paid: bool,
}

/// What anyone may see before Reveal (FR-005): no prices.
#[near(serializers = [json])]
pub struct PublicTotals {
    pub total_in: U128,
    pub bidder_count: u32,
    pub bid_count: u32,
    pub close_at: u64,
    pub reveal_end: u64,
    pub phase: Phase,
}

#[near(serializers = [json])]
pub struct SealedView {
    pub bid_id: u32,
    pub bidder: AccountId,
    pub tlock: String,
}

/// R10: sha256("plunk:v1" ‖ box_id u64 LE ‖ len(account) u32 LE ‖ account ‖ max_price u128 LE ‖ salt).
pub fn commit_hash(box_id: u64, account: &AccountId, max_price: u128, salt: &[u8; 32]) -> [u8; 32] {
    let a = account.as_bytes();
    let mut pre = Vec::with_capacity(COMMIT_DOMAIN.len() + 8 + 4 + a.len() + 16 + 32);
    pre.extend_from_slice(COMMIT_DOMAIN);
    pre.extend_from_slice(&box_id.to_le_bytes());
    pre.extend_from_slice(&(a.len() as u32).to_le_bytes());
    pre.extend_from_slice(a);
    pre.extend_from_slice(&max_price.to_le_bytes());
    pre.extend_from_slice(salt);
    env::sha256_array(&pre)
}

pub fn reveal_end(b: &LaunchBox) -> u64 {
    if b.sealed_count > 0 { b.close_at + REVEAL_NS } else { b.close_at }
}

fn is_hex32(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn unhex32(s: &str) -> Option<[u8; 32]> {
    let mut out = [0u8; 32];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(s.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    s.len().eq(&64).then_some(out)
}

/// The box id may arrive as a number or, from 1Click's `customRecipientMsg`, as a string.
fn box_id_of(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}

/// A parsed bid message, or the account a bad deposit should be credited to.
struct Parsed {
    box_id: u64,
    recipient: AccountId,
    kind: BidKind,
}

fn parse_msg(sender: &AccountId, msg: &str) -> Result<Parsed, AccountId> {
    let v: Value = serde_json::from_str(msg).map_err(|_| sender.clone())?;
    let xchain_recipient = v["recipient"].as_str().and_then(|r| r.parse::<AccountId>().ok());
    let fallback = match v["kind"].as_str() {
        Some("xchain") => xchain_recipient.clone().unwrap_or_else(|| sender.clone()),
        _ => sender.clone(),
    };
    let box_id = box_id_of(&v["box_id"]).ok_or_else(|| fallback.clone())?;
    let (recipient, kind) = match v["kind"].as_str() {
        Some("market") => (sender.clone(), BidKind::Market),
        Some("xchain") => (xchain_recipient.ok_or_else(|| fallback.clone())?, BidKind::XChain),
        Some("sealed") => {
            let commit = v["commit"].as_str().filter(|c| is_hex32(c)).ok_or_else(|| fallback.clone())?;
            let tlock = v["tlock"].as_str().map(str::to_owned);
            if tlock.as_ref().is_some_and(|t| t.len() > MAX_TLOCK_LEN) {
                return Err(fallback);
            }
            (sender.clone(), BidKind::Sealed { commit: commit.to_owned(), tlock, revealed_price: None })
        }
        _ => return Err(fallback),
    };
    Ok(Parsed { box_id, recipient, kind })
}

#[near]
impl FungibleTokenReceiver for Launchpad {
    /// FR-028: wNEAR is never bounced. Anything that can't become a bid is credited as a late
    /// deposit to the named recipient (cross-chain) or the sender. Other tokens are returned.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        if env::predecessor_account_id() != self.config.wnear {
            return PromiseOrValue::Value(amount);
        }
        if let Err(to) = parse_msg(&sender_id, &msg).and_then(|p| self.place_bid(&sender_id, amount.0, p)) {
            self.credit_late(to, amount.0);
        }
        PromiseOrValue::Value(U128(0))
    }
}

#[near]
impl Launchpad {
    /// FR-007: anyone may reveal during Reveal; the commit is the only check, so a revealer can
    /// withhold but never forge.
    pub fn reveal(&mut self, box_id: u64, bid_id: u32, max_price: U128, salt: String) {
        let b = self.boxes.get(&box_id).expect("no such box");
        let now = env::block_timestamp();
        require!(b.phase == Phase::Bidding && now >= b.close_at && now < reveal_end(b), "not in reveal");
        let salt = unhex32(&salt).expect("salt must be 32 bytes of hex");
        let mut bid = self.bids.get(&(box_id, bid_id)).cloned().expect("no such bid");
        let BidKind::Sealed { commit, revealed_price, .. } = &bid.kind else { env::panic_str("not a sealed bid") };
        require!(revealed_price.is_none(), "already revealed");
        let want = commit_hash(box_id, &bid.bidder, max_price.0, &salt);
        require!(unhex32(commit) == Some(want), "commit mismatch");
        bid.kind = BidKind::Sealed { commit: commit.clone(), tlock: None, revealed_price: Some(max_price) };
        self.bids.insert((box_id, bid_id), bid);
        events::emit("revealed", &serde_json::json!({ "box_id": box_id, "bid_id": bid_id, "max_price": max_price }));
    }

    pub fn get_public_totals(&self, box_id: u64) -> Option<PublicTotals> {
        let b = self.boxes.get(&box_id)?;
        Some(PublicTotals {
            total_in: b.total_in,
            bidder_count: b.bidder_count,
            bid_count: b.bid_count,
            close_at: b.close_at,
            reveal_end: reveal_end(b),
            phase: b.phase,
        })
    }

    /// Bids whose coins and refunds go to `account`.
    pub fn get_bids(&self, box_id: u64, account: AccountId) -> Vec<Bid> {
        let ids = self.bids_by_recipient.get(&(box_id, account)).cloned().unwrap_or_default();
        ids.iter().filter_map(|i| self.bids.get(&(box_id, *i)).cloned()).collect()
    }

    /// Unrevealed sealed bids with their timelock ciphertexts, for the app and keeper to decrypt.
    pub fn get_sealed(&self, box_id: u64, from: u32, limit: u32) -> Vec<SealedView> {
        let count = self.boxes.get(&box_id).map_or(0, |b| b.bid_count);
        (from..count.min(from.saturating_add(limit)))
            .filter_map(|i| {
                let bid = self.bids.get(&(box_id, i))?;
                match &bid.kind {
                    BidKind::Sealed { tlock: Some(t), revealed_price: None, .. } => {
                        Some(SealedView { bid_id: i, bidder: bid.bidder.clone(), tlock: t.clone() })
                    }
                    _ => None,
                }
            })
            .collect()
    }

    pub fn get_late(&self, account_id: AccountId) -> U128 {
        U128(self.late.get(&account_id).copied().unwrap_or(0))
    }
}

impl Launchpad {
    fn place_bid(&mut self, sender: &AccountId, amount: u128, p: Parsed) -> Result<(), AccountId> {
        let reject = || p.recipient.clone();
        let b = self.boxes.get_mut(&p.box_id).ok_or_else(reject)?;
        let open = b.phase == Phase::Bidding && env::block_timestamp() < b.close_at;
        if !open || b.bid_count as usize >= MAX_BIDS {
            return Err(reject());
        }
        let id = b.bid_count;
        b.bid_count += 1;
        b.total_in = U128(b.total_in.0 + amount);
        if matches!(p.kind, BidKind::Sealed { .. }) {
            b.sealed_count += 1;
        }
        let key = (p.box_id, p.recipient.clone());
        let mut mine = self.bids_by_recipient.get(&key).cloned().unwrap_or_default();
        if mine.is_empty() {
            b.bidder_count += 1;
        }
        let kind_name = match p.kind { BidKind::Sealed { .. } => "sealed", BidKind::Market => "market", BidKind::XChain => "xchain" };
        let event = serde_json::json!({ "box_id": p.box_id, "kind": kind_name, "total_in": b.total_in, "bidder_count": b.bidder_count });
        mine.push(id);
        self.bids_by_recipient.insert(key, mine);
        let bid = Bid { id, bidder: sender.clone(), recipient: p.recipient, budget: U128(amount), kind: p.kind, tokens: U128(0), refund: U128(0), coins_paid: false, refund_paid: false };
        self.bids.insert((p.box_id, id), bid);
        events::emit("bid_placed", &event);
        Ok(())
    }

    pub(crate) fn credit_late(&mut self, to: AccountId, amount: u128) {
        let total = self.late.get(&to).copied().unwrap_or(0) + amount;
        self.late.insert(to.clone(), total);
        events::emit("late_credited", &serde_json::json!({ "account_id": to, "amount": U128(amount) }));
    }
}
