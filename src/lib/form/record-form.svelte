<script lang="ts">
	import type { RecordModel } from 'pocketbase'

	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { ClientResponseError } from 'pocketbase'
	import { tick, untrack } from 'svelte'
	import { toast } from 'svelte-sonner'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import * as Dialog from '#lib/components/ui/dialog/index.js'
	import { type CmsConfig, type SchemaCollection } from '#lib/config/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	import { changedValues, draftKey, isSavedSince, readDraft, recordUpdated, removeDraft, writeDraft } from './draft'
	import DraftPrompt from './draft-prompt.svelte'
	import FieldInput from './field-input.svelte'
	import { buildFormModel, type FormField } from './model'
	import { type FieldErrors, serverFieldErrors, validateField, validateForm } from './validate'
	import { initialValues, recordPayload, slugify } from './values'

	interface Props {
		/**
		The collection's name in PocketBase.
		*/
		collection: string
		config: CmsConfig
		/**
		The collection's name on screen.
		*/
		label: string
		/**
		The record being edited; undefined on the screen that creates one.
		*/
		record?: RecordModel
		schema: SchemaCollection
		uiLocale: string
	}

	let { collection, config, label, record, schema, uiLocale }: Props = $props()

	// The props stay the same for the life of the form: the page renders a new form per record.
	const model = untrack(() => buildFormModel(config, schema, uiLocale))
	const isSingleton = untrack(() => Boolean(config.collections[collection]?.singleton))
	const fields = [...model.main, ...model.side]

	// The record as PocketBase last returned it, and the inputs as they were then.
	let saved = $state(untrack(() => record))
	let initial = $state(
		initialValues(
			model,
			untrack(() => record),
		),
	)
	let values = $state(
		initialValues(
			model,
			untrack(() => record),
		),
	)
	let errors = $state<FieldErrors>({})
	// Errors PocketBase gave for fields the form does not show.
	let otherErrors = $state<string[]>([])
	let isSaving = $state(false)
	let isDeleting = $state(false)
	let isDeleteOpen = $state(false)
	// A slug follows its source field until the user writes a slug of their own.
	const slugFields = fields.filter(field => field.kind === 'slug' && field.slugFrom !== undefined)
	let ownSlugs = $state(Object.fromEntries(slugFields.map(field => [field.name, values[field.name] !== ''])))

	// Unsaved input kept in the browser (decision 40). One found on opening waits for the user's choice.
	const userId = pb.authStore.record?.id ?? ''
	const storageKey = untrack(() => draftKey(userId, collection, record?.id))
	let foundDraft = $state.raw(
		readDraft(
			storageKey,
			model,
			untrack(() => initial),
		),
	)
	// The `updated` of the record the unsaved input was made on; a restored draft brings its own.
	let draftBase = untrack(() => recordUpdated(record))
	// Set once the record is created or deleted: nothing typed after that belongs to this draft.
	let isDraftClosed = false

	// Written on every change, so closing the tab loses nothing.
	$effect(() => {
		// Signing out removes the editor's drafts; an open form must not write one again.
		if (foundDraft || isDraftClosed || (pb.authStore.record?.id ?? '') !== userId) return
		const changed = changedValues(model, $state.snapshot(values), $state.snapshot(initial))
		if (Object.keys(changed).length === 0) {
			removeDraft(storageKey)
			draftBase = untrack(() => recordUpdated(saved))
			return
		}
		writeDraft(storageKey, {
			ownSlugs: $state.snapshot(ownSlugs),
			recordUpdated: draftBase,
			savedAt: new Date().toISOString(),
			values: changed,
		})
	})

	const title = $derived(recordTitle(saved))
	const heading = $derived(isSingleton ? label : saved ? title || m.list_untitled() : m.record_new_heading())

	function changed(field: FormField) {
		if (Object.hasOwn(ownSlugs, field.name)) ownSlugs[field.name] = values[field.name] !== ''
		for (const slug of slugFields) {
			if (slug.slugFrom === field.name && !ownSlugs[slug.name]) values[slug.name] = slugify(String(values[field.name]))
		}
		// An error goes away as soon as the value is fixed.
		if (errors[field.name] === undefined) return
		const message = validateField(field, values[field.name], uiLocale)
		if (message === undefined) delete errors[field.name]
		else errors[field.name] = message
	}

	function closeDraft() {
		isDraftClosed = true
		removeDraft(storageKey)
	}

	async function confirmDelete() {
		if (!saved) return
		isDeleting = true
		try {
			await pb.collection(collection).delete(saved.id)
		} catch (error) {
			isDeleting = false
			isDeleteOpen = false
			failed(error, m.record_error_delete)
			return
		}
		closeDraft()
		isDeleteOpen = false
		toast.success(m.record_deleted({ title: title || m.list_untitled() }))
		await goto(resolve('/(app)/collections/[collection]', { collection }))
	}

	async function discardDraft() {
		removeDraft(storageKey)
		foundDraft = undefined
		await focusForm()
	}

	function failed(error: unknown, message: (inputs: { message: string }) => string) {
		if (!(error instanceof ClientResponseError)) throw error
		if (error.status === 401) {
			signOut(pb)
			void goto(resolve('/(auth)/login'))
			return
		}
		if (error.status === 404) {
			toast.error(m.record_error_gone())
			return
		}
		toast.error(message({ message: error.message }))
	}

	async function focusFirstError() {
		await tick()
		document.querySelector<HTMLElement>('[data-record-form] [aria-invalid="true"]')?.focus()
	}

	// The prompt is gone with the choice; the keyboard goes on to the form.
	async function focusForm() {
		await tick()
		document.querySelector<HTMLElement>('[data-record-form] :is(input, textarea, button):not(:disabled)')?.focus()
	}

	function recordTitle(source: RecordModel | undefined): string {
		const value: unknown = model.titleField === undefined ? undefined : source?.[model.titleField]
		return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
	}

	async function restoreDraft() {
		if (!foundDraft) return
		Object.assign(values, foundDraft.values)
		Object.assign(ownSlugs, foundDraft.ownSlugs)
		draftBase = foundDraft.recordUpdated
		foundDraft = undefined
		await focusForm()
	}

	function slugSource(field: FormField): FormField | undefined {
		return field.slugFrom === undefined ? undefined : fields.find(other => other.name === field.slugFrom)
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault()
		if (isSaving) return
		otherErrors = []
		errors = validateForm(model, values, uiLocale)
		if (Object.keys(errors).length > 0) {
			toast.error(m.record_error_invalid())
			await focusFirstError()
			return
		}

		const payload = recordPayload(model, $state.snapshot(values), {
			initial: saved ? $state.snapshot(initial) : undefined,
			now: new Date(),
			userId: pb.authStore.record?.id,
		})
		if (saved && Object.keys(payload).length === 0) {
			toast.info(m.record_no_changes())
			return
		}

		isSaving = true
		let result: RecordModel
		try {
			result = saved
				? await pb.collection(collection).update(saved.id, payload)
				: await pb.collection(collection).create(payload)
		} catch (error) {
			isSaving = false
			const found = serverFieldErrors(error)
			if (Object.keys(found).length > 0) {
				const shown = new Set(fields.map(field => field.name))
				errors = Object.fromEntries(Object.entries(found).filter(([name]) => shown.has(name)))
				otherErrors = Object.entries(found)
					.filter(([name]) => !shown.has(name))
					.map(([name, message]) => `${name}: ${message}`)
				toast.error(m.record_error_invalid())
				await focusFirstError()
				return
			}
			failed(error, m.record_error_save)
			return
		}
		isSaving = false

		const name = recordTitle(result) || m.list_untitled()
		if (saved) {
			removeDraft(storageKey)
			saved = result
			initial = initialValues(model, result)
			values = initialValues(model, result)
			toast.success(m.record_saved({ title: name }))
		} else {
			closeDraft()
			toast.success(m.record_created({ title: name }))
			// The new record's own screen, in place of the one that created it.
			await goto(resolve('/(app)/collections/[collection]/[id]', { collection, id: result.id }), {
				replaceState: true,
			})
		}
	}
</script>

{#snippet fieldList(list: FormField[])}
	{#each list as field (field.name)}
		{#if saved || field.kind !== 'autodate'}
			<FieldInput
				error={errors[field.name]}
				{field}
				onchange={() => changed(field)}
				onslug={slugSource(field)
					? () => {
							values[field.name] = slugify(String(values[field.slugFrom!] ?? ''))
							changed(field)
						}
					: undefined}
				slugSourceLabel={slugSource(field)?.label}
				{uiLocale}
				bind:value={values[field.name]}
			/>
		{/if}
	{/each}
{/snippet}

<div class="grid gap-1">
	{#if !isSingleton}
		<a
			class="text-link justify-self-start text-sm underline underline-offset-2"
			href={resolve('/(app)/collections/[collection]', { collection })}
		>
			{m.record_back_to_list()}
		</a>
	{/if}
	<h1 class="text-2xl font-bold break-words">{heading}</h1>
</div>

{#if foundDraft}
	<DraftPrompt
		isSavedSince={isSavedSince(foundDraft, saved)}
		ondiscard={discardDraft}
		onrestore={restoreDraft}
		savedAt={foundDraft.savedAt}
		{uiLocale}
	/>
{/if}

<!-- Inert until the user chooses, so that new input never mixes with the kept one. -->
<form
	class={['grid gap-6', foundDraft && 'opacity-50']}
	aria-label={heading}
	data-record-form
	inert={Boolean(foundDraft)}
	novalidate
	onsubmit={submit}
>
	{#if otherErrors.length > 0}
		<ul class="border-destructive text-destructive grid gap-1 rounded-lg border p-3 text-sm" role="alert">
			{#each otherErrors as message (message)}
				<li>{message}</li>
			{/each}
		</ul>
	{/if}

	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="grid gap-5">
			{@render fieldList(model.main)}
		</div>
		{#if model.side.some(field => saved || field.kind !== 'autodate')}
			<section class="bg-card grid gap-5 rounded-xl border p-4" aria-label={m.record_details()}>
				{@render fieldList(model.side)}
			</section>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button disabled={isSaving} type="submit">
			{isSaving ? m.record_saving() : saved ? m.record_save() : m.record_create()}
		</Button>
		{#if saved && !isSingleton}
			<Dialog.Root bind:open={isDeleteOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} class="ml-auto" variant="outline">{m.record_delete()}</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>{m.record_delete_title()}</Dialog.Title>
						<Dialog.Description>
							{m.record_delete_description({ title: title || m.list_untitled() })}
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer>
						<Dialog.Close>
							{#snippet child({ props })}
								<Button {...props} variant="outline">{m.record_delete_cancel()}</Button>
							{/snippet}
						</Dialog.Close>
						<Button disabled={isDeleting} onclick={confirmDelete} variant="destructive">
							{isDeleting ? m.record_deleting() : m.record_delete()}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		{/if}
	</div>
</form>
