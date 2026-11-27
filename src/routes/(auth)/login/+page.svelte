<script lang="ts">
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'

	import { signIn, type SignInResult } from '#lib/auth/auth.js'
	import { Button } from '#lib/components/ui/button/index.js'
	import { Input } from '#lib/components/ui/input/index.js'
	import { Label } from '#lib/components/ui/label/index.js'
	import { pb } from '#lib/pocketbase.js'
	import { m } from '#paraglide/messages.js'

	type Failure = Extract<SignInResult, { ok: false }>['reason']

	const messages: Record<Failure, () => string> = {
		credentials: () => m.auth_error_credentials(),
		'not-editor': () => m.auth_error_not_editor(),
		unavailable: () => m.auth_error_unavailable(),
	}

	let email = $state('')
	let password = $state('')
	let failure = $state<Failure>()
	let isSubmitting = $state(false)

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		isSubmitting = true
		failure = undefined
		const result = await signIn(pb, email.trim(), password)
		isSubmitting = false
		if (result.ok) {
			await goto(resolve('/(app)'), { replace: true })
		} else {
			failure = result.reason
			password = ''
		}
	}
</script>

<h1 class="text-xl font-bold">{m.auth_sign_in_heading()}</h1>

<form class="grid gap-4" onsubmit={handleSubmit}>
	{#if failure}
		<p class="border-destructive text-destructive rounded-md border px-3 py-2 text-sm" id="sign-in-error" role="alert">
			{messages[failure]()}
		</p>
	{/if}
	<div class="grid gap-1.5">
		<Label for="email">{m.auth_email()}</Label>
		<Input
			aria-describedby={failure ? 'sign-in-error' : undefined}
			aria-invalid={failure === 'credentials' ? 'true' : undefined}
			autocomplete="username"
			bind:value={email}
			id="email"
			required
			type="email"
		/>
	</div>
	<div class="grid gap-1.5">
		<Label for="password">{m.auth_password()}</Label>
		<Input
			aria-describedby={failure ? 'sign-in-error' : undefined}
			aria-invalid={failure === 'credentials' ? 'true' : undefined}
			autocomplete="current-password"
			bind:value={password}
			id="password"
			required
			type="password"
		/>
	</div>
	<Button disabled={isSubmitting} type="submit">
		{isSubmitting ? m.auth_signing_in() : m.auth_sign_in_button()}
	</Button>
</form>

<a class="text-link text-sm underline underline-offset-2" href={resolve('/(auth)/password-reset')}>
	{m.auth_forgot_password()}
</a>
