import { expect, test } from '@playwright/test';
import { button, enterCode, openLogin, openTab, signUp } from './helpers';

const ADA = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  location: { country: 'United States', region: 'Florida', city: 'Tampa' },
  capability: 'Former investment banker, good with financial models and Excel',
};

test('a new user gets a profile built only from what they entered', async ({ page }) => {
  await signUp(page, ADA);

  await openTab(page, 'You');
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect(page.getByText('Tampa, FL')).toBeVisible();
  await expect(page.getByText('ada@example.com')).toBeVisible();
  // Nothing inherited from a seeded person.
  await expect(page.getByText(/Nadia|Miami|nadia@light\.inc|Lyanne/)).toHaveCount(0);
  await expect(page.getByText('Nothing yet — add one from Ask.')).toHaveCount(2);
  // Capability tuned the exchange without posting an offer.
  await expect(page.getByText(/Your exchange is tuned to .*Financial modeling/)).toBeVisible();
});

test('the session and profile survive a refresh', async ({ page }) => {
  await signUp(page, { ...ADA, capability: undefined });
  await page.reload();
  await expect(page).toHaveURL(/\/today$/);
  await openTab(page, 'You');
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect(page.getByText('Tampa, FL')).toBeVisible();
});

test('a refresh mid-onboarding resumes at the same step', async ({ page }) => {
  await openLogin(page);
  await page.getByLabel('Email').fill('grace@example.com');
  await button(page, 'Continue').click();
  await page.getByLabel('Name', { exact: true }).fill('Grace Hopper');
  await button(page, 'Continue').click();
  await enterCode(page);
  await expect(page.getByText('What are you good at?')).toBeVisible();

  await page.reload();
  await expect(page.getByText('What are you good at?')).toBeVisible();
  await page.goto('/today');
  await expect(page).toHaveURL(/\/capability$/);
});

test('signing out keeps the account; signing back in skips onboarding', async ({ page }) => {
  await signUp(page, ADA);
  await openTab(page, 'You');
  await page.getByText('Account & login').click();
  await button(page, 'Sign out').click();
  await expect(page).toHaveURL(/localhost:8081\/(login)?$/);

  await page.goto('/today');
  await expect(page).not.toHaveURL(/\/today$/);

  await openLogin(page);
  await page.getByLabel('Email').fill('ADA@example.com');
  await button(page, 'Continue').click();
  await expect(page.getByText('Welcome back, Ada.')).toBeVisible();
  await enterCode(page);
  await expect(page).toHaveURL(/\/today$/);
});

test('a different email on the same device must explicitly erase the old account', async ({ page }) => {
  await signUp(page, ADA);
  await openTab(page, 'You');
  await page.getByText('Account & login').click();
  await button(page, 'Sign out').click();

  await openLogin(page);
  await page.getByLabel('Email').fill('bob@example.com');
  await button(page, 'Continue').click();
  await expect(page.getByText('This device already has an account.')).toBeVisible();
  await expect(page.getByText(/It belongs to Ada Lovelace/)).toBeVisible();

  await button(page, 'Erase it and create a new account').click();
  await button(page, 'Tap again to erase it').click();
  await expect(page.getByText('Create your account.')).toBeVisible();
});

test('signed-out visitors cannot reach app screens', async ({ page }) => {
  await page.goto('/you');
  await expect(page).toHaveURL(/localhost:8081\/(login)?$/);
  await expect(page.getByText('Ada Lovelace')).toHaveCount(0);
});
