import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import { checkContrast } from './brand'
import ContrastWarnings from './contrast-warnings.svelte'

describe('ContrastWarnings', () => {
	it('renders nothing when the accent is readable', () => {
		render(ContrastWarnings, { warnings: [] })

		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})

	it('lists what falls short, with the ratio and the mode', () => {
		render(ContrastWarnings, { warnings: checkContrast('#f5c400') })

		const status = screen.getByRole('status')
		expect(status).toHaveTextContent('brand.accent')
		expect(status).toHaveTextContent(
			/Buttons and focus rings in the accent color are 1\.\d:1 against the page in Light mode \(need 3:1\)/,
		)
	})
})
