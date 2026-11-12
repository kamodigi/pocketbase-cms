<script lang="ts">
	import favicon from '#lib/assets/favicon.svg'
	import ConfigIssues from '#lib/config/config-issues.svelte'
	import { getLocale } from '#paraglide/runtime.js'

	import type { LayoutProps } from './$types'

	let { children, data }: LayoutProps = $props()

	// app.html is static, so the document language follows the UI language here.
	$effect(() => {
		document.documentElement.lang = getLocale()
	})
</script>

<svelte:head>
	<link href={favicon} rel="icon" />
</svelte:head>

{#if data.config.ok}
	{@render children()}
{:else}
	<main>
		<ConfigIssues issues={data.config.errors} tone="error" />
	</main>
{/if}
