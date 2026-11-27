<script lang="ts">
	import type { Snippet } from 'svelte'

	import * as Tabs from '#lib/components/ui/tabs/index.js'
	import { m } from '#paraglide/messages.js'

	import type { FormField } from './model'
	import type { FieldErrors } from './validate'

	interface Props {
		/**
		The content locale whose tab is open. The form shares it between all its localized inputs, so
		switching one switches them all.
		*/
		active: string
		errors: FieldErrors
		/**
		One field per locale, in the order of `locales`.
		*/
		fields: FormField[]
		/**
		The input of one locale's field.
		*/
		input: Snippet<[FormField]>
		label: string
		uiLocale: string
	}

	let { active = $bindable(), errors, fields, input, label, uiLocale }: Props = $props()

	const languageNames = $derived.by(() => {
		try {
			return new Intl.DisplayNames(uiLocale, { fallback: 'code', type: 'language' })
		} catch {
			return
		}
	})

	// A form whose open locale this field does not have shows the field's first locale.
	const shown = $derived(fields.some(field => field.localized?.locale === active) ? active : localeOf(fields[0]))

	function languageName(locale: string): string {
		try {
			return languageNames?.of(locale) ?? locale
		} catch {
			return locale
		}
	}

	function localeOf(field: FormField | undefined): string {
		return field?.localized?.locale ?? ''
	}
</script>

<Tabs.Root
	class="gap-1.5"
	data-localized-field={fields[0]?.localized?.base}
	bind:value={() => shown, next => (active = next)}
>
	<Tabs.List aria-label={m.form_locale_tabs({ field: label })}>
		{#each fields as field (field.name)}
			{@const locale = localeOf(field)}
			<Tabs.Trigger lang={locale} value={locale}>
				{languageName(locale)}
				{#if errors[field.name] !== undefined}
					<span class="bg-destructive size-1.5 rounded-full" aria-hidden="true"></span>
					<span class="sr-only">({m.form_locale_has_error()})</span>
				{/if}
			</Tabs.Trigger>
		{/each}
	</Tabs.List>
	{#each fields as field (field.name)}
		{@const locale = localeOf(field)}
		<!-- The language of the content, so that spell checking and screen readers use it. -->
		<Tabs.Content lang={locale} tabindex={-1} value={locale}>
			{@render input(field)}
		</Tabs.Content>
	{/each}
</Tabs.Root>
