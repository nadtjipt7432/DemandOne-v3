import type { Fees } from './types';

/**
 * DemandOne's take: 5% from the buyer on top of the agreed price, 10% from the
 * seller out of it. Shown in full before anyone approves; nothing else is added.
 */
export const BUYER_FEE_RATE = 0.05;
export const SELLER_FEE_RATE = 0.1;

export function computeFees(agreedPrice: number): Fees {
  const buyerFee = Math.round(agreedPrice * BUYER_FEE_RATE);
  const sellerFee = Math.round(agreedPrice * SELLER_FEE_RATE);
  return { buyerFee, buyerTotal: agreedPrice + buyerFee, sellerFee, sellerNet: agreedPrice - sellerFee };
}

export const FEE_DISCLOSURE = 'Buyers pay a 5% DemandOne fee on top of the agreed price; sellers pay 10% from it. Shown before you approve.';
