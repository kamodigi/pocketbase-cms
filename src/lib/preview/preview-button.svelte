<script lang="ts">
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { ClientResponseError } from 'pocketbase'
	import { toast } from 'svelte-sonner'

	import { signOut } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	import { openPreview, type PreviewTarget } from './open-preview'

	let { collection, id, url }: PreviewTarget = $props()

	let isOpening = $state(false)

	async function open() {
		isOpening = true
		try {
			const result = await openPreview(pb, { collection, id, url })
			if (result === 'blocked') toast.error(m.preview_error_blocked())
		} catch (error) {
			if (!(error instanceof ClientResponseError)) throw error
			if (error.status === 401) {
				signOut(pb)
				void goto(resolve('/(auth)/login'))
				return
			}
			toast.error(m.preview_error({ message: error.message }))
		} finally {
			isOpening = false
		}
	}
</script>

<Button disabled={isOpening} onclick={open} variant="outline">{m.preview_button()}</Button>
