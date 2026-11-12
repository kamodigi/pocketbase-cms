import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { userPrefersMode } from 'mode-watcher'
import { describe, expect, it } from 'vitest'

import ThemeToggle from './theme-toggle.svelte'

describe('ThemeToggle', () => {
	it('is a labelled radio group with light, dark and system', () => {
		render(ThemeToggle)

		expect(screen.getByRole('radiogroup', { name: 'Color theme' })).toBeInTheDocument()
		expect(screen.getAllByRole('radio').map(radio => radio.parentElement?.title)).toEqual([
			'Light',
			'Dark',
			'Follow system',
		])
	})

	it('switches to dark mode by keyboard', async () => {
		const user = userEvent.setup()
		render(ThemeToggle)

		screen.getByRole('radio', { name: 'Dark' }).focus()
		await user.keyboard(' ')

		expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
		expect(userPrefersMode.current).toBe('dark')
	})
})
