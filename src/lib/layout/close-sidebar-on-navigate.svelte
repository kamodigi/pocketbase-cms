<script lang="ts">
	import { afterNavigate } from '$app/navigation'

	import { useSidebar } from '#lib/components/ui/sidebar/index.js'

	// On a phone the sidebar is a drawer over the page; close it once a link in it has been followed.
	const sidebar = useSidebar()

	afterNavigate(() => sidebar.setOpenMobile(false))
</script>
