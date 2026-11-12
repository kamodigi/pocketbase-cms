import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import Page from './+page.svelte'

describe('home page', () => {
	it('shows the product name as the main heading', () => {
		render(Page)

		expect(screen.getByRole('heading', { level: 1, name: 'pocketbase-cms' })).toBeInTheDocument()
	})
})
