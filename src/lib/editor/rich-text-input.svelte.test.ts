import { render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { EditorConfig } from '#lib/config/index.js'

import RichTextInput from './rich-text-input.svelte'
import { editorSettings } from './settings'

vi.mock('$app/navigation', () => ({ goto: vi.fn() }))

// jsdom has no layout; ProseMirror and the floating menus ask for positions.
beforeAll(() => {
	const rect = { bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0 }
	const rects = () => Object.assign([rect], { item: () => rect }) as unknown as DOMRectList
	Range.prototype.getBoundingClientRect = () => rect
	Range.prototype.getClientRects = rects
	Element.prototype.getClientRects = rects
	// eslint-disable-next-line unicorn/no-null -- what elementFromPoint returns for no element
	document.elementFromPoint = () => null
})

function setup(props: { config?: EditorConfig; readonly?: boolean; value?: string } = {}) {
	const onchange = vi.fn<(html: string) => void>()
	const result = render(RichTextInput, {
		fieldLabel: 'Body',
		id: 'body-input',
		labelledBy: 'body-label',
		onchange,
		readonly: props.readonly,
		settings: editorSettings(props.config, undefined, undefined),
		uiLocale: 'en',
		value: props.value ?? '',
	})
	return { ...result, onchange }
}

async function toolbar(): Promise<HTMLElement> {
	return screen.findByRole('toolbar', { name: 'Formatting of Body' })
}

describe('RichTextInput', () => {
	it('shows the saved HTML and sends what is typed as HTML', async () => {
		const user = userEvent.setup()
		const { onchange } = setup({ value: '<p>Hello</p>' })

		const content = await screen.findByRole('textbox')
		expect(content).toHaveAttribute('aria-labelledby', 'body-label')
		expect(content).toHaveTextContent('Hello')
		await user.click(content)
		await user.keyboard('{Control>}a{/Control}Bye')

		await waitFor(() => expect(onchange).toHaveBeenLastCalledWith('<p>Bye</p>'))
	})

	it('sends "" when everything is deleted', async () => {
		const user = userEvent.setup()
		const { onchange } = setup({ value: '<p>Hi</p>' })

		await user.click(await screen.findByRole('textbox'))
		await user.keyboard('{Control>}a{/Control}{Backspace}')

		await waitFor(() => expect(onchange).toHaveBeenLastCalledWith(''))
	})

	it('offers only the features of its settings', async () => {
		setup({ config: { features: ['bold', 'link'] } })

		const tools = within(await toolbar())
		await waitFor(() => expect(tools.getByRole('button', { name: 'Bold' })).toBeEnabled())
		expect(tools.getByRole('button', { name: 'Link' })).toBeEnabled()
		expect(tools.queryByRole('button', { name: 'Italic' })).toBeNull()
		expect(tools.queryByRole('combobox', { name: 'Text style' })).toBeNull()
		expect(tools.queryByRole('button', { name: 'Insert an image' })).toBeNull()
	})

	it('makes text bold from the toolbar', async () => {
		const user = userEvent.setup()
		const { onchange } = setup({ value: '<p>Bold</p>' })

		await user.click(await screen.findByRole('textbox'))
		await user.keyboard('{Control>}a{/Control}')
		const bold = within(await toolbar()).getByRole('button', { name: 'Bold' })
		await user.click(bold)

		await waitFor(() => expect(onchange).toHaveBeenLastCalledWith('<p><strong>Bold</strong></p>'))
		expect(bold).toHaveAttribute('aria-pressed', 'true')
	})

	it('shows a value set from outside, such as a restored draft, without sending it back', async () => {
		const { onchange, rerender } = setup({ value: '<p>Saved</p>' })
		await screen.findByRole('textbox')

		await rerender({ value: '<p>Restored</p>' })

		expect(await screen.findByText('Restored')).toBeVisible()
		expect(onchange).not.toHaveBeenCalled()
	})

	it('has no toolbar and cannot be edited when read-only', async () => {
		setup({ readonly: true, value: '<p>Fixed</p>' })

		const content = await screen.findByRole('textbox')
		expect(content).toHaveAttribute('contenteditable', 'false')
		expect(content).toHaveAttribute('aria-readonly', 'true')
		expect(screen.queryByRole('toolbar')).toBeNull()
	})
})
