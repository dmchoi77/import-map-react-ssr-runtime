import { expect, test } from '@playwright/test';

test('renders remote content when JavaScript is disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#counter-root [data-remote="counter"]')).toContainText('Counter');
  await expect(page.locator('#counter-increment')).toHaveText('Count: 0');
  await expect(page.locator('#profile-root [data-remote="profile"]')).toContainText('Ada Lovelace');

  await context.close();
});

test('hydrates independent remotes and keeps their SSR roots interactive', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? 'unknown error'}`);
  });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle');

  const counterButton = page.locator('#counter-increment');
  await expect(counterButton).toHaveText('Count: 0');
  await expect(page.locator('#profile-root')).toContainText('Ada Lovelace');
  const serverRenderedButton = await counterButton.elementHandle();

  await counterButton.click();

  try {
    await expect(counterButton).toHaveText('Count: 1');
  } catch (error) {
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        `page errors: ${pageErrors.join('; ')}`,
        `console errors: ${consoleErrors.join('; ')}`,
        `failed requests: ${failedRequests.join('; ')}`,
      ].join('\n'),
    );
  }
  await expect(page.locator('#profile-root')).toContainText('Ada Lovelace');
  expect(await serverRenderedButton?.evaluate((button) => button.isConnected)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('keeps the host available when a remote fails during SSR', async ({ page }) => {
  const response = await page.goto('/failure');

  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-mfe-fallback="server"]')).toContainText('Remote unavailable');
});
