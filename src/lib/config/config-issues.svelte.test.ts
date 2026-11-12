import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import ConfigIssues from './config-issues.svelte'

const issues = [
	{ message: 'unknown key', path: '/theme' },
	{ message: 'config.json was not found.', path: '' },
]

describe('ConfigIssues', () => {
	it('shows errors as an alert with their paths', () => {
		render(ConfigIssues, { issues, tone: 'error' })

		const alert = screen.getByRole('alert')
		expect(alert).toHaveTextContent('cms.config.json has errors')
		expect(screen.getAllByRole('listitem').map(li => li.textContent?.trim())).toEqual([
			'/theme unknown key',
			'config.json was not found.',
		])
	})

	it('shows warnings as a status message', () => {
		render(ConfigIssues, { issues, tone: 'warning' })

		expect(screen.getByRole('status')).toHaveTextContent('cms.config.json does not match the PocketBase schema')
	})

	it('renders nothing without issues', () => {
		render(ConfigIssues, { issues: [], tone: 'error' })

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
	})
})
