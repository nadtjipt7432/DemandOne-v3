# DemandOne V3

An agent-mediated exchange for human capability. Say what you need, or the time you can sell; an agent turns it into terms, works the other side of the market within your private limits, and waits for your yes.

Expo SDK 57 · Expo Router · React 19 · TypeScript. Runs on web, iOS and Android (web is what's tested).

## Run it

```
npm install
npm run web        # or: npm start, then w / i / a
```

Open http://localhost:8081. The landing page leads to an email-only sign-up (any six-digit code verifies — it's a demo).

## Try the demos

- **Buyer:** Exchange → *Series A financial model* → Negotiate terms. Your agent proposes; the counterparty holds, counters or declines. Approve terms → authorize the demo payment → simulate delivery → confirm → leave feedback.
- **Voice need:** Speak → *"We're looking at buying a competitor, and I need someone to make sure the numbers actually make sense."* Follow up with *"Yes, but within three weeks"* and a budget.
- **Seller allocation:** Speak → *"I have 20 hours over the next two weeks for financial modeling at £150 an hour."* Five buyers bid. Review the recommended allocations, ask *"What happens if I accept Northbridge?"*, authorize one, then approve.

Typing works everywhere speaking does. Speech uses the browser's recognizer where available (Chrome, Edge).

## How it's built

```
src/domain    pure logic: negotiation state machine, capacity allocation, matching,
              semantic interpreter, identity, fees — no React, fully unit-tested
src/infra     storage (versioned, migrated), seed market, clock, speech
src/services  the only write path: account, market, negotiation, allocation,
              transactions, voice agent
src/state     store, hooks, Home selectors
src/ui        design system: tokens, core, market components, allocation, voice panel
src/app       screens (Expo Router)
```

Principles the code enforces:

- **Private limits stay private.** Minimums and maximums live outside listings and negotiation records; a test fails if any screen reads them.
- **One shared record per deal.** Buyer and seller see the same negotiation and transaction.
- **No negotiation spam.** Repeated or backward proposals are refused; concessions come only from the counterparty's bounded policy. Negotiations can fail.
- **No double-booking.** Capacity is tracked per week; agreements that would exceed it are refused.
- **Honest numbers.** "Below the initial ask", never "below market" without comparable listings.
- **Simulated parts are labelled.** Payments, counterparty actions and the interpreter are deterministic mocks.

## Test

```
npm test                 # unit (Vitest)
npx playwright test      # end-to-end, desktop 1280 and mobile 390 (starts the dev server)
```

`docs/V3-PLAN.md` holds the original audit and migration plan from V2.
