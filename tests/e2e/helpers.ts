import { expect, type Page } from '@playwright/test';

export const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

/** Landing page → past the intro animation → login. */
export async function openLogin(page: Page) {
  await page.goto('/');
  await button(page, 'Enter DemandOne').click({ timeout: 30_000 });
  await expect(page.getByLabel('Email')).toBeVisible();
}

export async function enterCode(page: Page) {
  await page.getByLabel('Verification code').fill('123456');
  await button(page, 'Verify').click();
}

export interface NewUser {
  name: string;
  email: string;
  location?: { country: string; region: string; city: string };
  capability?: string;
}

/** Full signup through onboarding, ending on Today. */
export async function signUp(page: Page, user: NewUser) {
  await openLogin(page);
  await page.getByLabel('Email').fill(user.email);
  await button(page, 'Continue').click();

  await expect(page.getByText('Create your account.')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(user.name);
  if (user.location) {
    await button(page, 'Choose location').click();
    await button(page, 'Country').click();
    await button(page, user.location.country).click();
    await page.getByRole('button', { name: /^State|^Province|^Region/ }).first().click();
    await button(page, user.location.region).click();
    await button(page, 'City').click();
    await button(page, user.location.city).click();
  }
  await button(page, 'Continue').click();
  await enterCode(page);

  await expect(page.getByText('What are you good at?')).toBeVisible();
  if (user.capability) {
    await page.getByLabel(/Tell DemandOne what you're good at/).fill(user.capability);
    await button(page, 'Continue').click();
    await button(page, 'Save').click();
  } else {
    await button(page, 'Skip for now').first().click();
  }

  await expect(page.getByText('What matters most to you?')).toBeVisible();
  for (const criterion of ['Trust', 'Expertise', 'Budget', 'Geography']) {
    await page.getByText(criterion, { exact: true }).last().click();
  }
  await button(page, 'Finish setup').click();
  await expect(page).toHaveURL(/\/today$/);
}

export async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}
