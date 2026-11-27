import PocketBase from 'pocketbase'

/**
The PocketBase client. The CMS is served from PocketBase's own pb_public/, so the API is on the same
origin. The session (token and user record) lives in localStorage, shared by every tab.
*/
export const pb = new PocketBase('/')

// Screens may ask for the same record twice (a layout and a page); the SDK would cancel the first.
pb.autoCancellation(false)
