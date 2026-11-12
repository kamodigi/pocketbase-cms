import { render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { describe, expect, it } from 'vitest'

import type { ConfigResult } from '#lib/config/index.js'

import Layout from './+layout.svelte'

const children = createRawSnippet(() => ({ render: () => '<p>screen</p>' }))

function renderLayout(config: ConfigResult) {
	render(Layout, { children, data: { config }, params: {} })
}

describe('root layout', () => {
	it('renders the screen when the config is valid', () => {
		renderLayout({ config: { collections: { posts: {} }, version: 1 }, ok: true })

		expect(screen.getByText('screen')).toBeInTheDocument()
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('shows the config errors instead of the screen', () => {
		renderLayout({ errors: [{ message: 'unknown key', path: '/theme' }], ok: false })

		expect(screen.getByRole('alert')).toHaveTextContent('/theme unknown key')
		expect(screen.queryByText('screen')).not.toBeInTheDocument()
	})
})
