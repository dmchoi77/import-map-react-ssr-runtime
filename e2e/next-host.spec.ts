import { expect, test } from '@playwright/test';

test('renders and hydrates a remote in a Next.js Host', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('Next SSR ready');
  await expect(page.locator('#app-root [data-remote="counter"]')).toContainText('Counter remote');
  await expect(page.locator('#app-root [data-remote="badge"]')).toContainText(
    'Nested child remote',
  );
  await expect(page.locator('script[type="importmap"]')).toHaveCount(1);

  const counter = page.locator('#counter-increment');
  await expect(counter).toHaveText('Count: 0');
  await counter.click();
  await expect(counter).toHaveText('Count: 1');

  const badge = page.locator('#badge-toggle');
  await expect(badge).toHaveText('Child clicks: 0');
  await badge.click();
  await expect(badge).toHaveText('Child clicks: 1');
});

test('serves Next.js SSR content without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#counter-increment')).toHaveText('Count: 0');
  await expect(page.locator('#badge-toggle')).toHaveText('Child clicks: 0');
  await context.close();
});
