<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js'
	import { m } from '#paraglide/messages.js'

	import type { Cell } from './cell'

	import StatusBadge from './status-badge.svelte'

	interface Props {
		cell: Cell
	}

	let { cell }: Props = $props()
</script>

{#if cell.kind === 'text'}
	<span class="line-clamp-2 max-w-md min-w-32 whitespace-normal">{cell.text}</span>
{:else if cell.kind === 'date'}
	<time class="text-muted-foreground tabular-nums" datetime={cell.dateTime}>{cell.text}</time>
{:else if cell.kind === 'status'}
	<StatusBadge state={cell.state} />
{:else if cell.kind === 'badge'}
	<Badge variant="outline">{cell.badge}</Badge>
{:else if cell.kind === 'link'}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- an external URL stored in the record -->
	<a
		class="text-link block max-w-xs truncate underline underline-offset-2"
		href={cell.href}
		rel="noreferrer"
		target="_blank"
	>
		{cell.href}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else if cell.kind === 'files'}
	<span class="flex items-center gap-1.5">
		{#each cell.files as file, index (index)}
			{#if file.thumbnail}
				<img alt={file.name} class="bg-muted size-12 rounded-md object-cover" loading="lazy" src={file.thumbnail} />
			{:else}
				<span class="max-w-xs truncate">{file.name}</span>
			{/if}
		{/each}
	</span>
{:else}
	<span aria-hidden="true" class="text-muted-foreground">—</span>
	<span class="sr-only">{m.list_no_value()}</span>
{/if}
