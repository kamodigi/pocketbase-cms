import { expect, test } from '@playwright/test'

test('shows the scaffold page and switches the UI language', async ({ page }) => {
	await page.goto('/cms/')

	await expect(page.getByRole('heading', { level: 1, name: 'pocketbase-cms' })).toBeVisible()
	await expect(page.getByText(/This build is a scaffold/)).toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('lang', 'en')

	await page.getByLabel('Language').selectOption('日本語')

	await expect(page.getByText(/このビルドは雛形/)).toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja')

	// The choice is remembered across visits.
	await page.reload()
	await expect(page.getByLabel('言語')).toHaveValue('ja')
})
