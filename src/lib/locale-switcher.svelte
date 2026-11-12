<script lang="ts">
	import { m } from '#paraglide/messages.js'
	import { getLocale, locales, setLocale } from '#paraglide/runtime.js'

	// Each language is named in itself, so it stays readable whatever the current UI language is.
	const localeNames: Record<(typeof locales)[number], string> = {
		en: 'English',
		ja: '日本語',
	}
</script>

<label>
	{m.language_switcher_label()}
	<select onchange={event => setLocale(event.currentTarget.value as (typeof locales)[number])} value={getLocale()}>
		{#each locales as locale (locale)}
			<option value={locale}>{localeNames[locale]}</option>
		{/each}
	</select>
</label>
