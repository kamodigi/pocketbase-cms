import { m } from '#paraglide/messages.js'

import type { PublishState } from './query'

export const stateLabels: Record<PublishState, () => string> = {
	draft: () => m.list_state_draft(),
	published: () => m.list_state_published(),
	scheduled: () => m.list_state_scheduled(),
}
