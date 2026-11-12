import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import Gallery from './gallery.svelte'

describe('component gallery', () => {
	it('shows the main sections', () => {
		render(Gallery)

		for (const name of [
			'Role tokens',
			'Buttons',
			'Form controls',
			'Status badges',
			'Table',
			'Dialog and notifications',
		]) {
			expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
		}
	})

	it('has a skip link and a navigation landmark for the shell', () => {
		render(Gallery)

		expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
		expect(screen.getAllByRole('link', { name: 'Components' }).length).toBeGreaterThan(0)
	})

	it('opens the dialog by keyboard and closes it with Escape', async () => {
		const user = userEvent.setup()
		render(Gallery)

		screen.getByRole('button', { name: 'Delete post…' }).focus()
		await user.keyboard('{Enter}')
		expect(await screen.findByRole('dialog', { name: 'Delete this post?' })).toBeInTheDocument()

		await user.keyboard('{Escape}')
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
	})
})
