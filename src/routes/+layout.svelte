<script lang="ts">
	import favicon from '#lib/assets/favicon.svg'
	import ConfigIssues from '#lib/config/config-issues.svelte'

	import type { LayoutProps } from './$types'

	let { children, data }: LayoutProps = $props()
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
