<script lang="ts">
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import LogOutIcon from '@lucide/svelte/icons/log-out'
	import { onMount } from 'svelte'

	import { appName } from '#lib'
	import { hasEditorSession, signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import ConfigIssues from '#lib/config/config-issues.svelte'
	import { resolveLabel } from '#lib/config/index.js'
	import AppShell from '#lib/layout/app-shell.svelte'
	import { buildNav } from '#lib/nav/build-nav.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'
	import { getLocale } from '#paraglide/runtime.js'

	import type { LayoutProps } from './$types'

	let { children, data }: LayoutProps = $props()

	let user = $state(pb.authStore.record)

	const name = $derived(resolveLabel(data.cms?.brand?.name, getLocale(), appName))
	const nav = $derived(
		data.cms
			? buildNav(data.cms, {
					current: page.params.collection,
					href: collection => resolve('/(app)/collections/[collection]', { collection }),
					uiLocale: getLocale(),
				})
			: [],
	)
	const currentLabel = $derived(nav.flatMap(group => group.items).find(item => item.current)?.label)
	const displayName = $derived(typeof user?.['name'] === 'string' && user['name'] !== '' ? user['name'] : undefined)

	// The session lives in localStorage, so signing out in another tab, or a token PocketBase refreshes
	// for another account, reaches this tab too.
	onMount(() =>
		pb.authStore.onChange(() => {
			user = pb.authStore.record
			if (!hasEditorSession(pb)) void goto(resolve('/(auth)/login'), { replace: true })
		}),
	)

	// The auth store listener above takes the user to the sign-in screen.
	function handleSignOut() {
		signOut(pb)
	}
</script>

<svelte:head>
	<title>{currentLabel ? `${currentLabel} · ${name}` : name}</title>
</svelte:head>

{#if data.cms}
	<AppShell logo={data.cms.brand?.logo} {name} {nav}>
		{#snippet breadcrumb()}
			{#if currentLabel}<b class="text-foreground font-semibold">{currentLabel}</b>{/if}
		{/snippet}
		{#snippet footer()}
			<div class="grid gap-2 px-1.5 py-1 text-sm">
				<div class="min-w-0">
					<p class="text-muted-foreground text-xs">{m.shell_signed_in_as()}</p>
					{#if displayName}<p class="truncate font-semibold">{displayName}</p>{/if}
					<p class="text-muted-foreground truncate" class:text-foreground={!displayName}>{user?.['email']}</p>
				</div>
				<Button class="justify-start" onclick={handleSignOut} size="sm" variant="outline">
					<LogOutIcon />
					{m.shell_sign_out()}
				</Button>
			</div>
		{/snippet}
		<ConfigIssues issues={data.warnings} tone="warning" />
		{@render children()}
	</AppShell>
{/if}
