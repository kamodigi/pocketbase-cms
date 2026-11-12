<script lang="ts">
	import MonitorIcon from '@lucide/svelte/icons/monitor'
	import MoonIcon from '@lucide/svelte/icons/moon'
	import SunIcon from '@lucide/svelte/icons/sun'
	import { setMode, userPrefersMode } from 'mode-watcher'

	import { m } from '#paraglide/messages.js'

	const modes = [
		{ icon: SunIcon, label: () => m.theme_light(), value: 'light' },
		{ icon: MoonIcon, label: () => m.theme_dark(), value: 'dark' },
		{ icon: MonitorIcon, label: () => m.theme_system(), value: 'system' },
	] as const
</script>

<!-- A radio group, so one Tab stop and arrow keys switch the mode. -->
<div aria-label={m.theme_toggle_label()} class="border-border inline-flex rounded-lg border p-0.5" role="radiogroup">
	{#each modes as { icon: Icon, label, value } (value)}
		<label
			class="has-[:focus-visible]:ring-ring text-muted-foreground has-[:checked]:bg-accent has-[:checked]:text-accent-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2"
			title={label()}
		>
			<input
				checked={userPrefersMode.current === value}
				class="sr-only"
				name="theme-mode"
				onchange={() => setMode(value)}
				type="radio"
				{value}
			/>
			<Icon aria-hidden="true" class="size-4" />
			<span class="sr-only">{label()}</span>
		</label>
	{/each}
</div>
