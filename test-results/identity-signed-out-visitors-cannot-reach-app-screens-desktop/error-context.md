# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: identity.spec.ts >> signed-out visitors cannot reach app screens
- Location: tests\e2e\identity.spec.ts:84:5

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Enter DemandOne', exact: true })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Enter DemandOne', exact: true }) with timeout 15000ms
  - waiting for getByRole('button', { name: 'Enter DemandOne', exact: true })

```

```yaml
- text: "? Location not set Your standard of value Redo 01 — Expertise Relevant experience and capability 02 — Trust Verified work · recommendations · people you know 03 — Budget Your economic comfort zone 04 — Geography Where the work happens What I'm looking for Nothing yet — add one from Ask. What I can offer Nothing yet — add one from Ask. Settings Permission controls 4 of 5 enabled Payment methods Add a card Transaction history 0 completed Calendar Free/busy connected Notifications As it happens Dark mode Off"
- switch
- text: Account & login Erase this device Deletes your account and activity from this device Your data is not inventory. Never sold, never used for advertising.
- tab "Today"
- tab "Exchange"
- tab "Ask"
- tab "Requests"
- tab "You"
- img
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { button, enterCode, openLogin, openTab, signUp } from './helpers';
  3  | 
  4  | const ADA = {
  5  |   name: 'Ada Lovelace',
  6  |   email: 'ada@example.com',
  7  |   location: { country: 'United States', region: 'Florida', city: 'Tampa' },
  8  |   capability: 'Former investment banker, good with financial models and Excel',
  9  | };
  10 | 
  11 | test('a new user gets a profile built only from what they entered', async ({ page }) => {
  12 |   await signUp(page, ADA);
  13 | 
  14 |   await openTab(page, 'You');
  15 |   await expect(page.getByText('Ada Lovelace')).toBeVisible();
  16 |   await expect(page.getByText('Tampa, FL')).toBeVisible();
  17 |   await expect(page.getByText('ada@example.com')).toBeVisible();
  18 |   // Nothing inherited from a seeded person.
  19 |   await expect(page.getByText(/Nadia|Miami|nadia@light\.inc|Lyanne/)).toHaveCount(0);
  20 |   await expect(page.getByText('Nothing yet — add one from Ask.')).toHaveCount(2);
  21 |   // Capability tuned the exchange without posting an offer.
  22 |   await expect(page.getByText(/Your exchange is tuned to .*Financial modeling/)).toBeVisible();
  23 | });
  24 | 
  25 | test('the session and profile survive a refresh', async ({ page }) => {
  26 |   await signUp(page, { ...ADA, capability: undefined });
  27 |   await page.reload();
  28 |   await expect(page).toHaveURL(/\/today$/);
  29 |   await openTab(page, 'You');
  30 |   await expect(page.getByText('Ada Lovelace')).toBeVisible();
  31 |   await expect(page.getByText('Tampa, FL')).toBeVisible();
  32 | });
  33 | 
  34 | test('a refresh mid-onboarding resumes at the same step', async ({ page }) => {
  35 |   await openLogin(page);
  36 |   await page.getByLabel('Email').fill('grace@example.com');
  37 |   await button(page, 'Continue').click();
  38 |   await page.getByLabel('Name', { exact: true }).fill('Grace Hopper');
  39 |   await button(page, 'Continue').click();
  40 |   await enterCode(page);
  41 |   await expect(page.getByText('What are you good at?')).toBeVisible();
  42 | 
  43 |   await page.reload();
  44 |   await expect(page.getByText('What are you good at?')).toBeVisible();
  45 |   await page.goto('/today');
  46 |   await expect(page).toHaveURL(/\/capability$/);
  47 | });
  48 | 
  49 | test('signing out keeps the account; signing back in skips onboarding', async ({ page }) => {
  50 |   await signUp(page, ADA);
  51 |   await openTab(page, 'You');
  52 |   await page.getByText('Account & login').click();
  53 |   await button(page, 'Sign out').click();
  54 |   await expect(button(page, 'Enter DemandOne')).toBeVisible();
  55 | 
  56 |   await page.goto('/today');
  57 |   await expect(page).not.toHaveURL(/\/today$/);
  58 | 
  59 |   await openLogin(page);
  60 |   await page.getByLabel('Email').fill('ADA@example.com');
  61 |   await button(page, 'Continue').click();
  62 |   await expect(page.getByText('Welcome back, Ada.')).toBeVisible();
  63 |   await enterCode(page);
  64 |   await expect(page).toHaveURL(/\/today$/);
  65 | });
  66 | 
  67 | test('a different email on the same device must explicitly erase the old account', async ({ page }) => {
  68 |   await signUp(page, ADA);
  69 |   await openTab(page, 'You');
  70 |   await page.getByText('Account & login').click();
  71 |   await button(page, 'Sign out').click();
  72 | 
  73 |   await openLogin(page);
  74 |   await page.getByLabel('Email').fill('bob@example.com');
  75 |   await button(page, 'Continue').click();
  76 |   await expect(page.getByText('This device already has an account.')).toBeVisible();
  77 |   await expect(page.getByText(/It belongs to Ada Lovelace/)).toBeVisible();
  78 | 
  79 |   await button(page, 'Erase it and create a new account').click();
  80 |   await button(page, 'Tap again to erase it').click();
  81 |   await expect(page.getByText('Create your account.')).toBeVisible();
  82 | });
  83 | 
  84 | test('signed-out visitors cannot reach app screens', async ({ page }) => {
  85 |   await page.goto('/you');
> 86 |   await expect(button(page, 'Enter DemandOne')).toBeVisible();
     |                                                 ^ Error: expect(locator).toBeVisible() failed
  87 |   await expect(page).toHaveURL(/localhost:8081\/$/);
  88 | });
  89 | 
```