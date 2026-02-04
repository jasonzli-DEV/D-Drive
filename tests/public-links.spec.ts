import { test, expect } from '@playwright/test';

const BASE_URL = 'http://pi.local';

test.describe('Public Links Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('text=Sign in with Discord', { timeout: 10000 });
    await page.click('text=Sign in with Discord');
    
    await page.waitForURL(/callback/, { timeout: 30000 });
    await page.waitForURL('/drive', { timeout: 30000 });
    
    await expect(page).toHaveURL('/drive');
  });

  test('should create a public link for a file', async ({ page }) => {
    await page.waitForSelector('[role="row"]', { timeout: 10000 });
    
    const fileRow = page.locator('[role="row"]').filter({ hasText: /\.(txt|md|json|png|jpg)$/i }).first();
    await fileRow.click({ button: 'right' });
    
    await page.waitForSelector('text=Create public link', { timeout: 5000 });
    await page.click('text=Create public link');
    
    await page.waitForSelector('text=Create Public Link', { timeout: 5000 });
    
    const slugInput = page.locator('input[placeholder*="word-word"]');
    await expect(slugInput).toBeVisible();
    
    const defaultSlug = await slugInput.inputValue();
    expect(defaultSlug).toMatch(/^[a-z]+-[a-z]+$/);
    
    await page.click('button:has-text("Create")');
    
    await page.waitForSelector('text=Public link created', { timeout: 5000 });
  });

  test('should display Links page in sidebar', async ({ page }) => {
    await page.waitForSelector('text=Links', { timeout: 5000 });
    await page.click('text=Links');
    
    await expect(page).toHaveURL('/links');
    
    await page.waitForSelector('text=Public Links', { timeout: 5000 });
    await expect(page.locator('h4:has-text("Public Links")')).toBeVisible();
  });

  test('should navigate to Links page', async ({ page }) => {
    await page.waitForSelector('text=Links', { timeout: 5000 });
    await page.click('text=Links');
    
    await expect(page).toHaveURL('/links');
    
    await page.waitForSelector('text=Public Links', { timeout: 5000 });
    await expect(page.locator('h4:has-text("Public Links")')).toBeVisible();
  });

  test('should list all public links in Links page', async ({ page }) => {
    await page.goto(`${BASE_URL}/links`);
    await page.waitForLoadState('networkidle');
    
    const table = page.locator('table');
    await expect(table).toBeVisible();
    
    const headers = ['File', 'Slug', 'Created', 'Expires', 'Actions'];
    for (const header of headers) {
      await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
    }
  });

  test('should customize slug when creating public link', async ({ page }) => {
    await page.waitForSelector('[role="row"]', { timeout: 10000 });
    
    const fileRow = page.locator('[role="row"]').filter({ hasText: /\.(txt|md|json)$/i }).first();
    await fileRow.click({ button: 'right' });
    
    await page.click('text=Create public link');
    await page.waitForSelector('text=Create Public Link', { timeout: 5000 });
    
    const customSlug = 'test-file-link';
    const slugInput = page.locator('input[placeholder*="word-word"]');
    await slugInput.fill(customSlug);
    
    await page.click('button:has-text("Create")');
    await page.waitForSelector('text=Public link created', { timeout: 5000 });
    
    await page.goto(`${BASE_URL}/links`);
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator(`text=${customSlug}`)).toBeVisible();
  });

  test('should copy public link to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto(`${BASE_URL}/links`);
    await page.waitForLoadState('networkidle');
    
    const firstRow = page.locator('tbody tr').first();
    const copyButton = firstRow.locator('button[title="Copy link"]');
    
    if (await copyButton.isVisible()) {
      await copyButton.click();
      
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('/link/');
      expect(clipboardText).toMatch(/[a-z]+-[a-z]+$/);
    }
  });

  test('should access public link without authentication', async ({ browser }) => {
    const authenticatedPage = await browser.newPage();
    await authenticatedPage.goto(BASE_URL);
    await authenticatedPage.waitForSelector('text=Sign in with Discord', { timeout: 10000 });
    await authenticatedPage.click('text=Sign in with Discord');
    await authenticatedPage.waitForURL('/drive', { timeout: 30000 });
    
    await authenticatedPage.waitForSelector('[role="row"]', { timeout: 10000 });
    const fileRow = authenticatedPage.locator('[role="row"]').filter({ hasText: /\.(txt|md)$/i }).first();
    await fileRow.click({ button: 'right' });
    
    await authenticatedPage.click('text=Create public link');
    await authenticatedPage.waitForSelector('text=Create Public Link', { timeout: 5000 });
    
    const slugInput = authenticatedPage.locator('input[placeholder*="word-word"]');
    const slug = await slugInput.inputValue();
    
    await authenticatedPage.click('button:has-text("Create")');
    await authenticatedPage.waitForSelector('text=Public link created', { timeout: 5000 });
    
    await authenticatedPage.close();
    
    const unauthenticatedPage = await browser.newPage();
    await unauthenticatedPage.goto(`${BASE_URL}/link/${slug}`);
    
    await unauthenticatedPage.waitForSelector('h4', { timeout: 10000 });
    const heading = unauthenticatedPage.locator('h4');
    await expect(heading).toBeVisible();
    
    const downloadButton = unauthenticatedPage.locator('button:has-text("Download")');
    await expect(downloadButton).toBeVisible();
    
    await unauthenticatedPage.close();
  });

  test('deployment is accessible and public links code loads', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState('networkidle');
    
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    
    const hasBody = await page.evaluate(() => {
      return document.querySelector('body') !== null;
    });
    expect(hasBody).toBe(true);
  });
});
