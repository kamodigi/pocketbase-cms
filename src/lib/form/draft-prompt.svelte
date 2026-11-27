<script lang="ts">
	import { onMount } from 'svelte'

	import { Button } from '#lib/components/ui/button/index.js'
	import { m } from '#paraglide/messages.js'

	interface Props {
		ondiscard: () => void
		onrestore: () => void
		/**
		When the unsaved input was kept, as an ISO 8601 string.
		*/
		savedAt: string
		uiLocale: string
	}

	let { ondiscard, onrestore, savedAt, uiLocale }: Props = $props()

	const id = $props.id()
	let section = $state<HTMLElement>()
	const time = $derived(
		new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedAt)),
	)

	// The form waits for this choice, so the keyboard starts here.
	onMount(() => section?.focus())
</script>

<section
	bind:this={section}
	class="bg-card grid gap-3 rounded-xl border p-4"
	aria-describedby="{id}-time"
	aria-labelledby="{id}-title"
	tabindex="-1"
>
	<div class="grid gap-1">
		<h2 class="font-semibold" id="{id}-title">{m.record_draft_title()}</h2>
		<p class="text-muted-foreground text-sm" id="{id}-time">{m.record_draft_saved_at({ time })}</p>
	</div>
	<div class="flex flex-wrap gap-3">
		<Button onclick={onrestore}>{m.record_draft_restore()}</Button>
		<Button onclick={ondiscard} variant="outline">{m.record_draft_discard()}</Button>
	</div>
</section>
