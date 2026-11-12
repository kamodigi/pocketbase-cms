<script lang="ts">
	import FileTextIcon from '@lucide/svelte/icons/file-text'
	import ImageIcon from '@lucide/svelte/icons/image'
	import PlusIcon from '@lucide/svelte/icons/plus'
	import SwatchBookIcon from '@lucide/svelte/icons/swatch-book'
	import { toast } from 'svelte-sonner'

	import { Badge } from '#lib/components/ui/badge/index.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import * as Dialog from '#lib/components/ui/dialog/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import * as Select from '#lib/components/ui/select/index.js'
	import * as Table from '#lib/components/ui/table/index.js'
	import { Textarea } from '#lib/components/ui/textarea/index.js'
	import AppShell, { type NavGroup } from '#lib/layout/app-shell.svelte'

	// Role tokens as documented in DESIGN.md; each swatch is painted with the token itself, so it follows light/dark.
	const roles = [
		'background',
		'foreground',
		'card',
		'primary',
		'primary-foreground',
		'secondary',
		'muted',
		'muted-foreground',
		'accent',
		'destructive',
		'success',
		'warning',
		'border',
		'ring',
		'sidebar',
	]

	const nav: NavGroup[] = [
		{
			items: [
				{ current: true, href: '#/styleguide', icon: SwatchBookIcon, label: 'Components' },
				{ href: '#/styleguide', icon: FileTextIcon, label: 'Posts' },
				{ href: '#/styleguide', icon: ImageIcon, label: 'Media' },
			],
			label: 'Content',
		},
	]

	let category = $state('news')
	let isDialogOpen = $state(false)
</script>

<svelte:head>
	<title>Components · pocketbase-cms</title>
</svelte:head>

<AppShell name="Lantern Coffee" {nav}>
	{#snippet breadcrumb()}
		<span>Development</span> / <b class="text-foreground font-semibold">Components</b>
	{/snippet}
	{#snippet actions()}
		<Button variant="outline">Visit site</Button>
	{/snippet}
	{#snippet footer()}
		<p class="text-muted-foreground px-2 text-xs">Development page. Not part of the shipped CMS.</p>
	{/snippet}

	<div class="max-w-5xl space-y-10">
		<header>
			<h1 class="text-2xl font-bold">Components</h1>
			<p class="text-muted-foreground">
				Every component in light and dark. Switch the theme in the top bar. Everything here works with the keyboard.
			</p>
		</header>

		<section aria-labelledby="h-tokens" class="space-y-3">
			<h2 class="text-lg font-semibold" id="h-tokens">Role tokens</h2>
			<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{#each roles as role (role)}
					<li class="space-y-1">
						<div class="h-10 rounded-md border" style:background={`var(--${role})`}></div>
						<code class="text-xs">--{role}</code>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-labelledby="h-buttons" class="space-y-3">
			<h2 class="text-lg font-semibold" id="h-buttons">Buttons</h2>
			<div class="flex flex-wrap items-center gap-3">
				<Button><PlusIcon /> New post</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="outline">Outline</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="destructive">Delete</Button>
				<Button variant="link">Link</Button>
				<Button disabled>Disabled</Button>
				<Button aria-label="Add" size="icon"><PlusIcon /></Button>
			</div>
		</section>

		<section aria-labelledby="h-forms" class="space-y-3">
			<h2 class="text-lg font-semibold" id="h-forms">Form controls</h2>
			<form class="grid max-w-xl gap-4" onsubmit={event => event.preventDefault()}>
				<div class="grid gap-1.5">
					<Label for="sg-title">Title</Label>
					<Input id="sg-title" placeholder="Autumn blend is back" value="Autumn blend is back" />
				</div>
				<div class="grid gap-1.5">
					<Label for="sg-slug">Slug</Label>
					<Input aria-describedby="sg-slug-help" class="font-mono" id="sg-slug" value="autumn-blend-2026" />
					<p class="text-muted-foreground text-xs" id="sg-slug-help">Letters, numbers and hyphens.</p>
				</div>
				<div class="grid gap-1.5">
					<Label for="sg-invalid">Required field</Label>
					<Input aria-invalid="true" id="sg-invalid" />
					<p class="text-destructive text-xs">This field is required.</p>
				</div>
				<div class="grid gap-1.5">
					<Label for="sg-category">Category</Label>
					<Select.Root bind:value={category} type="single">
						<Select.Trigger class="w-48" id="sg-category">{category}</Select.Trigger>
						<Select.Content>
							<Select.Item label="news" value="news" />
							<Select.Item label="event" value="event" />
							<Select.Item label="journal" value="journal" />
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-1.5">
					<Label for="sg-body">Notes</Label>
					<Textarea id="sg-body" rows={3} />
				</div>
			</form>
		</section>

		<section aria-labelledby="h-badges" class="space-y-3">
			<h2 class="text-lg font-semibold" id="h-badges">Status badges</h2>
			<div class="flex flex-wrap gap-2">
				<Badge class="bg-success-subtle text-success">Published</Badge>
				<Badge class="bg-brand-subtle text-link">Scheduled</Badge>
				<Badge variant="secondary">Draft</Badge>
				<Badge class="bg-warning-subtle text-warning-foreground">Untranslated</Badge>
			</div>
		</section>

		<section aria-labelledby="h-table" class="space-y-3">
			<h2 class="text-lg font-semibold" id="h-table">Table</h2>
			<div class="bg-card overflow-x-auto rounded-xl border">
				<Table.Root>
					<Table.Caption class="sr-only">Posts</Table.Caption>
					<Table.Header>
						<Table.Row>
							<Table.Head>Title</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Published</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						<Table.Row>
							<Table.Cell class="font-medium">Autumn blend is back</Table.Cell>
							<Table.Cell><Badge variant="secondary">Draft</Badge></Table.Cell>
							<Table.Cell class="text-muted-foreground tabular-nums">—</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-medium">Holiday opening hours</Table.Cell>
							<Table.Cell><Badge class="bg-brand-subtle text-link">Scheduled</Badge></Table.Cell>
							<Table.Cell class="text-muted-foreground tabular-nums">2026/12/01</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-medium">Roasting workshop in November</Table.Cell>
							<Table.Cell><Badge class="bg-success-subtle text-success">Published</Badge></Table.Cell>
							<Table.Cell class="text-muted-foreground tabular-nums">2026/11/03</Table.Cell>
						</Table.Row>
					</Table.Body>
				</Table.Root>
			</div>
		</section>

		<section aria-labelledby="h-feedback" class="space-y-3">
			<h2 class="text-lg font-semibold" id="h-feedback">Dialog and notifications</h2>
			<div class="flex flex-wrap gap-3">
				<Dialog.Root bind:open={isDialogOpen}>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="destructive">Delete post…</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>Delete this post?</Dialog.Title>
							<Dialog.Description>This cannot be undone.</Dialog.Description>
						</Dialog.Header>
						<Dialog.Footer>
							<Dialog.Close>
								{#snippet child({ props })}
									<Button {...props} variant="outline">Cancel</Button>
								{/snippet}
							</Dialog.Close>
							<Button
								onclick={() => {
									isDialogOpen = false
									toast.success('Post deleted')
								}}
								variant="destructive"
							>
								Delete
							</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>
				<Button onclick={() => toast.success('Saved')} variant="outline">Success toast</Button>
				<Button onclick={() => toast.error('Could not save: the title is required')} variant="outline">
					Error toast
				</Button>
				<Button onclick={() => toast.info('A newer version of the CMS is available')} variant="outline">
					Info toast
				</Button>
			</div>
		</section>
	</div>
</AppShell>
