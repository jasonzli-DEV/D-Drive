import { test, expect } from '@playwright/test';

test.describe('Recycle Bin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://192.168.5.14');
  });

  test('delete child then parent - both appear separately in recycle bin', async ({ page }) => {
    await page.goto('http://192.168.5.14');
    
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('body', { timeout: 30000 });
    
    const folderName = `TestParent_${Date.now()}`;
    const childFolderName = `TestChild_${Date.now()}`;
    
    await page.click('[aria-label="Create folder"]');
    await page.fill('input[placeholder="Folder name"]', folderName);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);
    
    await page.locator(`text="${folderName}"`).first().click();
    await page.waitForTimeout(500);
    
    await page.click('[aria-label="Create folder"]');
    await page.fill('input[placeholder="Folder name"]', childFolderName);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);
    
    await page.locator(`text="${childFolderName}"`).first().locator('..').locator('[aria-label="More actions"]').click();
    await page.click('text=Delete');
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(1000);
    
    await page.goto('http://192.168.5.14');
    await page.waitForTimeout(500);
    
    await page.locator(`text="${folderName}"`).first().locator('..').locator('[aria-label="More actions"]').click();
    await page.click('text=Delete');
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(1000);
    
    await page.click('[href="/recycle-bin"]');
    await page.waitForTimeout(1000);
    
    const parentInBin = await page.locator(`text="${folderName}"`).count();
    const childInBin = await page.locator(`text="${childFolderName}"`).count();
    
    expect(parentInBin).toBe(1);
    expect(childInBin).toBe(1);
  });
  
  test('delete parent with child - only parent appears in recycle bin', async ({ page }) => {
    await page.goto('http://192.168.5.14');
    
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('body', { timeout: 30000 });
    
    const folderName = `TestParentNested_${Date.now()}`;
    const childFolderName = `TestChildNested_${Date.now()}`;
    
    await page.click('[aria-label="Create folder"]');
    await page.fill('input[placeholder="Folder name"]', folderName);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);
    
    await page.locator(`text="${folderName}"`).first().click();
    await page.waitForTimeout(500);
    
    await page.click('[aria-label="Create folder"]');
    await page.fill('input[placeholder="Folder name"]', childFolderName);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);
    
    await page.goto('http://192.168.5.14');
    await page.waitForTimeout(500);
    
    await page.locator(`text="${folderName}"`).first().locator('..').locator('[aria-label="More actions"]').click();
    await page.click('text=Delete');
    await page.click('button:has-text("Delete")');
    await page.waitForTimeout(1000);
    
    await page.click('[href="/recycle-bin"]');
    await page.waitForTimeout(1000);
    
    const parentInBin = await page.locator(`text="${folderName}"`).count();
    const childInBin = await page.locator(`text="${childFolderName}"`).count();
    
    expect(parentInBin).toBe(1);
    expect(childInBin).toBe(0);
  });
});
