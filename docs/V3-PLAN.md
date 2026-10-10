# DemandOne V3 — Audit & Migration Plan

Branch: `demandone-v3` · V2 preserved at commit `e6bbcdf`, tag `v2.0`.
Status: **proposal, awaiting approval.** Nothing below is implemented yet.

---

## 1. V2 audit

V2 is an Expo Router app (Expo 57, RN 0.86, web + native), ~8k lines. It type-checks cleanly.
There are no tests. Everything runs on mock data.

### 1.1 What V2 gets right (keep)

| Asset | Why it's worth keeping |
|---|---|
| **Single write path** (`data/service.ts` → `store.setState`) | Screens never mutate state directly, and every write is an async function shaped like a backend mutation. This is the right seam for real APIs later. |
| **`computeFit`** (`data/matching.ts`) | A pure, explainable score built from the user's ranked Standard of Value. It gives plain-language reasons, not a black-box percentage. |
| **Hard vs. soft constraints** | Timing works as a gate (`passesHardConstraints`). Budget, expertise, distance and trust are the weighted preferences. |
| **Intent interpreter** (`data/intents.ts`) | A rule-based, pure function that never dead-ends. It's easy to swap for an LLM behind the same interface. |
| **Voice module** (`data/voice.ts`) | Already isolated: real SpeechRecognition on web, a simulated transcript elsewhere. |
| **`CapabilityProfile` ≠ `Offer`** | This is already the correct product rule: capabilities inform matching and never auto-post. |
| **Fee model + disclosure** (`data/pricing.ts`) | Fees are 5% buyer / 10% seller, and the displayed price is all-in. |
| **Visual identity** (`theme.ts`, Fraunces, cream/pine/amber) | The brand foundation stays. The system around it gets refined. |
| `base.tsx` primitives, `LocationPicker`, `IntroAnimation`, `MarketField` | These are stable and reusable with light restyling. |

### 1.2 Defects found (fix)

**Identity & persistence**
1. **A new user inherits a fake person.** The viewer is the seeded `nadia` record: Miami, 3 needs, 1 offer, 9 completed jobs, a bio, a past booking with Claire, a household (Lyanne, Sebi), and two Visa/Amex cards. `setIdentity` overwrites only `name`/`email`, so initials stay "NP" and everything else carries over.
2. The login form pre-fills `Miami, FL`.
3. `index.tsx` always plays the intro and routes to `/login`. Returning users are never recognized.
4. State is persisted under an unversioned key (`demandone-v2-state`). Any shape change loads stale or broken state. There is no persistence on native.

**Negotiation**
5. **Repeat-tap exploit.** Each "Ask your agent for a better price" tap moves 9% toward the counterpart's bound. When there's no floor, the bound falls back to `$1`, so the user can mash the price down to $1.
6. **`negotiateWithFlexibleTiming` has no guard at all.** Each tap takes another 7% off and adds another +96h to the window, without limit.
7. **Private bounds are leaked.** The counterpart's floor and ceiling are copied onto `Match`/`MatchCard` and rendered in the UI ("$X of room left · could reach $Y"). That destroys the point of a private reservation price.
8. **The user's own mandate is ignored.** Negotiation never reads the viewer's `authority`, `budgetMax` or `priorities`. For example, `authority: 'none'` still negotiates.
9. Negotiation is a chat-bubble transcript of scripted lines ("Can do $X.").
10. `secureCard` books directly at list price, bypassing the mandate and negotiation entirely.

**Transaction lifecycle**
11. **Records are one-sided.** A `Booking` exists only on the viewer's side, so the counterparty has no record of the same transaction.
12. **Seller-side dead end.** When the viewer is the seller, only the buyer can confirm completion, and the buyer is an NPC that never acts. The booking sits in `delivered` forever.
13. **Payment order is contradictory.** The confirmation screen says "Payment held safely" before the user taps "Authorize $X", and that button is only local component state. Payment methods are never tied to a transaction.
14. Feedback is one-way. Nobody ever rates the viewer, and the viewer's own trust never changes. The `live` status is never set.
15. Hard-coded copy and data: "7 min from ask to booking", `joinBundle` → `personId: 'victor'`, the calendar button is local state, and booking messages get canned auto-replies.
16. The agent chat (`/agent`, opened from a FAB on every screen) answers every input with the same canned line. It's a fake feature.

**Data architecture**
17. **Listings are a separate hand-written list.** Exchange `cards` aren't derived from people's `needs`/`offers`, so a Need the viewer posts is never visible to anyone and never matched by any counterparty.
18. **Matching joins by category only.** `viewer.needs.find(n => n.category === card.category)` uses the first need in the category, so two needs in the same category get conflated. Matches aren't linked to a mandate id. `raiseMaximum` raises every need in the category.
19. Trust counters (`completedCount`/`recommendCount`) are stored and incremented by hand rather than derived from transaction history.
20. Dark mode works by mutating a global `colors` object in place. That forces `freezeOnBlur: false` and per-render style recomputation everywhere.

**UX**
21. Today has 7 sections. The Exchange has a segmented control plus 3 filter rows plus fit/value/trust/discovery badges on every card. The charcoal "MarketMoment" panel and the sparklines put negotiation instrumentation on the surface.
22. There are 6 detail screens for one deal (`card`, `match`, `confirmation`, `bundle`, `message`, `agent`), and the user hops between them as the deal progresses.

---

## 2. Preserve / refactor / replace

| Area | Decision |
|---|---|
| `store.ts` | **Refactor**: versioned schema, migrations, async hydration gate, native storage adapter |
| `service.ts` | **Replace**: split into domain services (below). Keep the "single write path" contract. |
| `types.ts` | **Replace**: new domain model (§3) |
| `fixtures.ts` | **Replace**: NPC participants plus *their* mandates only. The viewer starts empty. |
| `matching.ts` | **Refactor**: keep `computeFit` and the trust/expertise math. Match by mandate id, not category. Read trust from the ledger. |
| `intents.ts`, `voice.ts` | **Keep** behind an `IntentInterpreter` interface |
| `myMarket.ts` | **Refactor** into selectors for the new Home (3 sections, not 7) |
| `negotiateMatch`, `negotiateWithFlexibleTiming`, `secureCard`, `joinBundle`, `raiseMaximum` | **Replace** with the negotiation engine (§4) |
| `match/`, `card/`, `confirmation/`, `bundle/`, `message/`, `agent.tsx`, `AgentFab` | **Replace** with `listing/[id]` + `deal/[id]` (one deal, one screen) |
| `theme.ts` | **Refactor**: `ThemeProvider` + `useTheme()`, tokens, tabular numerals, formatters |
| `base.tsx`, `domain.tsx` | **Keep/refactor** into `ui/` primitives + market components |
| Bundles, household, canned messaging | **Cut** from V3 (dummy features with no real mechanics). They can return later on top of the engine. |

---

## 3. V3 architecture

```
src/
  domain/            pure TypeScript, no React, no I/O — fully unit-testable
    identity.ts      Account, PublicProfile
    capability.ts    Capability, Availability
    mandate.ts       Mandate (Need|Offer), validation, public vs private projection
    intent.ts        IntentInterpreter interface + rule-based impl (from intents.ts)
    matching.ts      candidate gen, hard constraints, computeFit, recommendations
    negotiation.ts   state machine + agent strategy (deterministic, seeded)
    transaction.ts   lifecycle state machine + guards
    trust.ts         trust stats DERIVED from ledger events
    payment.ts       escrow model (authorize → capture → release / refund)
    pricing.ts       fees, all-in math
    money.ts         integer cents, formatting
  infra/             mock adapters behind interfaces (swap for real APIs later)
    storage.ts       versioned persistence (localStorage web / AsyncStorage native)
    paymentGateway.ts  MockGateway implements PaymentGateway
    marketSim.ts     NPC counterparty agents: respond, confirm, give feedback, post new demand
    clock.ts         injectable time (tests + simulated delays)
    seed.ts          NPC participants and their mandates (no viewer data)
  services/          the ONLY write path; orchestrates domain + infra; appends ledger events
    account.ts  mandates.ts  deals.ts  transactions.ts  feedback.ts
  state/
    store.ts  selectors.ts  hooks.ts       private fields never leave selectors
  ui/
    tokens.ts  ThemeProvider.tsx  format.ts
    primitives/  (Text, Button, Field, Sheet, Stepper, Disclosure…)
    market/      (MarketEntry, PriceTag, TrustLine, DealTimeline, TermsTable…)
  app/               screens only — read via hooks, write via services
```

**Rules that make it coherent**
- **One `Mandate` type for every listing**, the viewer's and the NPCs'. The Exchange is the set of *other people's open mandates*. A Need the viewer posts is visible to the market simulator and can attract counterparties.
- **Public vs. private projection.** A mandate's `private` block (reservation price, flexibility) is readable only by its owner's agent inside `domain/negotiation.ts`. Selectors return `PublicMandate` to the UI, so a leak becomes a type error.
- **One `Deal` record shared by both sides.** Negotiation and transaction live on the same object, with a `buyerId` and `sellerId`. Each side's view is a projection of it, which makes contradictory buyer/seller records impossible.
- **Append-only ledger.** Every state transition writes an event. History, trust stats and "market memory" are derived from it, not hand-incremented.
- **Money in integer cents.** One formatter for all money (`$1,240`, `$85`).

### 3.1 Core model (abridged)

```ts
Account        { id, name, email, initials, location?, createdAt, onboarding: { identity, capability, values } }
Capability     { summary, categories[], workTypes[], availability: { hoursPerWeek?, windows[] }, locationMode }
Mandate        { id, ownerId, side: 'buy'|'sell', category, title, scope, version,
                 public:  { price, window, locationMode, scopeItems[] },
                 private: { reservation, timingSlackHrs, scopeFlex[], weights },
                 authority: 'approve-each' | 'within-bounds',
                 status: 'open'|'watching'|'in-deal'|'filled'|'withdrawn' }
Deal           { id, buyMandateId, sellMandateId, buyerId, sellerId,
                 negotiation: { state, rounds: Proposal[], mandateVersions },
                 terms?: Terms, transaction?: { state, payment, events[] },
                 feedback: { byBuyer?: boolean, bySeller?: boolean } }
Proposal       { by: 'buyer'|'seller', terms: Terms, move: 'open'|'concede'|'trade'|'hold', note }
Terms          { price, window, scopeItems[], revisions, deliveryLabel }
LedgerEvent    { id, at, dealId?, actorId, type, payload }
```

---

## 4. Negotiation state machine

```
           authorize                 converge                 user approves
 matched ───────────▶ negotiating ───────────▶ proposed ───────────────────▶ agreed ──▶ (transaction)
    │                    │   │                    │
    │ withdraw           │   └─ no overlap ──▶ impasse ── user edits mandate ──▶ negotiating (new version)
    ▼                    │                        │
 withdrawn               └─ round cap ─────▶ impasse        decline ──▶ declined
```

**Mechanics**
- **Authorize once, then the agents negotiate.** Each side's agent proposes a *package* (price + timing + scope + terms) over at most 4 rounds. Concessions follow a time-dependent schedule from the opening position toward the private reservation and **never cross it**.
- **Multi-issue trades are real, not invented.** An agent offers "+3 days for −6%" only if its own mandate has timing slack. It drops a scope item for a lower price only if that item is marked flexible. Each side values each issue by its mandate's priority weights.
- **Deterministic.** A seeded RNG plus pure functions mean the same mandates always give the same outcome. That is testable and impossible to grind.
- **No repeat-tap.** Renegotiation is only allowed when a mandate's `version` changes, i.e. the user deliberately edited their own terms. The same inputs return the same result, so the button can't be farmed.
- **Authority respected.** With `approve-each`, the agent stops at `proposed` for every package. With `within-bounds`, it can converge inside the user's range, but **agreement always needs one user tap**, because the user approves every commitment.
- **Transparent without leaking.** The UI shows each round as a state change ("Offered $820, delivery Fri → Seller countered $880 with 1 revision → Agreed $850, Fri, 1 revision"). On impasse it gives a *coarse* gap ("about 15% apart on price") and a constructive next step ("raise your ceiling" / "allow more time"). It never shows the counterpart's bound.
- **Ceiling raises** are an explicit user edit to *that* mandate. The mandate version goes up and the negotiation re-runs once.

**Invariants (unit-tested):** price never exceeds the buyer's ceiling and never goes below the seller's floor; the negotiation always terminates within 4 rounds; there is never more than one active deal per mandate pair; the state never goes from `agreed` back to `negotiating`.

---

## 5. Transaction state machine

```
agreed ─▶ payment_authorized ─▶ in_progress ─▶ delivered ─▶ completed ─▶ settled ─▶ closed
  │  (escrow hold on card)        (seller)       (buyer        (payout     (both feedback
  │                                               confirms)     released)   given or expired)
  └─ cancel ─▶ cancelled (hold released)        in_progress/delivered ─ cancel ─▶ refunded
```

- **Payment comes first.** Agreeing on terms leads straight to "Authorize $850 · Visa ···4242". A new user adds a mock card at that moment. Nothing says "held safely" until the hold actually exists.
- **Every role can finish.** When the viewer is the seller, the NPC buyer (via `marketSim`) confirms after a simulated delay. When the viewer is the buyer, the NPC seller delivers on schedule.
- **Feedback is reciprocal and binary** ("Would you work with them again?"). The NPC also rates the viewer, so the viewer's own trust line actually changes.
- `settled` writes ledger events, so both parties' history and trust update from the same record.
- **Adjacent demand.** After `completed`, discovery surfaces 1–2 adjacent mandates (e.g. tax → financial model; admissions essay → test prep) as recommendations, never as auto-posts.

---

## 6. Information architecture & UX

**Tabs (4 + a center action)**

| Tab | Purpose |
|---|---|
| **Home** | Three sections only: **Needs you** (approvals, payments, confirmations, feedback: one queue), **Your mandates** (each with its match count and status), **For you** (2–3 recommendations: standing demand, capability-relevant demand, adjacent needs). |
| **Exchange** | Compact market entries. One control row: `Needs · Offers` + search. Ranked by fit, with explanations available on demand. |
| **＋ Ask** | Voice/text → interpretation → one structured review sheet → post. Replaces the long mandate form. Private bounds sit in a collapsed "Agent limits" section with sensible defaults. |
| **Deals** | Negotiating · In progress · History, in one list. |
| **You** | Identity, capability, trust (derived), payment methods, preferences. |

**Routes:** `listing/[id]` (someone else's mandate + "Start a deal"), `mandate/[id]` (your mandate + its matches + edit), `deal/[id]` (**one screen for the whole lifecycle**: a stepper of Terms → Payment → Work → Feedback, with the negotiation log disclosed under Terms).

**Market entry, default state:** initials avatar · name · trust line ("14 done · 13 rehire") / title (2 lines max) / availability · location mode / **price** right-aligned in tabular numerals / one action. Fit reasons, market-value delta and spreads live in the detail view.

**Onboarding (all of it lands in the real profile):** intro → name + email (+ mocked code) → location (optional, no default) → capability (skippable) → Standard of Value → Home, which is empty with one clear "What do you need, or what can you offer?" prompt. Returning users skip straight to Home.

**Visual system:** keep cream/pine/amber + Fraunces. Add a defined type scale, tabular numerals for all figures, one money/percent/date formatter, an 8-pt spacing scale, hairline dividers over boxed cards, a restrained ambient gradient and halftone (`MarketField`) only on Home and the intro, and Feather icons only where they carry meaning. Remove chat bubbles, sparklines on cards, the charcoal MarketMoment panel on the surface, and the FAB.

---

## 7. Phased implementation

Each phase ends with type-check + tests green, a browser smoke test, and a commit.

**Phase 1 — Foundation**
- `domain/` model, `money.ts`, versioned `infra/storage.ts` (key `demandone-v3`, schema version + migration hook, hydration gate; AsyncStorage on native).
- Seed with NPCs only. The viewer is created from the onboarding inputs. Remove the dummy household and payment methods.
- Returning-user routing; onboarding writes identity, location, capability and values.
- Add **Vitest** for domain tests.
- *Done when:* a fresh user has no inherited data, and a refresh keeps them signed in with everything they entered.

**Phase 2 — Market engine**
- Mandate creation via the interpreter, matching by mandate, `marketSim` (NPC agents respond to the viewer's mandates), the negotiation engine plus invariant tests, and the shared `Deal` record.
- *Done when:* the viewer's Need attracts NPC offers, authorization runs a bounded multi-issue negotiation that can't be exploited, and both sides' projections agree.

**Phase 3 — Lifecycle**
- Payment gateway mock, transaction state machine, NPC fulfillment/confirmation, reciprocal feedback, ledger-derived trust and history, adjacent-need recommendations.
- *Done when:* buyer and seller journeys both reach `closed`, and trust and history update on both sides.

**Phase 4 — UX & visual system**
- `ThemeProvider`/tokens, new primitives, `MarketEntry`, `deal/[id]` workspace, the new Home/Exchange/Ask/Deals/You, progressive disclosure, and deletion of the replaced V2 screens.

**Phase 5 — Testing**
- **Playwright** (v1.64 is available here) against `expo start --web`, at desktop 1280×800 and mobile 390×844.
- Specs: full buyer journey, full seller journey, refresh persistence, the impasse → edit → agree path, and a regression check that repeat negotiation can't move the price.
- Plus responsive screenshots for visual review.

---

## 8. Decisions taken by default (say if you disagree)

1. **Add `@react-native-async-storage/async-storage`** so native persists the same way web does.
2. **Cut bundles, household, the canned agent chat and the FAB.** The agent shows up through the Ask flow and the negotiation log instead.
3. **Keep dark mode**, re-implemented on `ThemeProvider` in Phase 4.
4. **Keep the 6 professional-services categories.** The interpreter's rules carry over unchanged.
5. **V2 state in browsers is ignored** (new storage key). V2 itself stays reachable via `git checkout v2.0`.
