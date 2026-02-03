import { test, expect } from '@playwright/test';

test.describe('Recycle Bin', () => {
  test('deployment is accessible and responds', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);
    await page.waitForTimeout(2000);
    
    // Just verify we can load the page without errors
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
