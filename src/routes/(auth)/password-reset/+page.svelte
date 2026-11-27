<script lang="ts">
	import { resolve } from '$app/paths'

	import { type PasswordResetResult, requestPasswordReset } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	type Failure = Extract<PasswordResetResult, { ok: false }>['reason']

	const messages: Record<Failure, () => string> = {
		'invalid-email': () => m.reset_error_invalid_email(),
		unavailable: () => m.auth_error_unavailable(),
	}

	let email = $state('')
	let failure = $state<Failure>()
	let sentTo = $state<string>()
	let isSubmitting = $state(false)

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		isSubmitting = true
		failure = undefined
		const address = email.trim()
		const result = await requestPasswordReset(pb, address)
		isSubmitting = false
		if (result.ok) sentTo = address
		else failure = result.reason
	}
</script>

<h1 class="text-xl font-bold">{m.reset_heading()}</h1>

{#if sentTo === undefined}
	<p class="text-muted-foreground text-sm" id="reset-intro">{m.reset_intro()}</p>
	<form class="grid gap-4" onsubmit={handleSubmit}>
		{#if failure}
			<p class="border-destructive text-destructive rounded-md border px-3 py-2 text-sm" id="reset-error" role="alert">
				{messages[failure]()}
			</p>
		{/if}
		<div class="grid gap-1.5">
			<Label for="email">{m.auth_email()}</Label>
			<Input
				aria-describedby={failure ? 'reset-intro reset-error' : 'reset-intro'}
				aria-invalid={failure === 'invalid-email' ? 'true' : undefined}
				autocomplete="username"
				bind:value={email}
				id="email"
				required
				type="email"
			/>
		</div>
		<Button disabled={isSubmitting} type="submit">{m.reset_submit()}</Button>
	</form>
{:else}
	<p role="status">{m.reset_sent({ email: sentTo })}</p>
{/if}

<a class="text-link text-sm underline underline-offset-2" href={resolve('/(auth)/login')}>{m.reset_back()}</a>
