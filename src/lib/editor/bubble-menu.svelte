<script lang="ts">
	import type { Editor } from '@tiptap/core'

	import LinkIcon from '@lucide/svelte/icons/link'
	import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu'
	import { NodeSelection, PluginKey } from '@tiptap/pm/state'
	import { onDestroy, onMount } from 'svelte'

	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { m } from '#paraglide/messages.js'

	import type { FigureAttributes } from './extensions'
	import type { Mark } from './marks'

	import LinkForm from './link-form.svelte'
	import { linkTarget } from './links'

	interface Props {
		editor: Editor
		/**
		Whether links are on.
		*/
		hasLink: boolean
		/**
		The mark buttons the field's settings offer.
		*/
		marks: Mark[]
		/**
		Changes with every transaction, so that the buttons show the marks at the selection.
		*/
		version: number
	}

	let { editor, hasLink, marks, version }: Props = $props()

	const id = $props.id()
	const key = new PluginKey('pbcmsBubbleMenu')
	let menu = $state<HTMLDivElement>()
	let isLinkOpen = $state(false)
	let figure = $state<FigureAttributes>()
	let caption = $state('')
	let figureLink = $state('')
	let figureProblem = $state('')

	onMount(() => {
		editor.registerPlugin(
			BubbleMenuPlugin({
				editor,
				element: menu!,
				options: { flip: true, offset: 8, placement: 'top', shift: { padding: 8 } },
				pluginKey: key,
				shouldShow: ({ from, state, to, view }) => {
					const isInMenu = menu?.contains(document.activeElement) ?? false
					if (!(isInMenu || view.hasFocus()) || !editor.isEditable) return false
					if (isFigureSelected()) return true
					return from !== to && !isNodeSelection() && state.doc.textBetween(from, to).length > 0
				},
			}),
		)
		editor.on('selectionUpdate', selectionChanged)
		selectionChanged()
	})

	onDestroy(() => {
		editor.off('selectionUpdate', selectionChanged)
		if (!editor.isDestroyed) editor.unregisterPlugin(key)
	})

	function applyFigure() {
		const href = figureLink.trim() === '' ? undefined : linkTarget(figureLink)
		if (href === undefined && figureLink.trim() !== '') {
			figureProblem = m.editor_link_invalid()
			return
		}
		figureProblem = ''
		const text = caption.trim()
		editor
			.chain()
			.focus()
			.updateAttributes('figure', { caption: text === '' ? undefined : text, href })
			.run()
	}

	function applyLink(href: string) {
		editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
		isLinkOpen = false
	}

	function closeLink() {
		isLinkOpen = false
		editor.commands.focus()
	}

	function figureKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.isComposing) {
			// Not the record's form: the editor is inside it.
			event.preventDefault()
			applyFigure()
		} else if (event.key === 'Escape') {
			event.preventDefault()
			editor.commands.focus()
		}
	}

	function isFigureSelected(): boolean {
		const { selection } = editor.state
		return selection instanceof NodeSelection && selection.node.type.name === 'figure'
	}

	function isNodeSelection(): boolean {
		return editor.state.selection instanceof NodeSelection
	}

	function removeLink() {
		editor.chain().focus().extendMarkRange('link').unsetLink().run()
		isLinkOpen = false
	}

	function selectionChanged() {
		isLinkOpen = false
		const selection = editor.state.selection
		figure = isFigureSelected() ? ((selection as NodeSelection).node.attrs as FigureAttributes) : undefined
		caption = figure?.caption ?? ''
		figureLink = figure?.href ?? ''
		figureProblem = ''
	}
</script>

<div
	bind:this={menu}
	class="bg-popover text-popover-foreground z-40 grid max-w-[calc(100vw-2rem)] gap-2 rounded-md border p-1.5 shadow-md"
>
	{#if figure}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="grid w-80 max-w-full gap-2 p-1"
			aria-label={m.editor_figure_menu()}
			onkeydown={figureKeydown}
			role="group"
		>
			<div class="grid gap-1">
				<Label class="text-xs" for="{id}-caption">{m.editor_figure_caption()}</Label>
				<Input id="{id}-caption" class="h-8" autocomplete="off" bind:value={caption} />
			</div>
			{#if hasLink}
				<div class="grid gap-1">
					<Label class="text-xs" for="{id}-href">{m.editor_figure_link()}</Label>
					<Input
						id="{id}-href"
						class="h-8"
						aria-describedby={figureProblem ? `${id}-problem` : undefined}
						aria-invalid={figureProblem ? 'true' : undefined}
						autocomplete="off"
						inputmode="url"
						placeholder="https://"
						bind:value={figureLink}
					/>
					{#if figureProblem}
						<p class="text-destructive text-sm" id="{id}-problem">{figureProblem}</p>
					{/if}
				</div>
			{/if}
			<Button class="justify-self-start" onclick={applyFigure} size="sm">{m.editor_figure_apply()}</Button>
		</div>
	{:else if isLinkOpen}
		<div class="w-96 max-w-full p-1">
			<LinkForm
				href={editor.getAttributes('link').href ?? ''}
				onapply={applyLink}
				oncancel={closeLink}
				onremove={editor.isActive('link') ? removeLink : undefined}
			/>
		</div>
	{:else}
		<div class="flex items-center gap-0.5" aria-label={m.editor_selection_menu()} role="toolbar">
			{#each marks as mark (mark.name)}
				{@const Icon = mark.icon}
				{@const isOn = version >= 0 && editor.isActive(mark.name)}
				<Button
					aria-label={mark.label}
					aria-pressed={isOn}
					class="aria-pressed:bg-accent"
					onclick={() => mark.toggle(editor)}
					onmousedown={(event: MouseEvent) => event.preventDefault()}
					size="icon-sm"
					title={mark.label}
					variant="ghost"
				>
					<Icon />
				</Button>
			{/each}
			{#if hasLink}
				<Button
					aria-label={m.editor_link()}
					aria-pressed={version >= 0 && editor.isActive('link')}
					class="aria-pressed:bg-accent"
					onclick={() => (isLinkOpen = true)}
					onmousedown={(event: MouseEvent) => event.preventDefault()}
					size="icon-sm"
					title={m.editor_link()}
					variant="ghost"
				>
					<LinkIcon />
				</Button>
			{/if}
		</div>
	{/if}
</div>
