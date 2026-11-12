import '@testing-library/jest-dom/vitest'

// jsdom has no matchMedia; mode-watcher, svelte-sonner and the sidebar's mobile hook all call it.
Object.defineProperty(globalThis, 'matchMedia', {
	value: (query: string) => ({
		addEventListener: () => {},
		addListener: () => {},
		dispatchEvent: () => false,
		matches: false,
		media: query,
		onchange: undefined,
		removeEventListener: () => {},
		removeListener: () => {},
	}),
	writable: true,
})
