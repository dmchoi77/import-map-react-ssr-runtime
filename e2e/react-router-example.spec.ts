import { expect, test } from '@playwright/test';

test('hydrates a React Router route with a Native ESM remote', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('React Router SSR ready');
  await expect(page.locator('[data-remote="react-router"]')).toBeVisible();
  await expect(page.locator('#react-router-remote-increment')).toHaveText('Remote count: 0');

  await page.locator('#react-router-remote-increment').click();
  await expect(page.locator('#react-router-remote-increment')).toHaveText('Remote count: 1');

  await page.locator('#details-link').click();
  await expect(page).toHaveURL('/details');
  await expect(page.locator('#details-title')).toHaveText('React Router details');
});

test('renders the current route without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  const response = await page.goto('/details');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#details-title')).toHaveText('React Router details');

  await context.close();
});
