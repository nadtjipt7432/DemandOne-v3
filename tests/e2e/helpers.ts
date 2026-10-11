import { expect, type Page } from '@playwright/test';

export const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

export const SCREEN_DIR = process.env.SCREEN_DIR ?? 'test-results/screens';

export async function shot(page: Page, name: string) {
  const project = page.viewportSize()!.width < 600 ? 'mobile' : 'desktop';
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREEN_DIR}/${project}-${name}.png`, fullPage: true });
}

export interface NewUser {
  name: string;
  email: string;
  location?: string;
  capabilities?: string;
  background?: string;
  links?: string;
}

export const JORDAN: NewUser = {
  name: 'Jordan Lee',
  email: 'jordan@example.com',
  location: 'London',
  capabilities: 'Financial modeling, market research, valuation',
  background: 'Six years in transaction services',
  links: 'linkedin.com/in/jordanlee',
};

/** Landing → login → profile → capability → values → Home. */
export async function signUp(page: Page, user: NewUser = JORDAN, opts: { screenshots?: boolean } = {}) {
  await page.goto('/');
  await expect(button(page, 'Enter with your email')).toBeVisible({ timeout: 30_000 });
  if (opts.screenshots) await shot(page, '01-landing');
  await button(page, 'Enter with your email').click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
  await button(page, 'Continue').click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(user.name);
  if (user.location) await page.getByRole('textbox', { name: 'Location (optional)', exact: true }).fill(user.location);
  await button(page, 'Continue').click();
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).fill('123456');
  await button(page, 'Verify').click();

  await expect(page.getByText('What can you do?')).toBeVisible();
  if (user.capabilities) await page.getByRole('textbox', { name: 'Capabilities', exact: true }).fill(user.capabilities);
  if (user.background) await page.getByRole('textbox', { name: 'Professional background (optional)', exact: true }).fill(user.background);
  if (user.links) await page.getByRole('textbox', { name: 'LinkedIn or proof links (optional)', exact: true }).fill(user.links);
  if (opts.screenshots) await shot(page, '02-capability');
  await button(page, 'Save and continue').click();

  await expect(page.getByText('What matters most when you choose who to work with?')).toBeVisible();
  for (const c of ['Expertise', 'Trust', 'Budget', 'Geography']) await button(page, `Rank ${c} next`).click();
  await button(page, 'Enter the exchange').click();
  await expect(page).toHaveURL(/\/today$/);
}

export async function tab(page: Page, name: 'Home' | 'Exchange' | 'Speak' | 'Deals' | 'You') {
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

/** Exchange → expand a row in place → open its full listing. */
export async function openListing(page: Page, title: RegExp) {
  await tab(page, 'Exchange');
  await page.getByRole('button', { name: title }).first().click();
  await expect(page.getByTestId('opportunity-card')).toBeVisible();
  await page.getByTestId('opportunity-card').getByRole('button', { name: 'Full details' }).click();
}

/** Typed input goes through the same interpreter and agent as speech. */
export async function say(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Type to DemandOne' }).filter({ visible: true });
  await box.fill(text);
  await box.press('Enter');
}
