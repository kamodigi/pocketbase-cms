import { render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it } from 'vitest'

import { baseLocale, setLocale } from '#paraglide/runtime.js'

import Page from './+page.svelte'

describe('home page', () => {
	afterEach(() => setLocale(baseLocale, { reload: false }))

	it('shows the product name as the main heading', () => {
		render(Page)

		expect(screen.getByRole('heading', { level: 1, name: 'pocketbase-cms' })).toBeInTheDocument()
	})

	it('shows the scaffold notice in English by default', () => {
		render(Page)

		expect(screen.getByText(/This build is a scaffold/)).toBeInTheDocument()
	})

	it('shows the scaffold notice in Japanese after switching the locale', () => {
		setLocale('ja', { reload: false })
		render(Page)

		expect(screen.getByText(/このビルドは雛形/)).toBeInTheDocument()
		expect(screen.queryByText(/This build is a scaffold/)).not.toBeInTheDocument()
	})

	it('offers each language under its own name', () => {
		render(Page)

		expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
		expect(screen.getByRole('option', { name: '日本語' })).toBeInTheDocument()
	})
})
