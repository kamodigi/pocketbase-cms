<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import * as Select from '#lib/components/ui/select/index.js'
	import { Textarea } from '#lib/components/ui/textarea/index.js'
	import { parseDate } from '#lib/list/request.js'
	import RelationInput from '#lib/relation/relation-input.svelte'
	import { m } from '#paraglide/messages.js'

	import type { FormField } from './model'
	import type { FormValue } from './values'

	interface Props {
		error?: string
		field: FormField
		/**
		Called after the user changed the value.
		*/
		onchange: () => void
		/**
		For slugs with `slugFrom`: fills the slug from the source field.
		*/
		onslug?: () => void
		/**
		The label of the field a slug is made from.
		*/
		slugSourceLabel?: string
		uiLocale: string
		value: FormValue
	}

	let { error, field, onchange, onslug, slugSourceLabel = '', uiLocale, value = $bindable() }: Props = $props()

	const id = $props.id()
	const noneValue = '$none'
	const inputTypes: Partial<Record<FormField['kind'], 'date' | 'datetime-local' | 'number' | 'url'>> = {
		date: 'date',
		datetime: 'datetime-local',
		number: 'number',
		url: 'url',
	}
	const isRequired = $derived(Boolean(field.field.required) && !field.readonly)
	const describedBy = $derived(
		[field.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined,
	)
	const invalid = $derived(error ? 'true' : undefined)
	const chosen = $derived(Array.isArray(value) ? value : [])

	function formatTimestamp(text: string): string {
		const date = parseDate(text)
		return Number.isNaN(date.getTime())
			? text
			: new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
	}

	function setValue(next: FormValue) {
		value = next
		onchange()
	}

	function toggleOption(option: string, isChecked: boolean) {
		setValue(isChecked ? [...chosen, option] : chosen.filter(item => item !== option))
	}
</script>

{#snippet labelText()}
	{field.label}
	{#if isRequired}
		<span class="text-muted-foreground text-xs font-normal">{m.form_required()}</span>
	{/if}
{/snippet}

{#snippet messages()}
	{#if field.help}
		<p class="text-muted-foreground text-sm" id="{id}-help">{field.help}</p>
	{/if}
	{#if error}
		<p class="text-destructive text-sm" id="{id}-error">{error}</p>
	{/if}
{/snippet}

<div class="grid content-start gap-1.5" data-field={field.name}>
	{#if field.kind === 'toggle'}
		<div class="flex items-center gap-2">
			<input
				id="{id}-input"
				class="accent-primary size-4"
				aria-describedby={describedBy}
				aria-invalid={invalid}
				aria-required={isRequired || undefined}
				checked={value === true}
				disabled={field.readonly}
				onchange={event => setValue(event.currentTarget.checked)}
				type="checkbox"
			/>
			<Label for="{id}-input">{@render labelText()}</Label>
		</div>
		{@render messages()}
	{:else if field.kind === 'checkboxes'}
		<fieldset class="grid gap-1.5" aria-describedby={describedBy}>
			<legend class="mb-1.5 text-sm leading-none font-medium">{@render labelText()}</legend>
			{#each field.options as option (option.value)}
				<div class="flex items-center gap-2">
					<input
						id="{id}-{option.value}"
						class="accent-primary size-4"
						aria-invalid={invalid}
						checked={chosen.includes(option.value)}
						disabled={field.readonly}
						onchange={event => toggleOption(option.value, event.currentTarget.checked)}
						type="checkbox"
					/>
					<Label class="font-normal" for="{id}-{option.value}">{option.label}</Label>
				</div>
			{/each}
		</fieldset>
		{@render messages()}
	{:else if field.kind === 'relation' || field.kind === 'relations'}
		<fieldset class="grid min-w-0 gap-1.5" aria-describedby={describedBy}>
			<legend class="mb-1.5 text-sm leading-none font-medium">{@render labelText()}</legend>
			<RelationInput {describedBy} {field} {invalid} onchange={setValue} {value} />
		</fieldset>
		{@render messages()}
	{:else if field.kind === 'autodate'}
		<span class="text-sm leading-none font-medium" id="{id}-label">{field.label}</span>
		<p class="text-sm" aria-labelledby="{id}-label">
			{#if typeof value === 'string' && value !== ''}
				<time datetime={parseDate(value).toISOString()}>{formatTimestamp(value)}</time>
			{:else}
				<span class="text-muted-foreground">{m.list_no_value()}</span>
			{/if}
		</p>
	{:else if field.kind === 'pending'}
		<span class="text-sm leading-none font-medium">{field.label}</span>
		<p class="text-muted-foreground text-sm">{m.record_field_pending()}</p>
	{:else}
		<Label for="{id}-input">{@render labelText()}</Label>
		{#if field.kind === 'select'}
			<Select.Root
				disabled={field.readonly}
				onValueChange={next => setValue(next === noneValue ? '' : next)}
				type="single"
				value={typeof value === 'string' && value !== '' ? value : noneValue}
			>
				<Select.Trigger
					id="{id}-input"
					class="w-full"
					aria-describedby={describedBy}
					aria-invalid={invalid}
					aria-required={isRequired || undefined}
				>
					{field.options.find(option => option.value === value)?.label ?? m.record_select_none()}
				</Select.Trigger>
				<Select.Content>
					{#if !isRequired}
						<Select.Item label={m.record_select_none()} value={noneValue} />
					{/if}
					{#each field.options as option (option.value)}
						<Select.Item label={option.label} value={option.value} />
					{/each}
				</Select.Content>
			</Select.Root>
		{:else if field.kind === 'textarea'}
			<Textarea
				id="{id}-input"
				class="min-h-40"
				aria-describedby={describedBy}
				aria-invalid={invalid}
				aria-required={isRequired || undefined}
				bind:value={() => String(value ?? ''), next => setValue(next)}
				disabled={field.readonly}
			/>
		{:else}
			<div class="flex gap-2">
				<Input
					id="{id}-input"
					aria-describedby={describedBy}
					aria-invalid={invalid}
					aria-required={isRequired || undefined}
					autocomplete="off"
					bind:value={() => value, next => setValue(next ?? (field.kind === 'number' ? undefined : ''))}
					disabled={field.readonly}
					inputmode={field.kind === 'number' ? 'decimal' : undefined}
					step={field.kind === 'number' ? (field.field.onlyInt ? 1 : 'any') : undefined}
					type={inputTypes[field.kind] ?? 'text'}
				/>
				{#if onslug && field.kind === 'slug' && !field.readonly}
					<Button class="shrink-0" onclick={onslug} variant="outline">
						{m.record_slug_generate({ field: slugSourceLabel })}
					</Button>
				{/if}
			</div>
		{/if}
		{@render messages()}
	{/if}
</div>
