import { expect, test } from '@playwright/test';

test('renders and hydrates the Vite React Host and remote', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#host-status')).toHaveText('SSR ready');
  await expect(page.locator('[data-remote="react-vite"]')).toContainText('Vite React remote');

  const counter = page.locator('#react-vite-remote-increment');
  await expect(counter).toHaveText('Remote count: 0');
  await page.waitForLoadState('networkidle');
  await counter.click();
  await expect(counter).toHaveText('Remote count: 1');
});
