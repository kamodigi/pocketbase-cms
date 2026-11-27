<script lang="ts">
	import { resolve } from '$app/paths'
	import { page } from '$app/state'

	import { Button } from '#lib/components/ui/button/index.js'
	import { m } from '#paraglide/messages.js'
</script>

<main class="mx-auto grid max-w-lg gap-4 px-4 py-12" id="main">
	<h1 class="text-xl font-bold">{page.status === 404 ? m.error_not_found() : m.error_heading()}</h1>
	{#if page.error?.message}
		<p class="text-muted-foreground"><code>{page.status}</code> {page.error.message}</p>
	{/if}
	<div class="flex flex-wrap gap-2">
		<Button onclick={() => location.reload()} variant="outline">{m.error_retry()}</Button>
		<Button href={resolve('/(app)')} variant="ghost">{m.error_home()}</Button>
	</div>
</main>
