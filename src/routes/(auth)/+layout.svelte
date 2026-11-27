<script lang="ts">
	import { appName } from '#lib'
	import { resolveLabel } from '#lib/config/index.js'
	import LocaleSwitcher from '#lib/locale-switcher.svelte'
	import { brandAssetUrl } from '#lib/theme/asset-url.js'
	import ThemeToggle from '#lib/theme/theme-toggle.svelte'
	import { getLocale } from '#paraglide/runtime.js'

	import type { LayoutProps } from './$types'

	let { children, data }: LayoutProps = $props()

	const brand = $derived(data.config.ok ? data.config.config.brand : undefined)
	const name = $derived(resolveLabel(brand?.name, getLocale(), appName))
</script>

<svelte:head>
	<title>{name}</title>
</svelte:head>

<div class="bg-background grid min-h-svh grid-rows-[auto_1fr]">
	<header class="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
		<LocaleSwitcher />
		<ThemeToggle />
	</header>
	<main class="grid place-items-start justify-center px-4 pt-[8vh] pb-12" id="main">
		<div class="grid w-full max-w-sm gap-6">
			<div class="flex items-center gap-2.5">
				{#if brand?.logo}
					<img alt="" class="size-10 rounded-md object-contain" src={brandAssetUrl(brand.logo)} />
				{:else}
					<span
						aria-hidden="true"
						class="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-md text-lg font-bold"
					>
						{[...name][0]}
					</span>
				{/if}
				<span class="truncate text-lg font-bold">{name}</span>
			</div>
			<div class="bg-card grid gap-5 rounded-xl border p-6">
				{@render children()}
			</div>
		</div>
	</main>
</div>
