import { expect, test } from '@playwright/test';

test('renders and hydrates the Next.js Host and remote', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('Next SSR ready');
  await expect(page.locator('[data-remote="next"]')).toContainText('Next.js remote');

  const counter = page.locator('#next-remote-increment');
  await expect(counter).toHaveText('Remote count: 0');
  await counter.click();
  await expect(counter).toHaveText('Remote count: 1');
});

test('serves Next.js SSR content without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#next-remote-increment')).toHaveText('Remote count: 0');
  await context.close();
});
