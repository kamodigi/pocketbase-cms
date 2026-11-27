<script lang="ts">
	import { page } from '$app/state'

	import { resolveLabel } from '#lib/config/index.js'
	import RecordList from '#lib/list/record-list.svelte'
	import { m } from '#paraglide/messages.js'
	import { getLocale } from '#paraglide/runtime.js'

	import type { PageProps } from './$types'

	let { data }: PageProps = $props()

	const collection = $derived(page.params.collection ?? '')
	const label = $derived(resolveLabel(data.cms?.collections[collection]?.label, getLocale(), collection))
</script>

<h1 class="text-2xl font-bold">{label}</h1>

{#if data.cms && data.list}
	<!-- Keyed, so that a half-typed search never carries over to another collection. -->
	{#key collection}
		<RecordList {collection} config={data.cms} {label} list={data.list} schema={data.schema} />
	{/key}
{:else}
	<!-- Only a single page without its record gets here. -->
	<p class="text-muted-foreground">{m.list_singleton_missing()}</p>
{/if}
