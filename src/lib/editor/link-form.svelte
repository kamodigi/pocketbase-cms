<script lang="ts">
	import { onMount } from 'svelte'

	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { m } from '#paraglide/messages.js'

	import { linkTarget } from './links'

	interface Props {
		/**
		The link being edited; empty for a new one.
		*/
		href: string
		label?: string
		onapply: (href: string) => void
		oncancel: () => void
		/**
		Offered when there is a link to remove.
		*/
		onremove?: () => void
	}

	let { href, label = m.editor_link_url(), onapply, oncancel, onremove }: Props = $props()

	const id = $props.id()
	// The form starts from the link it edits, then holds what is typed.
	// svelte-ignore state_referenced_locally
	let text = $state(href)
	let problem = $state('')
	// eslint-disable-next-line unicorn/no-null -- the empty value of the input's `ref`
	let input = $state<HTMLInputElement | null>(null)

	onMount(() => input?.focus())

	function apply() {
		const target = linkTarget(text)
		if (target === undefined) {
			problem = m.editor_link_invalid()
			input?.focus()
			return
		}
		onapply(target)
	}

	// Not a <form>: the editor is inside the record's form. Enter applies, Escape cancels.
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault()
			event.stopPropagation()
			oncancel()
		} else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.isComposing) {
			event.preventDefault()
			apply()
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="flex flex-wrap items-end gap-2" aria-label={label} onkeydown={keydown} role="group">
	<div class="grid min-w-48 flex-1 gap-1">
		<Label class="text-xs" for="{id}-href">{label}</Label>
		<Input
			id="{id}-href"
			class="h-8"
			aria-describedby={problem ? `${id}-problem` : undefined}
			aria-invalid={problem ? 'true' : undefined}
			autocomplete="off"
			inputmode="url"
			placeholder="https://"
			bind:ref={input}
			bind:value={text}
		/>
	</div>
	<Button onclick={apply} size="sm">{m.editor_link_apply()}</Button>
	{#if onremove}
		<Button onclick={onremove} size="sm" variant="outline">{m.editor_link_remove()}</Button>
	{/if}
	<Button onclick={oncancel} size="sm" variant="ghost">{m.editor_cancel()}</Button>
	{#if problem}
		<p class="text-destructive basis-full text-sm" id="{id}-problem">{problem}</p>
	{/if}
</div>
