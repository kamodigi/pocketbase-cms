import { expect, test } from '@playwright/test'

test('switches the UI language on the sign-in screen and remembers it', async ({ page }) => {
	await page.goto('/cms/')

	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('lang', 'en')

	await page.getByLabel('Language').selectOption('日本語')

	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja')

	// The choice is remembered across visits.
	await page.reload()
	await expect(page.getByLabel('言語')).toHaveValue('ja')
})
