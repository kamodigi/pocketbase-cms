<script lang="ts">
	import { resolve } from '$app/paths'
	import { page } from '$app/state'

	import { resolveLabel } from '#lib/config/index.js'
	import { m } from '#paraglide/messages.js'
	import { getLocale } from '#paraglide/runtime.js'

	import type { PageProps } from './$types'

	let { data }: PageProps = $props()

	const collection = $derived(page.params.collection ?? '')
	const config = $derived(data.cms?.collections[collection])
	const label = $derived(resolveLabel(config?.label, getLocale(), collection))
</script>

<h1 class="text-2xl font-bold">{label}</h1>
<!-- The edit screen replaces this notice. -->
<p class="text-muted-foreground">{m.record_screen_pending()}</p>
{#if !config?.singleton}
	<a
		class="text-link justify-self-start text-sm underline underline-offset-2"
		href={resolve('/(app)/collections/[collection]', { collection })}
	>
		{m.record_back_to_list()}
	</a>
{/if}
