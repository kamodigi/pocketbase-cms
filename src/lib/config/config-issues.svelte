<script lang="ts">
	import type { ConfigIssue } from './issues'

	interface Props {
		issues: ConfigIssue[]
		/**
		Errors stop the CMS; warnings are shown above a working screen.
		*/
		tone: 'error' | 'warning'
	}

	let { issues, tone }: Props = $props()

	// Plain English for now; these move to the message catalog with the i18n foundation.
	const heading = $derived(
		tone === 'error' ? 'cms.config.json has errors' : 'cms.config.json does not match the PocketBase schema',
	)
</script>

{#if issues.length > 0}
	<section
		aria-labelledby="config-issues-heading"
		class="config-issues {tone}"
		role={tone === 'error' ? 'alert' : 'status'}
	>
		<h2 id="config-issues-heading">{heading}</h2>
		<ul>
			{#each issues as { message, path }, index (index)}
				<li>
					{#if path}<code>{path}</code>{/if}
					{message}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.config-issues {
		border: 1px solid;
		border-radius: 4px;
		margin: 1rem;
		padding: 0.75rem 1rem;
	}

	.error {
		background: #fdf1f0;
		border-color: #c4352b;
		color: #5c1712;
	}

	.warning {
		background: #fdf7e8;
		border-color: #b07d12;
		color: #4f3806;
	}

	h2 {
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}

	ul {
		margin: 0;
		padding-left: 1.25rem;
	}

	code {
		margin-right: 0.5em;
	}
</style>
