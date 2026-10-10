import { expect, test, type Page } from '@playwright/test';
import { button, shot, signUp, tab } from './helpers';

/** Typed input goes through exactly the same interpreter and agent as speech. */
async function say(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Type to DemandOne', exact: true }).fill(text);
  await page.getByRole('textbox', { name: 'Type to DemandOne', exact: true }).press('Enter');
}

test('voice-first need: ambiguous sentence → structured mandate → follow-ups → market', async ({ page }) => {
  await signUp(page);
  await tab(page, 'Speak');
  await say(page, "We're looking at buying a competitor, and I need someone to make sure the numbers actually make sense before we go ahead.");
  const reply = page.getByTestId('agent-reply').filter({ visible: true });
  await expect(reply).toContainText("Sounds like you're considering an acquisition and want financial due diligence support. Is that right?");
  await expect(page.getByText('Potential acquisition', { exact: true })).toBeVisible();
  await expect(page.getByText('Financial due diligence', { exact: true })).toBeVisible();
  await expect(page.getByText('Not specified').first()).toBeVisible();
  await shot(page, '11-speak-interpreted');

  await say(page, 'Yes, but we need it within three weeks.');
  await expect(page.getByText('Within 3 weeks', { exact: true })).toBeVisible();
  await expect(reply).toContainText('What budget should I work within?');

  await say(page, 'Budget is around £20,000.');
  await expect(reply).toContainText('Shall I look for providers?');
  await button(page, 'Yes, go ahead').click();
  await expect(page).toHaveURL(/\/position\//);
  await expect(page.getByText('Who could fill it')).toBeVisible();
  await expect(page.getByText(/Diligence team with temporary capacity/)).toBeVisible();
});

test('voice negotiation: a spoken conditional becomes a structured, confirmed proposal', async ({ page }) => {
  await signUp(page);
  await tab(page, 'Exchange');
  await page.getByRole('button', { name: /^Offer: Series A financial model/ }).first().click();
  await button(page, 'Negotiate terms').click();
  await page.getByRole('textbox', { name: 'Your private maximum', exact: true }).fill('5600');
  await page.getByRole('textbox', { name: 'Opening bid', exact: true }).fill('4800');
  await button(page, 'Authorize agent').click();
  await expect(page.getByTestId('their-price')).toHaveText('£6,000');

  await say(page, 'I could go to £5,200 if they deliver Wednesday');
  await expect(page.getByTestId('agent-reply').filter({ visible: true })).toContainText('Propose £5,200 with delivery +3 days?');
  await expect(page.getByTestId('their-price')).toHaveText('£6,000');
  await button(page, 'Yes, go ahead').click();
  await expect(page.getByTestId('their-price')).toHaveText('£5,300', { timeout: 10_000 });
  await expect(page.getByTestId('agent-reply').filter({ visible: true })).toContainText('Alex has countered at £5,300');
  await shot(page, '12-voice-negotiation');
});

test('voice seller: release capacity, receive competing bids, compare them', async ({ page }) => {
  await signUp(page);
  await tab(page, 'Speak');
  await say(page, 'I have 10 hours next week for financial modeling at about £150 an hour.');
  await expect(page.getByTestId('agent-reply').filter({ visible: true })).toContainText("You'd like to release 10 hours");
  await say(page, 'Yes');
  await expect(page.getByTestId('agent-reply').filter({ visible: true })).toContainText('Shall I release it to the market?');
  await button(page, 'Yes, go ahead').click();
  await expect(page).toHaveURL(/\/position\//);
  await expect(page.getByText('2 bids on your capacity')).toBeVisible();
  await say(page, 'Which bid is better?');
  await expect(page.getByTestId('agent-reply').filter({ visible: true })).toContainText('Two buyers are interested in your capacity');
  await shot(page, '13-bids');
});
