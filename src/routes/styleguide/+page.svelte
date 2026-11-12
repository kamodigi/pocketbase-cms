<script lang="ts">
	// import.meta.env.DEV is replaced at build time, so the gallery is not bundled into the shipped CMS.
	const gallery = import.meta.env.DEV ? import('./gallery.svelte') : undefined
</script>

{#await gallery then module}
	{#if module}<module.default />{/if}
{/await}
