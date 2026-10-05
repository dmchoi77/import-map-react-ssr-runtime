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

test('streams remote markup and hydrates it in the browser', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const response = await page.goto('/stream', { waitUntil: 'commit' });

  expect(response?.status()).toBe(200);
  const modulePreloadHrefs = await page
    .locator('link[rel="modulepreload"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  expect(modulePreloadHrefs).toHaveLength(1);
  expect(modulePreloadHrefs[0]).toContain('/remote/counter.client.mjs');
  expect(modulePreloadHrefs.join('')).not.toContain('profile.client.mjs');
  await expect(page.locator('#host-status')).toHaveText('SSR ready');
  const counterButton = page.locator('#counter-increment');
  await expect(counterButton).toHaveText('Count: 0');
  await page.waitForLoadState('networkidle');
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 1');
  expect(await page.locator('#counter-root #counter-increment').count()).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test('streams and closes with the fallback when a remote cannot be loaded', async ({ page }) => {
  const response = await page.goto('/stream-failure');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('SSR ready');
  await expect(page.locator('#counter-root')).toContainText('Remote unavailable');
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
  const modulePreloadHrefs = await page
    .locator('link[rel="modulepreload"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  expect(modulePreloadHrefs).toHaveLength(2);
  expect(modulePreloadHrefs.some((href) => href.includes('counter.client.mjs'))).toBe(true);
  expect(modulePreloadHrefs.some((href) => href.includes('profile.client.mjs'))).toBe(true);
  const hintsPrecedeBootstrap = await page.evaluate(() => {
    const hint = document.querySelector('link[rel="modulepreload"]');
    const bootstrap = document.querySelector('script[type="module"][src]');
    return Boolean(
      hint &&
      bootstrap &&
      (hint.compareDocumentPosition(bootstrap) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
  });
  expect(hintsPrecedeBootstrap).toBe(true);
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

test('composes nested remotes under one SSR root and hydrates child interactions', async ({
  page,
}) => {
  const response = await page.goto('/nested');

  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-mfe-react-root]')).toHaveCount(1);
  await expect(page.locator('script[data-mfe-react-hydration]')).toHaveCount(1);
  await expect(page.locator('#dashboard-root [data-remote="counter"]')).toContainText(
    'Nested Counter',
  );
  await expect(page.locator('#dashboard-root [data-remote="profile"]')).toContainText(
    'Ada Lovelace',
  );
  await page.waitForLoadState('networkidle');

  const counterButton = page.locator('#counter-increment');
  await expect(counterButton).toHaveText('Count: 3');
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 4');
});

test('contains a child remote load failure and keeps its sibling interactive', async ({ page }) => {
  const response = await page.goto('/nested-child-failure');

  expect(response?.status()).toBe(200);
  const serverHtml = await response?.text();
  expect(serverHtml).toContain('Ada Lovelace');
  expect(serverHtml).not.toContain('data-mfe-child-fallback="profile"');
  await expect(page.locator('[data-mfe-react-root]')).toHaveCount(1);
  await expect(page.locator('#dashboard-root [data-mfe-child-fallback="profile"]')).toContainText(
    'Profile unavailable',
  );
  await expect(page.locator('#dashboard-root [data-remote="counter"]')).toContainText(
    'Nested Counter',
  );
  await page.waitForLoadState('networkidle');

  const counterButton = page.locator('#counter-increment');
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 4');
  expect(await page.locator('[data-mfe-react-root]').count()).toBe(1);
});

test('recovers from a parent remote SSR failure without creating another root', async ({
  page,
}) => {
  const response = await page.goto('/nested-parent-failure');

  expect(response?.status()).toBe(200);
  const serverHtml = await response?.text();
  expect(serverHtml).toContain('data-mfe-fallback="server"');
  expect(serverHtml).toContain('Dashboard unavailable');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-mfe-react-root]')).toHaveCount(1);
  await expect(page.locator('#dashboard-root [data-remote="profile"]')).toContainText(
    'Ada Lovelace',
  );
});

test('keeps the host available when a remote fails during SSR', async ({ page }) => {
  const response = await page.goto('/failure');

  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-mfe-fallback="server"]')).toContainText('Remote unavailable');
});
