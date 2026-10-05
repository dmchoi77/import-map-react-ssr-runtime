import { expect, test } from '@playwright/test';

test('renders and hydrates one React remote', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('SSR ready');
  await expect(page.locator('#app-root [data-remote="counter"]')).toContainText('Counter remote');
  await expect(page.locator('#app-root [data-remote="badge"]')).toContainText(
    'Nested child remote',
  );

  const counter = page.locator('#counter-increment');
  await expect(counter).toHaveText('Count: 0');
  await page.waitForLoadState('networkidle');
  await counter.click();
  await expect(counter).toHaveText('Count: 1');

  const badge = page.locator('#badge-toggle');
  await expect(badge).toHaveText('Child clicks: 0');
  await badge.click();
  await expect(badge).toHaveText('Child clicks: 1');
});

test('serves SSR content without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#counter-increment')).toHaveText('Count: 0');
  await expect(page.locator('#badge-toggle')).toHaveText('Child clicks: 0');
  await context.close();
});
