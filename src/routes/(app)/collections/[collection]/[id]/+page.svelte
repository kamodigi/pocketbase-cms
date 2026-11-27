<script lang="ts">
	import { page } from '$app/state'

	import { resolveLabel } from '#lib/config/index.js'
	import RecordForm from '#lib/form/record-form.svelte'
	import { getLocale } from '#paraglide/runtime.js'

	import type { PageProps } from './$types'

	let { data }: PageProps = $props()

	const collection = $derived(page.params.collection ?? '')
	const id = $derived(page.params.id ?? '')
	const schema = $derived(data.schema.find(item => item.name === collection))
	const label = $derived(resolveLabel(data.cms?.collections[collection]?.label, getLocale(), collection))
</script>

{#if schema && data.cms}
	<!-- Keyed, so that the inputs of one record never carry over to another. -->
	{#key `${collection}/${id}`}
		<RecordForm
			{collection}
			collections={data.schema}
			config={data.cms}
			{label}
			record={data.record}
			{schema}
			uiLocale={getLocale()}
		/>
	{/key}
{/if}
