import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/* eslint-disable @typescript-eslint/no-explicit-any -- the shadcn-svelte components rely on these helper types as shipped. */

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: null | U }

export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T

export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T

export type WithoutChildrenOrChild<T> = WithoutChild<WithoutChildren<T>>

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
