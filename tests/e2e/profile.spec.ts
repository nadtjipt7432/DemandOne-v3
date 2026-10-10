import { expect, test } from '@playwright/test';
import { button, JORDAN, shot, signUp, tab } from './helpers';

test('1–3 · a new user’s profile matches what they entered, edits persist, no demo identity', async ({ page }) => {
  await signUp(page, JORDAN, { screenshots: true });
  await shot(page, '03-home');

  await tab(page, 'You');
  await expect(page.getByTestId('profile-name')).toHaveText('Jordan Lee');
  for (const text of ['jordan@example.com', 'London', 'Financial modeling, market research, valuation', 'Six years in transaction services', 'linkedin.com/in/jordanlee']) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator('body')).not.toContainText(/Miami|Nadia|Lyanne|nadia@light/);
  await shot(page, '04-profile');

  await button(page, 'Edit profile').click();
  await page.getByRole('textbox', { name: 'Location', exact: true }).fill('Manchester');
  await button(page, 'Save').first().click();
  await expect(page.getByTestId('profile-saved')).toHaveText('Saved.');

  await page.getByRole('button', { name: 'Back' }).click();
  await tab(page, 'Home');
  await page.reload();
  await tab(page, 'You');
  await expect(page.getByText('Manchester', { exact: true })).toBeVisible();
  await expect(page.getByText('London', { exact: true })).toHaveCount(0);
});

test('4 · a missing location shows “Not set”, never an invented one', async ({ page }) => {
  await signUp(page, { name: 'Sam Rivera', email: 'sam@example.com' });
  await tab(page, 'You');
  await expect(page.getByText('Not set').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Miami');
});

test('5 · capabilities surface relevant demand without creating an offer', async ({ page }) => {
  await signUp(page);
  await expect(page.getByText('Demand for what you do')).toBeVisible();
  await expect(page.getByText(/UK market sizing|Financial model and valuation|Quarterly reforecast/).first()).toBeVisible();
  await expect(page.getByText('Your positions')).toHaveCount(0);
  await tab(page, 'Exchange');
  await expect(page.getByText('For you', { exact: true }).first()).toBeVisible();
  await shot(page, '05-exchange');
});

test('profile edits are validated', async ({ page }) => {
  await signUp(page, { name: 'Sam Rivera', email: 'sam@example.com' });
  await tab(page, 'You');
  await button(page, 'Edit profile').click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('J');
  await button(page, 'Save').first().click();
  await expect(page.getByText('Enter your name (at least 2 characters).')).toBeVisible();
});
