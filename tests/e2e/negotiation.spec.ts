import { expect, test, type Page } from '@playwright/test';
import { button, shot, signUp, tab } from './helpers';

async function openListing(page: Page, title: RegExp) {
  await tab(page, 'Exchange');
  await page.getByRole('button', { name: title }).first().click();
}

async function authorize(page: Page, max: string, opening: string) {
  await button(page, 'Negotiate terms').click();
  await page.getByRole('textbox', { name: /Your private (maximum|minimum)/ }).fill(max);
  await page.getByRole('textbox', { name: /Opening (bid|ask)/ }).fill(opening);
  await button(page, 'Authorize agent').click();
  await expect(page).toHaveURL(/\/negotiation\//);
}

test('6–14 · buyer journey: structured negotiation through cleared transaction and feedback', async ({ page }) => {
  await signUp(page);
  await openListing(page, /^Offer: Series A financial model/);
  await shot(page, '06-listing');

  // 6. Buyer initiates with a private maximum the counterparty never sees.
  await authorize(page, '5200', '4800');
  await expect(page.getByTestId('their-price')).toHaveText('£6,000');
  await expect(page.getByTestId('my-price')).toHaveText('£4,800');
  await expect(page.getByTestId('negotiation-headline')).toContainText('Alex is holding at £6,000');
  await shot(page, '07-negotiation-held');

  // 8. Their private minimum never appears.
  await expect(page.locator('body')).not.toContainText('£5,000');
  await expect(page.locator('body')).not.toContainText(/their (floor|minimum)|room left/i);

  // 7. Repeating the same bid concedes nothing.
  await page.getByRole('textbox', { name: 'Or your own bid on their terms', exact: true }).fill('4800');
  await button(page, 'Propose').click();
  await expect(page.getByTestId('negotiation-message')).toContainText('already proposed exactly these terms');
  await expect(page.getByTestId('their-price')).toHaveText('£6,000');

  // 10. Buyer and seller views read the same record.
  await page.getByRole('switch', { name: 'View as Alex (demo)' }).click();
  await expect(page.getByText(/Demo: the same shared record from Alex's side/)).toBeVisible();
  await page.getByRole('switch', { name: 'View as you' }).click();

  // 9. A later deadline produces a valid alternative proposal and a real counter.
  const deadlineOption = page.getByTestId('option-proposal').filter({ hasText: 'Delivery +3 days' });
  await deadlineOption.getByRole('button', { name: /^Propose .* with delivery \+3 days$/ }).click();
  await expect(page.getByTestId('their-price')).toHaveText('£5,300', { timeout: 10_000 });
  await expect(page.getByText('Thu Oct 15, +3 days').first()).toBeVisible();
  await shot(page, '08-negotiation-countered');

  // 12–13. Approving (past the private limit, explicitly) produces the transaction; HANDLED shows its real terms.
  const confirmed = page.getByTestId('option-confirmed');
  await confirmed.getByRole('button', { name: 'Approve past my limit' }).click();
  await confirmed.getByRole('button', { name: 'Approve £5,300' }).click();
  await expect(page).toHaveURL(/\/handled\//);
  await expect(page.getByTestId('handled-title')).toHaveText('Handled.');
  await expect(page.getByText('£700 below the initial ask.')).toBeVisible();
  await expect(page.getByText('£5,565').filter({ visible: true }).first()).toBeVisible();
  await shot(page, '09-handled');

  // 14. Payment (demo) → delivery → completion → feedback, updating both records.
  const action = page.getByTestId('handled-action');
  await action.getByRole('button', { name: 'Add demo card ending 4242' }).click();
  await action.getByRole('button', { name: 'Authorize £5,565 (demo)' }).click();
  await action.getByRole('button', { name: "Simulate Alex's delivery (demo)" }).click();
  await action.getByRole('button', { name: 'Confirm the work is done' }).click();
  await expect(page.getByTestId('handled-title')).toHaveText('Cleared.');
  await action.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByTestId('counterparty-record')).toHaveText('Alex Chen: 15 verified, 14 recommend, 1 in your network.');
  await expect(page.getByTestId('own-record')).toContainText('Your record: 1 verified, 1 recommend');
  await expect(page.getByText('Often needed next')).toBeVisible();
  await shot(page, '10-cleared');

  await page.goto('/you');
  await expect(page.getByText('1 verified, 1 recommend')).toBeVisible();
});

test('11 · a lowball proposal is rejected — negotiations can fail', async ({ page }) => {
  await signUp(page);
  await openListing(page, /^Offer: Diligence team with temporary capacity/);
  await authorize(page, '20000', '9000');
  await expect(page.getByTestId('negotiation-headline')).toHaveText('Meridian declined.', { timeout: 10_000 });
  await expect(page.getByTestId('negotiation-why')).toContainText('too far');
  await expect(button(page, 'Find another counterparty')).toBeVisible();
});

test('a fixed-price listing can be accepted but not negotiated', async ({ page }) => {
  await signUp(page);
  await openListing(page, /^Offer: Market-entry strategy sprint/);
  await expect(button(page, 'Negotiate terms')).toHaveCount(0);
  await button(page, 'Accept £2,400').click();
  await expect(page).toHaveURL(/\/handled\//);
  await expect(page.getByText('£2,520').filter({ visible: true }).first()).toBeVisible();
});
