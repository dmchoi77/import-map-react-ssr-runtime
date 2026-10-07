import { expect, test } from '@playwright/test';

test('hydrates a TanStack Start route with a Native ESM remote', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('TanStack Start SSR ready');
  await expect(page.locator('[data-remote="tanstack-start"]')).toBeVisible();
  await expect(page.locator('#tanstack-start-remote-increment')).toHaveText('Remote count: 0');

  await page.locator('#tanstack-start-remote-increment').click();
  await expect(page.locator('#tanstack-start-remote-increment')).toHaveText('Remote count: 1');

  await page.locator('#details-link').click();
  await expect(page).toHaveURL('/details');
  await expect(page.locator('#details-title')).toHaveText('TanStack Start details');
});

test('renders a route without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  const response = await page.goto('/details');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#details-title')).toHaveText('TanStack Start details');

  await context.close();
});
