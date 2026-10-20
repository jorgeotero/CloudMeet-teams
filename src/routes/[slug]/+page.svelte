<script lang="ts">
	import type { PageData } from './$types';
	import { BookingPage } from '$lib/components/booking';

	let { data }: { data: PageData } = $props();
</script>

<BookingPage {data} />
