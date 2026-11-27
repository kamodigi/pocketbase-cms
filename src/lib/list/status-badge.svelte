<script lang="ts">
	import { Badge, type BadgeVariant } from '#lib/components/ui/badge/index.js'

	import type { PublishState } from './query'

	import { stateLabels } from './state-labels'

	interface Props {
		state: PublishState
	}

	let { state }: Props = $props()

	const styles: Record<PublishState, { class?: string; variant?: BadgeVariant }> = {
		draft: { variant: 'secondary' },
		published: { class: 'bg-success-subtle text-success' },
		scheduled: { class: 'bg-brand-subtle text-link' },
	}
</script>

<Badge {...styles[state]}>{stateLabels[state]()}</Badge>
