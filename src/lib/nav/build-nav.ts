import type { NavGroup } from '#lib/layout/app-shell.svelte'

import { type CmsConfig, type Label, resolveLabel } from '#lib/config/index.js'

import { collectionIcon } from './icons'

export interface BuildNavOptions {
	/**
	The collection whose screen is open; its item is marked as the current page.
	*/
	current?: string
	/**
	The link to a collection's screen.
	*/
	href: (collection: string) => string
	uiLocale: string
}

/**
The sidebar groups for a config that has been reconciled with the schema, so every collection in it
exists. With `nav`, its groups come in order and collections it does not list are appended to the
last group (as the JSON Schema says); a collection listed twice appears once, where it is first
listed. Without `nav`, one unlabeled group holds every collection in config order.
*/
export function buildNav(config: CmsConfig, { current, href, uiLocale }: BuildNavOptions): NavGroup[] {
	return groupCollections(config).map(group => {
		const label = resolveLabel(group.label, uiLocale, '')
		return {
			items: group.items.map(name => {
				const collection = config.collections[name]
				return {
					current: name === current,
					href: href(name),
					icon: collectionIcon(collection?.icon),
					label: resolveLabel(collection?.label, uiLocale, name),
				}
			}),
			label: label === '' ? undefined : label,
		}
	})
}

/**
The collection at the top of the sidebar, which the CMS opens after sign-in.
*/
export function firstCollection(config: CmsConfig): string | undefined {
	return groupCollections(config)[0]?.items[0]
}

function groupCollections(config: CmsConfig): { items: string[]; label?: Label }[] {
	const placed = new Set<string>()
	const groups: { items: string[]; label?: Label }[] = []

	const navGroups = config.nav ?? []
	for (const group of navGroups) {
		const items: string[] = []
		for (const name of group.items) {
			if (!Object.hasOwn(config.collections, name) || placed.has(name)) continue
			placed.add(name)
			items.push(name)
		}
		groups.push({ items, label: group.label })
	}

	const rest = Object.keys(config.collections).filter(name => !placed.has(name))
	const last = groups.at(-1)
	if (last) last.items.push(...rest)
	else groups.push({ items: rest })

	return groups.filter(group => group.items.length > 0)
}
