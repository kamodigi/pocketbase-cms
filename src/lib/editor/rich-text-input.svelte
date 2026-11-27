<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import ImagePlusIcon from '@lucide/svelte/icons/image-plus'
	import LinkIcon from '@lucide/svelte/icons/link'
	import Redo2Icon from '@lucide/svelte/icons/redo-2'
	import TableIcon from '@lucide/svelte/icons/table'
	import Undo2Icon from '@lucide/svelte/icons/undo-2'
	import { Editor } from '@tiptap/core'
	import { onDestroy, onMount, untrack } from 'svelte'

	import { Button } from '#lib/components/ui/button/index.js'
	import { mediaFileName } from '#lib/media/library.js'
	import MediaPicker from '#lib/media/media-picker.svelte'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	import type { EditorSettings } from './settings'

	import { editorBlocks } from './blocks'
	import BubbleMenu from './bubble-menu.svelte'
	import { editorExtensions } from './extensions'
	import { mediaFigure } from './images'
	import LinkForm from './link-form.svelte'
	import { editorMarks } from './marks'
	import SlashMenu from './slash-menu.svelte'
	import TableTools from './table-tools.svelte'
	import TextTools from './text-tools.svelte'

	interface Props {
		describedBy?: string
		/**
		The field's label, for the toolbar and the image picker.
		*/
		fieldLabel: string
		/**
		The id the content gets, for a label's `for`.
		*/
		id: string
		invalid?: 'true'
		/**
		The id of the element that names the content.
		*/
		labelledBy: string
		/**
		Called with the new HTML; "" when the content is empty.
		*/
		onchange: (html: string) => void
		readonly?: boolean
		required?: boolean
		settings: EditorSettings
		uiLocale: string
		value: string
	}

	let {
		describedBy,
		fieldLabel,
		id,
		invalid,
		labelledBy,
		onchange,
		readonly = false,
		required = false,
		settings,
		uiLocale,
		value,
	}: Props = $props()

	// The settings stay the same for the life of the input.
	const fixed = untrack(() => settings)
	const marks = editorMarks(fixed)
	const blocks = editorBlocks(fixed, () => (isPickerOpen = true))
	const hasFeature = (feature: Parameters<typeof fixed.features.has>[0]) => fixed.features.has(feature)

	let element = $state<HTMLDivElement>()
	let editor = $state.raw<Editor>()
	// Bumped on every transaction, so that the buttons follow the selection.
	let version = $state(0)
	let isLinkOpen = $state(false)
	let isPickerOpen = $state(false)
	// The HTML this input last sent or loaded; another value comes from outside, such as a restored draft.
	let current = untrack(() => value)

	onMount(() => {
		const instance = new Editor({
			content: current,
			editable: !readonly,
			element: element!,
			extensions: editorExtensions(fixed),
			onTransaction: () => version++,
			onUpdate: ({ editor: changed }) => {
				// Without the empty paragraph the editor keeps after a last image or table, for typing there.
				current = changed.isEmpty ? '' : changed.getHTML().replace(/(?:<p><\/p>)+$/, '')
				onchange(current)
			},
		})
		instance.view.dom.id = id
		editor = instance
	})

	onDestroy(() => editor?.destroy())

	$effect(() => {
		const next = value
		const instance = editor
		if (!instance || next === current) return
		current = next
		instance.commands.setContent(next, { emitUpdate: false })
	})

	$effect(() => {
		editor?.setEditable(!readonly, false)
	})

	// Set on the content itself, which is what the label, the errors and the keyboard reach.
	$effect(() => {
		const dom = editor?.view.dom
		if (!dom) return
		const attributes: Record<string, string | undefined> = {
			'aria-describedby': describedBy,
			'aria-invalid': invalid,
			'aria-labelledby': labelledBy,
			'aria-multiline': 'true',
			'aria-readonly': readonly ? 'true' : undefined,
			'aria-required': required ? 'true' : undefined,
			role: 'textbox',
		}
		for (const [name, text] of Object.entries(attributes)) {
			if (text === undefined) {
				dom.removeAttribute(name)
				continue
			}
			dom.setAttribute(name, text)
		}
	})

	function applyLink(href: string) {
		editor?.chain().focus().extendMarkRange('link').setLink({ href }).run()
		isLinkOpen = false
	}

	function closeLink() {
		isLinkOpen = false
		editor?.commands.focus()
	}

	function focusEditor(event: Event) {
		event.preventDefault()
		editor?.commands.focus()
	}

	async function insertImage(record: RecordModel) {
		const library = fixed.images?.media
		const name = library && mediaFileName(library, record)
		isPickerOpen = false
		if (!library || !name || !editor) return
		// A full URL, so that the stored HTML shows the image anywhere; PocketBase points it at the current
		// file on every read.
		const url = new URL(pb.files.getURL(record, name), location.href).href
		const figure = await mediaFigure(library, record, url)
		if (figure) editor.chain().focus().insertContent({ attrs: figure, type: 'figure' }).run()
	}

	function isOn(name: string): boolean {
		return version >= 0 && Boolean(editor?.isActive(name))
	}

	/**
	Arrow keys move between the toolbar's buttons.
	*/
	function moveInToolbar(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
		const toolbar = event.currentTarget as HTMLElement
		const items = [...toolbar.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')]
		const index = items.indexOf(document.activeElement as HTMLElement)
		if (index === -1) return
		event.preventDefault()
		const step = event.key === 'ArrowRight' ? 1 : -1
		items[(index + step + items.length) % items.length]?.focus()
	}

	function setBlock(name: string) {
		blocks.find(block => block.name === name)?.run(editor!)
	}

	const blockTypes = $derived(blocks.filter(block => block.name === 'paragraph' || block.name.startsWith('heading')))
	const currentBlock = $derived(
		editor && version >= 0 ? (blockTypes.find(block => block.isActive?.(editor!))?.name ?? '') : '',
	)
	const toggleBlocks = $derived(
		blocks.filter(block =>
			['blockquote', 'bulletList', 'codeBlock', 'horizontalRule', 'orderedList'].includes(block.name),
		),
	)
</script>

{#snippet toolButton(label: string, onclick: () => void, Icon: typeof LinkIcon, isPressed?: boolean)}
	<Button
		class="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
		aria-label={label}
		aria-pressed={isPressed}
		disabled={!editor}
		{onclick}
		size="icon-sm"
		title={label}
		variant="ghost"
	>
		<Icon />
	</Button>
{/snippet}

<div
	class={[
		'rich-text bg-background focus-within:border-ring focus-within:ring-ring/50 grid min-w-0 rounded-md border focus-within:ring-3',
		invalid && 'border-destructive',
		readonly && 'opacity-70',
	]}
>
	{#if !readonly}
		<div
			class="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1"
			aria-controls={id}
			aria-label={m.editor_toolbar({ field: fieldLabel })}
			onkeydown={moveInToolbar}
			role="toolbar"
			tabindex="-1"
		>
			{#if blockTypes.length > 1}
				<select
					class="border-input bg-background h-7 rounded-md border px-1.5 text-sm"
					aria-label={m.editor_block_type()}
					disabled={!editor}
					onchange={event => setBlock(event.currentTarget.value)}
					value={currentBlock}
				>
					{#if currentBlock === ''}
						<option disabled value="">—</option>
					{/if}
					{#each blockTypes as block (block.name)}
						<option value={block.name}>{block.label}</option>
					{/each}
				</select>
			{/if}
			{#each marks as mark (mark.name)}
				{@render toolButton(mark.label, () => editor && mark.toggle(editor), mark.icon, isOn(mark.name))}
			{/each}
			{#if hasFeature('link')}
				{@render toolButton(m.editor_link(), () => (isLinkOpen = !isLinkOpen), LinkIcon, isOn('link'))}
			{/if}
			{#if editor}
				<TextTools {editor} settings={fixed} {version} />
			{/if}
			{#each toggleBlocks as block (block.name)}
				{@render toolButton(
					block.label,
					() => editor && block.run(editor),
					block.icon,
					block.isActive ? isOn(block.name) : undefined,
				)}
			{/each}
			{#if fixed.images}
				<MediaPicker
					onCloseAutoFocus={focusEditor}
					onchoose={insertImage}
					target={fixed.images}
					title={m.editor_image_title({ field: fieldLabel })}
					{uiLocale}
					bind:open={isPickerOpen}
				>
					{#snippet trigger({ props })}
						<Button
							{...props}
							aria-label={m.editor_image()}
							disabled={!editor}
							size="icon-sm"
							title={m.editor_image()}
							variant="ghost"
						>
							<ImagePlusIcon />
						</Button>
					{/snippet}
				</MediaPicker>
			{/if}
			{#if hasFeature('table')}
				{@render toolButton(
					m.editor_table(),
					() => editor?.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
					TableIcon,
				)}
				{#if editor && isOn('table')}
					<TableTools {editor} />
				{/if}
			{/if}
			<span class="bg-border mx-1 h-5 w-px" aria-hidden="true"></span>
			{@render toolButton(m.editor_undo(), () => editor?.chain().focus().undo().run(), Undo2Icon)}
			{@render toolButton(m.editor_redo(), () => editor?.chain().focus().redo().run(), Redo2Icon)}
		</div>
		{#if isLinkOpen && editor}
			<div class="border-b p-2">
				<LinkForm
					href={editor.getAttributes('link').href ?? ''}
					onapply={applyLink}
					oncancel={closeLink}
					onremove={editor.isActive('link')
						? () => {
								editor?.chain().focus().extendMarkRange('link').unsetLink().run()
								isLinkOpen = false
							}
						: undefined}
				/>
			</div>
		{/if}
	{/if}

	<div bind:this={element} class="rich-text-content relative min-h-48"></div>

	{#if editor && !readonly}
		<BubbleMenu {editor} hasLink={hasFeature('link')} {marks} {version} />
		<SlashMenu {blocks} {editor} />
	{/if}
</div>
{#if !readonly && blocks.length > 1}
	<p class="text-muted-foreground text-xs">{m.editor_hint()}</p>
{/if}

<style>
	.rich-text-content :global(.ProseMirror) {
		min-height: 12rem;
		padding: 0.75rem 1rem;
		outline: none;
		overflow-wrap: anywhere;
	}

	.rich-text-content :global(.ProseMirror > * + *) {
		margin-top: 0.75em;
	}

	.rich-text-content :global(h1) {
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.rich-text-content :global(h2) {
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.35;
	}

	.rich-text-content :global(h3) {
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.rich-text-content :global(:is(h4, h5, h6)) {
		font-size: 1.0625rem;
		font-weight: 600;
	}

	.rich-text-content :global(ul) {
		padding-left: 1.5rem;
		list-style: disc;
	}

	.rich-text-content :global(ol) {
		padding-left: 1.5rem;
		list-style: decimal;
	}

	.rich-text-content :global(a) {
		color: var(--link);
		text-decoration: underline;
	}

	.rich-text-content :global(blockquote) {
		padding-left: 1rem;
		color: var(--muted-foreground);
		border-left: 3px solid var(--border);
	}

	.rich-text-content :global(code) {
		padding: 0.1em 0.3em;
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
		background: var(--muted);
		border-radius: 0.25rem;
	}

	.rich-text-content :global(pre) {
		padding: 0.75rem 1rem;
		overflow-x: auto;
		background: var(--muted);
		border-radius: 0.25rem;
	}

	.rich-text-content :global(pre code) {
		padding: 0;
		background: none;
	}

	.rich-text-content :global(hr) {
		border-color: var(--border);
	}

	.rich-text-content :global(img) {
		display: inline-block;
		max-width: 100%;
		height: auto;
	}

	.rich-text-content :global(figure) {
		display: grid;
		gap: 0.375rem;
		justify-items: start;
	}

	.rich-text-content :global(figcaption) {
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.rich-text-content :global(.ProseMirror-selectednode) {
		outline: 3px solid var(--ring);
		outline-offset: 2px;
	}

	.rich-text-content :global(table) {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
	}

	.rich-text-content :global(:is(td, th)) {
		position: relative;
		padding: 0.375rem 0.5rem;
		vertical-align: top;
		border: 1px solid var(--border);
	}

	.rich-text-content :global(th) {
		font-weight: 600;
		text-align: left;
		background: var(--muted);
	}

	.rich-text-content :global(.selectedCell::after) {
		position: absolute;
		inset: 0;
		pointer-events: none;
		content: '';
		background: color-mix(in srgb, var(--ring) 20%, transparent);
	}
</style>
