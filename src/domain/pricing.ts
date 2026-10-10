/**
 * The take rate, per the PRD/memo: launched at the bottom of the market on purpose —
 * 5% from the buyer, 10% from the provider, charged on the final negotiated price,
 * always all-in and visible before anyone approves. No lead fees, no subscription.
 *
 * The price shown anywhere in this app (a card's price, a match's current price) IS
 * the all-in total — there's no separate surcharge added at checkout. This module
 * only exists to disclose that plainly near the moment of approval, never to change
 * a displayed number.
 */
export const BUYER_FEE_RATE = 0.05;
export const PROVIDER_FEE_RATE = 0.1;

export const FEE_DISCLOSURE = "This price is all-in — DemandOne's fee is already included, nothing added at checkout.";
