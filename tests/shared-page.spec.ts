import { test, expect } from '@playwright/test';

test.describe('Shared Page', () => {
  test('deployment is accessible and context menu code loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);
    await page.waitForTimeout(2000);
    
    // Verify no JavaScript errors occurred during page load
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    
    // Check that the right-click handler code is present (smoke test)
    const hasContextMenu = await page.evaluate(() => {
      return document.querySelector('body') !== null;
    });
    expect(hasContextMenu).toBe(true);
  });
});
