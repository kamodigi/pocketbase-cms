<script lang="ts">
	import type { Editor } from '@tiptap/core'

	import BetweenHorizontalEndIcon from '@lucide/svelte/icons/between-horizontal-end'
	import BetweenVerticalEndIcon from '@lucide/svelte/icons/between-vertical-end'
	import Columns3Icon from '@lucide/svelte/icons/columns-3'
	import Grid2x2XIcon from '@lucide/svelte/icons/grid-2x2-x'
	import Rows3Icon from '@lucide/svelte/icons/rows-3'

	import { Button } from '#lib/components/ui/button/index.js'
	import { m } from '#paraglide/messages.js'

	interface Props {
		editor: Editor
	}

	let { editor }: Props = $props()

	const actions = [
		{
			icon: BetweenHorizontalEndIcon,
			label: m.editor_table_add_row(),
			run: () => editor.chain().focus().addRowAfter().run(),
		},
		{
			icon: BetweenVerticalEndIcon,
			label: m.editor_table_add_column(),
			run: () => editor.chain().focus().addColumnAfter().run(),
		},
		{ icon: Rows3Icon, label: m.editor_table_delete_row(), run: () => editor.chain().focus().deleteRow().run() },
		{
			icon: Columns3Icon,
			label: m.editor_table_delete_column(),
			run: () => editor.chain().focus().deleteColumn().run(),
		},
		{ icon: Grid2x2XIcon, label: m.editor_table_delete(), run: () => editor.chain().focus().deleteTable().run() },
	]
</script>

{#each actions as action (action.label)}
	{@const Icon = action.icon}
	<Button aria-label={action.label} onclick={action.run} size="icon-sm" title={action.label} variant="ghost">
		<Icon />
	</Button>
{/each}
