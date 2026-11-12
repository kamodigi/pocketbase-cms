<script lang="ts">
	import type { Component, Snippet } from 'svelte'

	import * as Sidebar from '#lib/components/ui/sidebar/index.js'
	import LocaleSwitcher from '#lib/locale-switcher.svelte'
	import { brandAssetUrl } from '#lib/theme/asset-url.js'
	import ThemeToggle from '#lib/theme/theme-toggle.svelte'
	import { m } from '#paraglide/messages.js'

	export interface NavGroup {
		items: NavItem[]
		label?: string
	}

	export interface NavItem {
		current?: boolean
		href: string
		icon?: Component<{ class?: string }>
		label: string
	}

	interface Props {
		/**
		Shown at the right of the top bar, e.g. a "Visit site" button.
		*/
		actions?: Snippet
		/**
		Breadcrumb or page context, left of the top bar.
		*/
		breadcrumb?: Snippet
		/**
		Page content.
		*/
		children: Snippet
		/**
		Bottom of the sidebar: the signed-in user and the sign-out button.
		*/
		footer?: Snippet
		/**
		Brand logo URL from brand.logo; the name's first letter is shown when there is none.
		*/
		logo?: string
		name: string
		nav: NavGroup[]
	}

	let { actions, breadcrumb, children, footer, logo, name, nav }: Props = $props()
</script>

<a
	class="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-2"
	href="#main"
>
	{m.shell_skip_to_content()}
</a>

<Sidebar.Provider>
	<Sidebar.Root>
		<Sidebar.Header>
			<div class="flex items-center gap-2.5 px-1.5 py-1">
				{#if logo}
					<img alt="" class="size-8 rounded-md object-contain" src={brandAssetUrl(logo)} />
				{:else}
					<span
						aria-hidden="true"
						class="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-md font-bold"
					>
						{[...name][0]}
					</span>
				{/if}
				<span class="truncate font-bold">{name}</span>
			</div>
		</Sidebar.Header>
		<Sidebar.Content aria-label={m.shell_nav_label()}>
			{#each nav as group, index (index)}
				<Sidebar.Group>
					{#if group.label}<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>{/if}
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item, itemIndex (itemIndex)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={item.current}>
										{#snippet child({ props })}
											<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- hrefs are final hash-router links (#/...) supplied by the caller -->
											<a {...props} aria-current={item.current ? 'page' : undefined} href={item.href}>
												{#if item.icon}<item.icon />{/if}
												<span>{item.label}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</Sidebar.Content>
		{#if footer}
			<Sidebar.Footer>{@render footer()}</Sidebar.Footer>
		{/if}
	</Sidebar.Root>

	<Sidebar.Inset>
		<header class="bg-card flex flex-wrap items-center gap-2 border-b px-4 py-3">
			<Sidebar.Trigger>
				<span class="sr-only">{m.shell_toggle_navigation()}</span>
			</Sidebar.Trigger>
			<div class="text-muted-foreground min-w-0 flex-1 text-sm">{@render breadcrumb?.()}</div>
			<LocaleSwitcher />
			<ThemeToggle />
			{@render actions?.()}
		</header>
		<div class="grid content-start gap-4 p-4 sm:p-6" id="main" tabindex="-1">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
