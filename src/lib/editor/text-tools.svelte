<script lang="ts">
	import type { Editor } from '@tiptap/core'

	import BaselineIcon from '@lucide/svelte/icons/baseline'
	import TextAlignCenterIcon from '@lucide/svelte/icons/text-align-center'
	import TextAlignEndIcon from '@lucide/svelte/icons/text-align-end'
	import TextAlignStartIcon from '@lucide/svelte/icons/text-align-start'

	import { Button } from '#lib/components/ui/button/index.js'
	import { m } from '#paraglide/messages.js'

	import type { EditorSettings } from './settings'

	interface Props {
		editor: Editor
		settings: EditorSettings
		/**
		Changes with every transaction, so that the buttons follow the selection.
		*/
		version: number
	}

	let { editor, settings, version }: Props = $props()

	const id = $props.id()
	const alignments = [
		{ icon: TextAlignStartIcon, label: m.editor_align_left(), value: 'left' },
		{ icon: TextAlignCenterIcon, label: m.editor_align_center(), value: 'center' },
		{ icon: TextAlignEndIcon, label: m.editor_align_right(), value: 'right' },
	]

	const color = $derived(version >= 0 ? (editor.getAttributes('textStyle').color as string | undefined) : undefined)

	function align(value: string) {
		// Left is the default: choosing it again, or choosing it at all, writes nothing.
		const isOn = editor.isActive({ textAlign: value })
		if (value === 'left' || isOn) editor.chain().focus().unsetTextAlign().run()
		else editor.chain().focus().setTextAlign(value).run()
	}

	/**
	The color as #rrggbb for the color input, which takes nothing else.
	*/
	function hex(value: string | undefined): string {
		if (!value) return '#000000'
		if (/^#[\da-f]{6}$/i.test(value)) return value
		const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value)
		return rgb
			? `#${rgb
					.slice(1, 4)
					.map(part => Number(part).toString(16).padStart(2, '0'))
					.join('')}`
			: '#000000'
	}
</script>

{#if settings.features.has('textAlign')}
	{#each alignments as alignment (alignment.value)}
		{@const Icon = alignment.icon}
		<Button
			class="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
			aria-label={alignment.label}
			aria-pressed={version >= 0 &&
				(alignment.value === 'left'
					? !editor.isActive({ textAlign: 'center' }) && !editor.isActive({ textAlign: 'right' })
					: editor.isActive({ textAlign: alignment.value }))}
			onclick={() => align(alignment.value)}
			size="icon-sm"
			title={alignment.label}
			variant="ghost"
		>
			<Icon />
		</Button>
	{/each}
{/if}
{#if settings.features.has('textColor')}
	<label
		class="hover:bg-muted focus-within:ring-ring/50 relative inline-flex size-7 cursor-pointer items-center justify-center rounded-md focus-within:ring-3"
		for="{id}-color"
		title={m.editor_text_color()}
	>
		<BaselineIcon class="size-4" style={color ? `color: ${color}` : undefined} />
		<span class="sr-only">{m.editor_text_color()}</span>
		<input
			id="{id}-color"
			class="absolute inset-0 size-full cursor-pointer opacity-0"
			oninput={event => editor.chain().focus().setColor(event.currentTarget.value).run()}
			type="color"
			value={hex(color)}
		/>
	</label>
	{#if color}
		<Button
			class="text-xs"
			aria-label={m.editor_text_color_remove()}
			onclick={() => editor.chain().focus().unsetColor().run()}
			size="sm"
			title={m.editor_text_color_remove()}
			variant="ghost"
		>
			<span class="size-3 rounded-full border" style="background: {color}" aria-hidden="true"></span>×
		</Button>
	{/if}
{/if}
