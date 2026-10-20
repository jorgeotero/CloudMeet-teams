<script lang="ts">
	import { browser } from '$app/environment';
	import TimezoneSelector from '$lib/components/TimezoneSelector.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { createBrandColors } from '$lib/utils/colorUtils';
	import { detectTimezone, getTimezoneLabel, getTimezoneWithTime, TIMEZONE_LABELS } from '$lib/constants/timezones';
	import { formatDateLocal, formatSelectedDate, createFormatters } from '$lib/utils/dateFormatters';
	import BookingCalendar from './BookingCalendar.svelte';
	import TimeSlotList from './TimeSlotList.svelte';
	import BookingForm from './BookingForm.svelte';
	import BookingSuccess from './BookingSuccess.svelte';
	import EventSidebar from './EventSidebar.svelte';
	import { translations, type Locale } from '$lib/i18n/booking';

	let { data }: { data: any } = $props();

	// Bilingual Locale state
	let currentLocale = $state<Locale>('es');
	$effect(() => {
		if (browser) {
			const urlLang = new URLSearchParams(window.location.search).get('lang');
			if (urlLang === 'en' || urlLang === 'es') {
				currentLocale = urlLang;
			} else if (navigator.language && !navigator.language.toLowerCase().startsWith('es')) {
				currentLocale = 'en';
			} else {
				currentLocale = 'es';
			}
		}
	});
	let t = $derived(translations[currentLocale]);

	// Sanitize event description to prevent XSS (only in browser, SSR uses escaped version)
	let sanitizedDescription = $state('');
	$effect(() => {
		if (data.eventType?.description) {
			if (browser) {
				import('isomorphic-dompurify').then(({ default: DOMPurify }) => {
					sanitizedDescription = DOMPurify.sanitize(data.eventType!.description!);
				});
			} else {
				// During SSR, escape basic HTML entities as a fallback
				sanitizedDescription = data.eventType.description
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;');
			}
		} else {
			sanitizedDescription = '';
		}
	});

	// Brand colors (default #059669)
	const brandColor = data.user?.brandColor && data.user?.brandColor !== '#3b82f6' ? data.user.brandColor : '#059669';
	const colors = createBrandColors(brandColor);

	const lockPrefill = data.prefill?.lockPrefill || false;
	const isEmbed = data.prefill?.isEmbed || false;

	let selectedDate = $state<string | null>(null);
	let selectedSlot = $state<{ start: string; end: string } | null>(null);
	let availableSlots = $state<Array<{ start: string; end: string }>>([]);
	let loading = $state(false);
	let showForm = $state(false);
	let bookingForm = $state({
		name: data.prefill?.name || '',
		email: data.prefill?.email || '',
		phone: data.prefill?.phone || '',
		notes: data.prefill?.notes || ''
	});
	let bookingStatus = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let bookingError = $state('');
	let meetingUrl = $state<string | null>(null);
	let meetingType = $state<'google_meet' | 'teams'>('google_meet');

	// Track which dates have available slots
	let availableDates = $state<Set<string>>(new Set());
	let loadingAvailability = $state(false);

	// Mobile step tracking
	let mobileStep = $state<'calendar' | 'times' | 'form'>('calendar');

	// Timezone state
	let selectedTimezone = $state(detectTimezone());
	let showTimezoneDropdown = $state(false);

	// Calendar state
	let currentMonth = $state(new Date());

	// Date/time formatters
	const use12Hour = data.user?.timeFormat !== '24h';

	function formatTime(isoStr: string) {
		const date = new Date(isoStr);
		return new Intl.DateTimeFormat(currentLocale === 'es' ? 'es-MX' : 'en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: use12Hour,
			timeZone: selectedTimezone
		}).format(date);
	}

	function formatTimeRange(start: string, end: string) {
		return `${formatTime(start)} - ${formatTime(end)}`;
	}

	function formatShortDate(dateStr: string) {
		const date = new Date(dateStr + 'T12:00:00');
		return new Intl.DateTimeFormat(currentLocale === 'es' ? 'es-MX' : 'en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		}).format(date);
	}

	function formatMonthYear(date: Date) {
		return new Intl.DateTimeFormat(currentLocale === 'es' ? 'es-MX' : 'en-US', { month: 'long', year: 'numeric' }).format(date);
	}

	const weekDays = $derived(
		currentLocale === 'es'
			? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
			: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
	);

	// Calendar days computation (with 1 day buffer: no same-day and no next-day)
	const calendarDays = $derived(() => {
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const startPadding = (firstDay.getDay() + 6) % 7;
		const days: Array<{ date: Date; isCurrentMonth: boolean; isAvailable: boolean; dateStr: string }> = [];

		for (let i = 0; i < startPadding; i++) {
			const date = new Date(year, month, i - startPadding + 1);
			days.push({
				date,
				isCurrentMonth: false,
				isAvailable: false,
				dateStr: formatDateLocal(date)
			});
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const minNoticeDate = new Date(today);
		minNoticeDate.setDate(minNoticeDate.getDate() + 2); // 1-day buffer (no same-day, no next-day)

		for (let i = 1; i <= lastDay.getDate(); i++) {
			const date = new Date(year, month, i);
			const dateStr = formatDateLocal(date);
			const isAvailable = date >= minNoticeDate && date <= new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
			days.push({
				date,
				isCurrentMonth: true,
				isAvailable,
				dateStr
			});
		}

		const remaining = 42 - days.length;
		for (let i = 1; i <= remaining; i++) {
			const date = new Date(year, month + 1, i);
			days.push({
				date,
				isCurrentMonth: false,
				isAvailable: false,
				dateStr: formatDateLocal(date)
			});
		}

		return days;
	});

	function prevMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
		fetchMonthAvailability();
	}

	function nextMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
		fetchMonthAvailability();
	}

	async function fetchMonthAvailability() {
		loadingAvailability = true;

		try {
			const year = currentMonth.getFullYear();
			const month = currentMonth.getMonth() + 1;
			const monthStr = `${year}-${String(month).padStart(2, '0')}`;
			const userQuery = data.user?.id ? `&userId=${data.user.id}` : '';

			const response = await fetch(`/api/availability/month?event=${data.slug}&month=${monthStr}${userQuery}`);
			if (!response.ok) throw new Error('Failed to fetch availability');

			const result = await response.json() as { availableDates?: string[] };
			availableDates = new Set(result.availableDates || []);
		} catch (error) {
			console.error('Error fetching month availability:', error);
			availableDates = new Set();
		} finally {
			loadingAvailability = false;
		}
	}

	$effect(() => {
		fetchMonthAvailability();
	});

	async function handleDateSelect(dateStr: string) {
		selectedDate = dateStr;
		selectedSlot = null;
		showForm = false;
		loading = true;
		mobileStep = 'times';

		try {
			const userQuery = data.user?.id ? `&userId=${data.user.id}` : '';
			const response = await fetch(`/api/availability?event=${data.slug}&date=${dateStr}${userQuery}`);
			if (!response.ok) throw new Error('Failed to fetch availability');
			const result = await response.json() as { slots?: Array<{ start: string; end: string }> };
			availableSlots = result.slots || [];
		} catch (error) {
			console.error('Error fetching availability:', error);
			availableSlots = [];
		} finally {
			loading = false;
		}
	}

	function selectSlot(slot: { start: string; end: string }) {
		selectedSlot = slot;
		if (browser && window.parent && window.parent !== window) {
			window.parent.postMessage({
				type: 'cloudmeet:slot_selected',
				data: {
					eventSlug: data.slug,
					date: selectedDate,
					slot
				}
			}, '*');
		}
	}

	function confirmSlot() {
		showForm = true;
		mobileStep = 'form';
	}

	function goBackMobile() {
		if (mobileStep === 'form') {
			mobileStep = 'times';
			showForm = false;
		} else if (mobileStep === 'times') {
			mobileStep = 'calendar';
			selectedDate = null;
			selectedSlot = null;
			availableSlots = [];
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		bookingStatus = 'submitting';
		bookingError = '';

		try {
			const hasMeta = data.prefill?.metadata && Object.keys(data.prefill.metadata).length > 0;
			const response = await fetch('/api/bookings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					eventSlug: data.slug,
					userId: data.user?.id,
					userSlug: data.user?.slug,
					orgSlug: (data as any).orgSlug || undefined,
					startTime: selectedSlot?.start,
					endTime: selectedSlot?.end,
					attendeeName: bookingForm.name,
					attendeeEmail: bookingForm.email,
					attendeePhone: bookingForm.phone || undefined,
					notes: bookingForm.notes,
					timezone: selectedTimezone,
					externalRef: data.prefill?.externalRef || undefined,
					metadata: hasMeta ? data.prefill?.metadata : undefined
				})
			});

			if (!response.ok) {
				const errData = await response.json() as { message?: string };
				throw new Error(errData.message || 'Failed to create booking');
			}

			const result = await response.json() as { success: boolean; bookingId: string; meetingUrl?: string; meetingType?: 'google_meet' | 'teams' };
			meetingUrl = result.meetingUrl || null;
			meetingType = result.meetingType || 'google_meet';
			bookingStatus = 'success';

			// Notify parent iframe window if embedded
			if (browser && window.parent && window.parent !== window) {
				window.parent.postMessage({
					type: 'cloudmeet:booking_confirmed',
					data: {
						bookingId: result.bookingId,
						eventSlug: data.slug,
						startTime: selectedSlot?.start,
						endTime: selectedSlot?.end,
						attendeeName: bookingForm.name,
						attendeeEmail: bookingForm.email,
						attendeePhone: bookingForm.phone || null,
						externalRef: data.prefill?.externalRef || null,
						meetingUrl: result.meetingUrl || null
					}
				}, '*');
			}
		} catch (error: any) {
			console.error('Booking error:', error);
			bookingError = error.message || 'Failed to create booking';
			bookingStatus = 'error';
		}
	}
</script>

<svelte:head>
	<title>{data.eventType?.name || 'Book a Meeting'}</title>
	<!-- Dynamic favicon based on brand color -->
	<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,{encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='grad' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' style='stop-color:${brandColor};stop-opacity:1'/><stop offset='100%' style='stop-color:${colors.darkHex};stop-opacity:1'/></linearGradient></defs><circle cx='16' cy='16' r='15' fill='url(%23grad)'/><rect x='7' y='9' width='18' height='15' rx='2' fill='white' opacity='0.95'/><rect x='7' y='9' width='18' height='5' rx='2' fill='white'/><rect x='7' y='12' width='18' height='2' fill='${brandColor}'/><rect x='10' y='6' width='2.5' height='5' rx='1' fill='white'/><rect x='19.5' y='6' width='2.5' height='5' rx='1' fill='white'/><circle cx='16' cy='18' r='4' fill='none' stroke='${colors.darkHex}' stroke-width='1.5'/><line x1='16' y1='18' x2='16' y2='16' stroke='${colors.darkHex}' stroke-width='1.5' stroke-linecap='round'/><line x1='16' y1='18' x2='18' y2='18' stroke='${colors.darkHex}' stroke-width='1.5' stroke-linecap='round'/></svg>`)}" />
</svelte:head>

<div
	class="{isEmbed ? 'w-full bg-white flex flex-col items-center p-0 m-0' : 'min-h-screen bg-white md:bg-gray-100 flex flex-col items-center md:justify-center md:p-4'}"
	style="--brand-color: {brandColor}; --brand-light: {colors.light}; --brand-lighter: {colors.lighter}; --brand-dark: {colors.dark}; --brand-rgb: {colors.rgb.r}, {colors.rgb.g}, {colors.rgb.b};"
>
	{#if bookingStatus === 'success' && selectedDate && selectedSlot}
		<!-- Success Screen -->
		<BookingSuccess
			eventName={data.eventType?.name || (currentLocale === 'es' ? 'Reunión Virtual' : 'Meeting')}
			{selectedDate}
			{selectedSlot}
			{meetingUrl}
			{meetingType}
			{brandColor}
			locale={currentLocale}
			{formatTimeRange}
			{formatSelectedDate}
		/>
		{#if !isEmbed}
			<Footer class="mt-6" />
		{/if}
	{:else}
		<!-- MOBILE LAYOUT (< 768px) - Full white page -->
		<div class="md:hidden {isEmbed ? 'w-full bg-white' : 'min-h-screen w-full bg-white'}">
			<!-- Tenant / Company Branding in Mobile (Centered, no border box, clean & larger) -->
			{#if data.organization?.logoUrl || data.organization?.name}
				<div class="pt-6 px-6 flex justify-center items-center">
					{#if data.organization?.logoUrl}
						<img src={data.organization.logoUrl} alt={data.organization.name} class="h-9 w-auto max-w-[200px] object-contain" />
					{:else}
						<span class="text-lg font-black tracking-tight text-slate-800">{data.organization.name}</span>
					{/if}
				</div>
			{/if}
			<!-- Cover Image with black line below -->
			{#if data.eventType?.cover_image}
				<div class="px-6 pt-6 flex justify-center">
					<img src={data.eventType.cover_image} alt="" class="max-h-16 w-auto object-contain" />
				</div>
				<div class="border-b border-gray-200 mx-6 mt-4"></div>
			{/if}

			<!-- Back button for non-calendar steps -->
			{#if mobileStep !== 'calendar'}
				<div class="px-6 py-4">
					<button onclick={goBackMobile} class="flex items-center gap-2 text-gray-600 hover:text-gray-900" aria-label="Go back">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
						</svg>
						<span class="text-sm">Back</span>
					</button>
				</div>
			{/if}

			<!-- Profile Image centered with name below -->
			{#if mobileStep === 'calendar'}
				<div class="flex flex-col items-center pt-8 pb-6 px-6">
					{#if data.user?.profileImage}
						<img src={data.user.profileImage} alt={data.user.name} class="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
					{:else}
						<div class="w-24 h-24 rounded-full flex items-center justify-center text-white font-semibold text-3xl border-4 border-white shadow-lg" style="background-color: var(--brand-color)">
							{data.user?.name?.charAt(0) || 'M'}
						</div>
					{/if}
					<p class="mt-4 text-base font-semibold text-gray-600">{data.user?.name || 'Host'}</p>
				</div>

				<!-- Meeting Title -->
				<div class="px-6 pb-5">
					<h1 class="text-2xl font-bold text-gray-900 text-center">{data.eventType?.name || 'Meeting'}</h1>
				</div>

				<!-- Meeting Details List -->
				<div class="px-6 pb-5">
					<ul class="space-y-3 text-sm text-gray-600">
						<li class="flex items-center gap-3">
							<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<span>{data.eventType?.duration} min</span>
						</li>
						<li class="flex items-center gap-3">
							{#if data.eventType?.location_type === 'in_person'}
								<svg class="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
								</svg>
								<span class="truncate">{data.eventType?.room_name ? `${data.eventType.room_name}${data.eventType?.room_location ? ` (${data.eventType.room_location})` : ''}` : 'In-Person Meeting'}</span>
							{:else}
								<svg class="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
								</svg>
								<span>{data.eventType?.location_type === 'ms_teams' || data.eventType?.invite_calendar === 'outlook' ? 'Microsoft Teams' : 'Google Meet'}</span>
							{/if}
						</li>
						<li class="flex items-center gap-3">
							<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<button
								type="button"
								onclick={() => showTimezoneDropdown = !showTimezoneDropdown}
								class="flex items-center gap-1 hover:text-gray-900 transition"
							>
								<span>{getTimezoneWithTime(selectedTimezone, use12Hour)}</span>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
								</svg>
							</button>
						</li>
					</ul>
					{#if showTimezoneDropdown}
						<div class="mt-2">
							<TimezoneSelector
								{selectedTimezone}
								onSelect={(tz) => selectedTimezone = tz}
								onClose={() => showTimezoneDropdown = false}
								{brandColor}
							/>
						</div>
					{/if}
				</div>

				<!-- Description -->
				{#if data.eventType?.description}
					<div class="px-6 pb-5 text-sm text-gray-600 prose prose-sm max-w-none">
						{@html sanitizedDescription}
					</div>
				{/if}

				<!-- Breakline / Divider -->
				<div class="border-b border-gray-200 mx-6 mb-6"></div>

				<!-- Calendar with arrows around month name -->
				<div class="px-6 pb-8">
					<h2 class="text-lg font-semibold text-gray-900 mb-5 text-center">Select a Date & Time</h2>

					<!-- Month navigation with arrows on sides -->
					<div class="flex items-center justify-between mb-4">
						<button onclick={prevMonth} class="p-2 hover:bg-gray-100 rounded-full transition" aria-label="Previous month">
							<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
							</svg>
						</button>
						<h3 class="text-base font-semibold text-gray-900">{formatMonthYear(currentMonth)}</h3>
						<button onclick={nextMonth} class="p-2 hover:bg-gray-100 rounded-full transition" aria-label="Next month">
							<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
							</svg>
						</button>
					</div>

					<!-- Weekday headers -->
					<div class="grid grid-cols-7 gap-1 mb-2">
						{#each weekDays as day}
							<div class="text-center text-xs font-medium text-gray-500 py-2">{day}</div>
						{/each}
					</div>

					<!-- Calendar grid -->
					<div class="grid grid-cols-7 gap-1">
						{#each calendarDays() as day}
							{@const hasSlots = availableDates.has(day.dateStr)}
							{@const isClickable = day.isAvailable && hasSlots}
							{@const isSelected = selectedDate === day.dateStr}
							<button
								type="button"
								onclick={() => isClickable && handleDateSelect(day.dateStr)}
								disabled={!isClickable}
								class="aspect-square flex items-center justify-center text-sm rounded-full transition
									{!day.isCurrentMonth ? 'text-gray-300' : ''}
									{isClickable && !isSelected ? 'font-semibold' : ''}
									{day.isAvailable && !hasSlots && day.isCurrentMonth ? 'text-gray-400' : ''}
									{!day.isAvailable && day.isCurrentMonth ? 'text-gray-300' : ''}
									{isSelected ? 'text-white' : ''}"
								style="{isClickable && !isSelected ? `background-color: var(--brand-lighter); color: var(--brand-dark)` : ''}{isSelected ? `background-color: var(--brand-color)` : ''}"
							>
								{day.date.getDate()}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Mobile Time Slots -->
			{#if mobileStep === 'times'}
				<div class="px-6 pb-8">
					<h2 class="text-lg font-semibold text-gray-900 mb-2 text-center">Select a Time</h2>
					<p class="text-sm text-gray-500 text-center mb-6">{selectedDate ? formatSelectedDate(selectedDate) : ''}</p>
					{#if loading}
						<div class="flex items-center justify-center py-8">
							<div class="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style="border-color: var(--brand-color); border-top-color: transparent;"></div>
						</div>
					{:else if availableSlots.length === 0}
						<p class="text-sm text-gray-500 py-4 text-center">No available times for this date</p>
					{:else}
						<div class="grid grid-cols-2 gap-3">
							{#each availableSlots as slot}
								{@const isSelected = selectedSlot === slot}
								<button
									type="button"
									onclick={() => selectSlot(slot)}
									class="py-3 px-4 border-2 rounded-lg text-sm font-semibold transition
										{isSelected ? 'border-gray-900 bg-gray-900 text-white' : ''}"
									style="{!isSelected ? `border-color: var(--brand-color); color: var(--brand-color)` : ''}"
								>
									{formatTime(slot.start)}
								</button>
							{/each}
						</div>
						{#if selectedSlot}
							<button
								type="button"
								onclick={confirmSlot}
								class="w-full mt-6 py-3 px-6 text-white rounded-full font-semibold transition"
								style="background-color: var(--brand-color)"
							>
								Next
							</button>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Mobile Booking Form -->
			{#if mobileStep === 'form'}
				<div class="px-6 pb-8">
					{#if bookingError}
						<div class="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">
							{bookingError}
						</div>
					{/if}
					<h2 class="text-lg font-semibold text-gray-900 mb-2 text-center">Enter Details</h2>
					<p class="text-sm text-gray-500 text-center mb-6">
						{selectedDate ? formatShortDate(selectedDate) : ''}{selectedSlot ? ` at ${formatTime(selectedSlot.start)}` : ''}
					</p>
					<form onsubmit={handleSubmit} class="space-y-4">
						<div>
							<label for="mobile-name" class="block text-sm font-medium text-gray-700 mb-1.5">
								Name *
								{#if lockPrefill && bookingForm.name}
									<span class="text-xs text-gray-400 font-normal ml-1">(locked)</span>
								{/if}
							</label>
							<input
								type="text"
								id="mobile-name"
								bind:value={bookingForm.name}
								required
								readonly={lockPrefill && Boolean(bookingForm.name)}
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm {lockPrefill && bookingForm.name ? 'bg-gray-50 cursor-not-allowed text-gray-600' : ''}"
								style="--tw-ring-color: var(--brand-color)"
							/>
						</div>
						<div>
							<label for="mobile-email" class="block text-sm font-medium text-gray-700 mb-1.5">
								Email *
								{#if lockPrefill && bookingForm.email}
									<span class="text-xs text-gray-400 font-normal ml-1">(locked)</span>
								{/if}
							</label>
							<input
								type="email"
								id="mobile-email"
								bind:value={bookingForm.email}
								required
								readonly={lockPrefill && Boolean(bookingForm.email)}
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm {lockPrefill && bookingForm.email ? 'bg-gray-50 cursor-not-allowed text-gray-600' : ''}"
								style="--tw-ring-color: var(--brand-color)"
							/>
						</div>
						<div>
							<label for="mobile-phone" class="block text-sm font-medium text-gray-700 mb-1.5">
								Phone <span class="text-xs text-gray-400 font-normal">(optional)</span>
								{#if lockPrefill && bookingForm.phone}
									<span class="text-xs text-gray-400 font-normal ml-1">(locked)</span>
								{/if}
							</label>
							<input
								type="tel"
								id="mobile-phone"
								bind:value={bookingForm.phone}
								placeholder="+1 (555) 000-0000"
								readonly={lockPrefill && Boolean(bookingForm.phone)}
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm {lockPrefill && bookingForm.phone ? 'bg-gray-50 cursor-not-allowed text-gray-600' : ''}"
								style="--tw-ring-color: var(--brand-color)"
							/>
						</div>
						<div>
							<label for="mobile-notes" class="block text-sm font-medium text-gray-700 mb-1.5">
								Additional notes
							</label>
							<textarea
								id="mobile-notes"
								bind:value={bookingForm.notes}
								rows="4"
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none resize-none text-sm"
								style="--tw-ring-color: var(--brand-color)"
							></textarea>
						</div>
						<button
							type="submit"
							disabled={bookingStatus === 'submitting'}
							class="w-full text-white py-3 px-6 rounded-full font-semibold transition disabled:opacity-50"
							style="background-color: var(--brand-color)"
						>
							{bookingStatus === 'submitting' ? 'Scheduling...' : 'Schedule Event'}
						</button>
					</form>
				</div>
			{/if}

			<!-- Mobile Footer -->
			{#if !isEmbed}
				<Footer class="px-6 pb-8" />
			{/if}
		</div>

		<!-- DESKTOP TOP HEADER: Tenant Logo outside the card in the top-left corner -->
		{#if data.organization?.logoUrl || data.organization?.name}
			<div class="hidden md:flex justify-start items-center mb-4 transition-all duration-300" style="width: {showForm ? '700px' : selectedDate ? '920px' : '650px'}">
				{#if data.organization?.logoUrl}
					<img src={data.organization.logoUrl} alt={data.organization.name} class="h-10 md:h-12 w-auto max-w-[240px] object-contain" />
				{:else}
					<span class="text-xl font-black tracking-tight text-slate-900">{data.organization.name}</span>
				{/if}
			</div>
		{/if}

		<!-- DESKTOP LAYOUT (>= 768px) -->
		<div class="hidden md:flex bg-white rounded-2xl {isEmbed ? 'shadow-none border border-slate-200' : 'shadow-xl shadow-slate-200/50 border border-slate-200/80'} overflow-hidden transition-all duration-300 ease-in-out relative" style="width: {showForm ? '700px' : selectedDate ? '920px' : '650px'}">
			<!-- Language Toggle Pill in top right -->
			<div class="absolute top-4 right-4 z-10 flex items-center gap-1 bg-slate-100/90 backdrop-blur-xs p-0.5 rounded-lg border border-slate-200/80 shadow-2xs">
				<button type="button" onclick={() => currentLocale = 'es'} class="px-2 py-0.5 text-[11px] font-bold rounded-md transition {currentLocale === 'es' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}">ES</button>
				<button type="button" onclick={() => currentLocale = 'en'} class="px-2 py-0.5 text-[11px] font-bold rounded-md transition {currentLocale === 'en' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}">EN</button>
			</div>

			<!-- Left Sidebar -->
			<EventSidebar
				user={data.user}
				organization={data.organization}
				eventType={data.eventType}
				{selectedDate}
				{selectedSlot}
				{brandColor}
				locale={currentLocale}
				{formatTime}
			/>

			<!-- Main Content -->
			<div class="flex-1 p-6">
				{#if bookingError}
					<div class="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 mb-6 max-w-2xl text-xs font-semibold">
						{bookingError}
					</div>
				{/if}

				{#if showForm}
					<BookingForm
						bind:bookingForm
						{bookingStatus}
						{bookingError}
						{brandColor}
						brandDark={colors.dark}
						locale={currentLocale}
						lockPrefill={lockPrefill}
						onSubmit={handleSubmit}
					/>
				{:else}
					<div class="flex items-stretch">
						<div class="w-80">
							<h2 class="text-lg font-bold text-slate-900 mb-5">{t.selectDateTime}</h2>

							<BookingCalendar
								{currentMonth}
								{selectedDate}
								{availableDates}
								{brandColor}
								brandLighter={colors.lighter}
								brandDark={colors.dark}
								locale={currentLocale}
								onDateSelect={handleDateSelect}
								onPrevMonth={prevMonth}
								onNextMonth={nextMonth}
							/>

							<div class="mt-6 relative">
								<p class="text-xs font-bold text-slate-700 mb-1.5">{t.timeZone}</p>
								<button
									type="button"
									onclick={() => showTimezoneDropdown = !showTimezoneDropdown}
									class="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition"
								>
									<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
									</svg>
									<span>{getTimezoneWithTime(selectedTimezone, use12Hour)}</span>
									<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
									</svg>
								</button>
								{#if showTimezoneDropdown}
									<TimezoneSelector
										{selectedTimezone}
										onSelect={(tz) => selectedTimezone = tz}
										onClose={() => showTimezoneDropdown = false}
										{brandColor}
									/>
								{/if}
							</div>
						</div>

						{#if selectedDate}
							<TimeSlotList
								{selectedDate}
								{availableSlots}
								{selectedSlot}
								{loading}
								{brandColor}
								locale={currentLocale}
								{formatTime}
								onSelectSlot={selectSlot}
								onConfirm={confirmSlot}
							/>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		{#if !isEmbed}
			<Footer class="mt-6" />
		{/if}
	{/if}
</div>
