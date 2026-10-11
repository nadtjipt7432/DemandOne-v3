import { expect, test } from '@playwright/test';
import { button, say, shot, signUp, tab } from './helpers';

/**
 * The seller demo: release 20 hours → five proposals → recommended allocations →
 * voice questions answered from real state → authorize → approve → hours committed.
 */
test('seller allocates 20 hours across competing proposals', async ({ page }) => {
  await signUp(page);
  await tab(page, 'Speak');
  await say(page, 'I have 20 hours over the next two weeks for financial modeling at £150 an hour.');
  const reply = page.getByTestId('agent-reply').filter({ visible: true });
  await expect(reply).toContainText("You'd like to release 20 hours");
  await say(page, 'Yes');
  await button(page, 'Yes, go ahead').click();
  await expect(page).toHaveURL(/\/position\//);

  // Layer 1: summary.
  await expect(page.getByTestId('allocation-summary')).toHaveAttribute('aria-label', '5 proposals received. One is below your minimum. DemandOne found three promising allocation strategies.');
  await shot(page, '14-allocation-summary');

  // Layer 2: strategies, with the recommendation by standard of value rather than revenue.
  await expect(page.getByTestId('strategy-earnings')).toContainText('£2,395');
  await expect(page.getByTestId('strategy-simple')).toContainText('Best fit for your standard of value');
  await expect(page.getByTestId('strategy-flexible')).toContainText('10 h');

  // Voice answers come from the actual proposals and capacity.
  await say(page, 'What happens if I accept Northbridge?');
  await expect(reply).toContainText('Halden would no longer fit');
  await say(page, 'Can I take on two of them?');
  await expect(reply).toContainText('Yes.');
  await say(page, 'Which option leaves me the most flexibility?');
  await expect(reply).toContainText('leaving 10 free');

  // Layer 3: proposal details on request.
  await page.getByRole('button', { name: 'All 5 proposals' }).click();
  await expect(page.getByTestId('proposal-row')).toHaveCount(5);
  await expect(page.getByText('Below your minimum', { exact: true })).toBeVisible();

  // Authorize → agent negotiates → approve → committed.
  await page.getByTestId('strategy-flexible').getByRole('button', { name: /Preview/ }).click();
  await button(page, 'Authorize negotiation').click();
  await expect(page.getByTestId('allocation-summary')).toHaveAttribute('aria-label', '2 of 2 agreed in principle. Approve to commit the hours.', { timeout: 15_000 });
  await shot(page, '15-allocation-ready');
  await button(page, 'Approve 2 transactions').click();
  await expect(page.getByTestId('allocation-summary')).toHaveAttribute('aria-label', 'Allocated. 10 hours committed, 10 still free.');
  await shot(page, '16-allocation-committed');

  // The same transactions, from the deal views.
  await page.getByRole('button', { name: 'Back' }).click();
  await tab(page, 'Deals');
  await expect(page.getByText('Sold to Halden Capital')).toBeVisible();
  await expect(page.getByText('Sold to Kite Labs')).toBeVisible();
  await page.getByText('Sold to Halden Capital').click();
  await expect(page.getByTestId('handled-title')).toHaveText('Handled.');
  await expect(page.getByText('You receive').filter({ visible: true })).toBeVisible();
});

test('the landing page is shown to a returning, signed-in user', async ({ page }) => {
  await signUp(page);
  await page.goto('/');
  await expect(page.getByTestId('landing-title')).toBeVisible();
  await expect(button(page, 'Continue as Jordan Lee')).toBeVisible();
  await shot(page, '00-landing-returning');
  await button(page, 'Continue as Jordan Lee').click();
  await expect(page).toHaveURL(/\/today$/);
});
