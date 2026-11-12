<script lang="ts">
	import { m } from '#paraglide/messages.js'

	import type { ContrastWarning } from './brand'

	interface Props {
		warnings: ContrastWarning[]
	}

	let { warnings }: Props = $props()

	function describe({ kind, mode, ratio, required }: ContrastWarning): string {
		const params = { mode: mode === 'light' ? m.theme_light() : m.theme_dark(), ratio, required }
		return kind === 'button' ? m.brand_contrast_button(params) : m.brand_contrast_ui(params)
	}
</script>

{#if warnings.length > 0}
	<section
		aria-labelledby="brand-contrast-heading"
		class="border-warning bg-warning-subtle text-warning-foreground m-4 rounded-xl border px-4 py-3 text-sm"
		role="status"
	>
		<h2 class="font-semibold" id="brand-contrast-heading">{m.brand_contrast_heading()}</h2>
		<ul class="my-1 list-disc pl-5">
			{#each warnings as warning (`${warning.kind}-${warning.mode}`)}
				<li>{describe(warning)}</li>
			{/each}
		</ul>
		<p>{m.brand_contrast_hint()}</p>
	</section>
{/if}
