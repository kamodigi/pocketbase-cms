<script lang="ts">
	import type { Editor } from '@tiptap/core'

	import { FloatingMenuPlugin } from '@tiptap/extension-floating-menu'
	import { Plugin, PluginKey } from '@tiptap/pm/state'
	import { onDestroy, onMount } from 'svelte'

	import { m } from '#paraglide/messages.js'

	import type { Block } from './blocks'

	import { slashQuery } from './slash'

	interface Props {
		blocks: Block[]
		editor: Editor
	}

	let { blocks, editor }: Props = $props()

	const id = $props.id()
	const menuKey = new PluginKey('pbcmsSlashMenu')
	const keysKey = new PluginKey('pbcmsSlashKeys')
	let menu = $state<HTMLDivElement>()
	let query = $state<string>()
	let active = $state(0)
	// Set by Escape: the menu stays closed until the line no longer starts with "/".
	let isDismissed = false

	const matches = $derived(
		query === undefined
			? []
			: blocks.filter(block => {
					const text = query!.toLowerCase()
					return block.label.toLowerCase().includes(text) || block.name.toLowerCase().includes(text)
				}),
	)

	// Screen readers follow the active option while the keyboard stays in the editor.
	$effect(() => {
		const option = matches[active]
		const dom = editor.view.dom
		if (option) {
			dom.setAttribute('aria-controls', `${id}-list`)
			dom.setAttribute('aria-activedescendant', `${id}-${option.name}`)
		} else {
			dom.removeAttribute('aria-controls')
			dom.removeAttribute('aria-activedescendant')
		}
	})

	onMount(() => {
		editor.registerPlugin(
			FloatingMenuPlugin({
				editor,
				element: menu!,
				options: { flip: true, offset: 4, placement: 'bottom-start', shift: true },
				pluginKey: menuKey,
				shouldShow: ({ state }) => !isDismissed && editor.isEditable && slashQuery(state) !== undefined,
			}),
		)
		// Before the editor's own keys, so that Enter picks a block instead of breaking the line.
		editor.registerPlugin(
			new Plugin({ key: keysKey, props: { handleKeyDown: (_view, event) => isHandled(event) } }),
			(plugin, plugins) => [plugin, ...plugins],
		)
		editor.on('transaction', update)
		update()
	})

	onDestroy(() => {
		editor.off('transaction', update)
		if (editor.isDestroyed) return
		editor.unregisterPlugin(menuKey)
		editor.unregisterPlugin(keysKey)
	})

	function choose(block: Block) {
		const at = editor.state.selection.$from
		// Removes the typed "/…" before the block takes the line.
		editor.chain().focus().deleteRange({ from: at.start(), to: at.pos }).run()
		block.run(editor)
	}

	function isHandled(event: KeyboardEvent): boolean {
		if (query === undefined || event.isComposing) return false
		const count = matches.length
		switch (event.key) {
			case 'ArrowDown': {
				if (count > 0) active = (active + 1) % count
				return true
			}
			case 'ArrowUp': {
				if (count > 0) active = (active - 1 + count) % count
				return true
			}
			case 'Enter': {
				const block = matches[active]
				if (!block) return false
				choose(block)
				return true
			}
			case 'Escape': {
				// Leaves the text as typed.
				isDismissed = true
				query = undefined
				editor.view.dispatch(editor.state.tr.setMeta(menuKey, 'hide'))
				return true
			}
			default: {
				return false
			}
		}
	}

	function update() {
		const next = editor.isEditable ? slashQuery(editor.state) : undefined
		if (next === undefined) isDismissed = false
		if (isDismissed) return
		if (next !== query) active = 0
		query = next
	}
</script>

<div
	bind:this={menu}
	class="bg-popover text-popover-foreground z-50 grid max-h-72 min-w-48 overflow-y-auto rounded-md border p-1 shadow-md"
>
	{#if matches.length > 0}
		<div id="{id}-list" aria-label={m.editor_slash_menu()} role="listbox">
			{#each matches as block, index (block.name)}
				{@const Icon = block.icon}
				<!-- The keyboard stays in the editor, which moves the active option. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					id="{id}-{block.name}"
					class={[
						'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
						index === active && 'bg-accent text-accent-foreground',
					]}
					aria-selected={index === active}
					onclick={() => choose(block)}
					onmousedown={event => event.preventDefault()}
					onmouseenter={() => (active = index)}
					role="option"
					tabindex="-1"
				>
					<Icon class="text-muted-foreground size-4" />
					{block.label}
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-muted-foreground px-2 py-1.5 text-sm">{m.editor_slash_none()}</p>
	{/if}
</div>
