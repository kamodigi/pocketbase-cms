<script lang="ts">
	import { ModeWatcher } from 'mode-watcher'

	import favicon from '#lib/assets/favicon.svg'
	import { Toaster } from '#lib/components/ui/sonner/index.js'
	import ConfigIssues from '#lib/config/config-issues.svelte'
	import { applyAccent, checkContrast } from '#lib/theme/brand.js'
	import ContrastWarnings from '#lib/theme/contrast-warnings.svelte'
	import { isHexColor } from '#lib/theme/contrast.js'
	import { getLocale } from '#paraglide/runtime.js'

	import type { LayoutProps } from './$types'

	import './layout.css'

	let { children, data }: LayoutProps = $props()

	const accent = $derived(data.config.ok ? data.config.config.brand?.accent : undefined)
	// A pale accent gets a warning above the screen; the CMS still uses it.
	const contrastWarnings = $derived(
		accent !== undefined && isHexColor(accent) ? checkContrast(accent.toLowerCase()) : [],
	)

	// app.html is static, so the document language follows the UI language here.
	$effect(() => {
		document.documentElement.lang = getLocale()
	})

	// brand.accent overrides the default accent.
	$effect(() => {
		applyAccent(accent)
	})
</script>

<svelte:head>
	<link href={favicon} rel="icon" />
</svelte:head>

<ModeWatcher />
<Toaster richColors />

{#if data.config.ok}
	<ContrastWarnings warnings={contrastWarnings} />
	{@render children()}
{:else}
	<main>
		<ConfigIssues issues={data.config.errors} tone="error" />
	</main>
{/if}
