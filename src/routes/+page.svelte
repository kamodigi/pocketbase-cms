<script lang="ts">
	import { appName } from '#lib'
	import LocaleSwitcher from '#lib/locale-switcher.svelte'
	import { m } from '#paraglide/messages.js'
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

<main>
	<h1>{appName}</h1>
	<p>{m.home_scaffold_notice()}</p>
	<LocaleSwitcher />
</main>
