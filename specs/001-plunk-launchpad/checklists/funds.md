# Funds & Edge-Case Requirements Checklist: Plunk Launchpad

**Purpose**: Unit tests for the requirements covering money flows, state transitions and failure paths. Spec Kit defaults: Standard depth, reviewer audience.
**Created**: 2026-11-02
**Feature**: [spec.md](../spec.md)

Status key: [x] the requirement is adequately written; [ ] it was a gap when generated. Every gap was fixed in the spec the same day, and the resolution is noted after the arrow.

## Requirement Completeness
- [x] CHK001 Is every way NEAR can enter the system (sealed, market, cross-chain, late) given a defined outcome? [Spec §FR-004, FR-027, FR-028]
- [x] CHK002 Is every way NEAR or coins can leave (fills, refunds, dev withdraw, treasury, claims, burn, protocol fees) specified? [Spec §FR-009, FR-012, FR-016, FR-023, FR-025]
- [ ] CHK003 Is the maximum number of bids per box specified, given that clearing cost grows with bids? [Gap] → added to FR-008 (cap of 200 bids per box; the 201st is credited as a claimable refund).
- [ ] CHK004 Is a terminal path defined for a box stuck in Opening (repeated pool failures)? [Gap, Spec §FR-014] → FR-014 now says: after 24h in Opening, the box becomes Failed and all bids are refundable.
- [ ] CHK005 Is it specified who may withdraw treasury tokens? [Gap, Spec §FR-025] → FR-025 now says the coin's dev.
- [x] CHK006 Is the creation fee stated to the dev before they commit? [Spec §FR-002]

## Requirement Clarity
- [ ] CHK007 Is the rounding direction for tax and fee splits specified at the smallest unit? [Ambiguity, Spec §SC-003] → FR-023 now rounds the holder side up (in holders' favour). FR-016 now gives rounding dust to holders.
- [x] CHK008 Is "lowest balance during the hour" defined, with "hour" as a precise boundary? [Spec §FR-018, Clarifications]
- [x] CHK009 Is the clearing rule stated precisely enough to compute by hand? [Spec §FR-008, worked example]
- [x] CHK010 Are the tax start (90%), shape (linear) and end (0%) quantified? [Spec §FR-023]

## Requirement Consistency
- [x] CHK011 Do the fee fractions (20/5/75) agree between FR-016, Assumptions and the $PLUNK example? [Spec §FR-016, Assumptions]
- [x] CHK012 Is the fixed-fee rule (FR-019) consistent with the dev panel's actions (FR-031)? [Spec §FR-019, FR-031]
- [x] CHK013 Is the 5-minute cross-chain cutoff consistent between FR-027 and the User Story 4 scenarios? [Spec §FR-027, US4]

## Scenario & Edge-Case Coverage
- [ ] CHK014 Is the outcome defined for an hour in which no account is eligible (eligible supply is 0)? [Gap, Spec §FR-018] → FR-018 now says the pot rolls over.
- [ ] CHK015 Are coins held inside the DEX (users' exchange deposits, LP) stated as ineligible? [Gap] → added to Edge Cases.
- [x] CHK016 Is the dev's own fill excluded from holder rewards while it sits in escrow? [Spec §FR-022, FR-018: escrow is held by excluded accounts]
- [x] CHK017 Are unrevealed bids, lost salts and below-price bids covered? [Spec §FR-009]
- [x] CHK018 Is the all-market-bids (no sealed bids) case covered? [Spec §Edge Cases]
- [x] CHK019 Is a cross-chain recipient that doesn't exist handled before any funds move? [Spec §Edge Cases]

## Non-Functional
- [x] CHK020 Is confidentiality of bid prices before Reveal stated as an absolute? [Spec §FR-005, SC-002]
- [ ] CHK021 Are accessibility requirements intentionally excluded or specified? [Gap] → Assumptions now say: WCAG basics (contrast, keyboard access to bid, claim and withdraw); full audit out of scope.
- [x] CHK022 Is the "unaudited" disclosure required? [Spec §FR-032]

## Dependencies & Assumptions
- [x] CHK023 Are the DEX fee immutability and the admin-fee share documented as external facts with dates? [Spec §Assumptions, research R3]
- [x] CHK024 Is the experimental status of cross-chain delivery and its cut date recorded? [Spec §Assumptions]
- [x] CHK025 Is the platform minimum-raise floor value fixed and changeable only for future boxes? [Spec §FR-010]
