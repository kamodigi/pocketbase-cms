<script lang="ts">
	import { page } from '$app/state'

	import { resolveLabel } from '#lib/config/index.js'
	import { m } from '#paraglide/messages.js'
	import { getLocale } from '#paraglide/runtime.js'

	import type { PageProps } from './$types'

	let { data }: PageProps = $props()

	const collection = $derived(page.params.collection ?? '')
	const label = $derived(resolveLabel(data.cms?.collections[collection]?.label, getLocale(), collection))
</script>

<h1 class="text-2xl font-bold">{label}</h1>
<!-- The list screen replaces this notice. -->
<p class="text-muted-foreground">{m.collection_screen_pending()}</p>
