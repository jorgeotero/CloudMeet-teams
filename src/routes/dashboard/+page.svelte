<script lang="ts">
	import type { PageData } from './$types';
	import {
		ProfileSection,
		CancelBookingModal,
		HostRescheduleModal,
		BookingsList,
		EventTypesList,
		WebhooksCard,
		TeamCalendarView,
		TeamMembersView,
		MeetingRoomsView
	} from '$lib/components/dashboard';

	let { data }: { data: PageData } = $props();

	// Active navigation tab
	let activeTab = $state<'personal' | 'team_calendar' | 'team_members' | 'meeting_rooms'>('personal');

	// Local reactive state for UI updates
	let bookings = $state(data.recentBookings || []);
	let teamBookings = $state(data.teamBookings || []);
	let teamMembers = $state(data.teamMembers || []);
	let pendingInvitations = $state(data.pendingInvitations || []);
	let meetingRooms = $state(data.meetingRooms || []);

	// Cancel booking state
	let cancellingBookingId = $state<string | null>(null);
	let showCancelModal = $state(false);
	let cancelSuccess = $state('');

	// Reschedule booking state
	let reschedulingBookingId = $state<string | null>(null);
	let rescheduleSuccess = $state('');

	function openCancelModal(bookingId: string) {
		cancellingBookingId = bookingId;
		showCancelModal = true;
	}

	function closeCancelModal() {
		showCancelModal = false;
		cancellingBookingId = null;
	}

	async function cancelBooking(message: string) {
		if (!cancellingBookingId) return;

		const response = await fetch('/api/bookings/cancel', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				bookingId: cancellingBookingId,
				message: message || null
			})
		});

		if (!response.ok) {
			const errData = await response.json() as { message?: string };
			throw new Error(errData.message || 'Failed to cancel booking');
		}

		// Update local reactive state for immediate UI update in both views
		bookings = bookings.map(b =>
			b.id === cancellingBookingId
				? { ...b, status: 'canceled' }
				: b
		);
		teamBookings = teamBookings.map(b =>
			b.id === cancellingBookingId
				? { ...b, status: 'canceled' }
				: b
		);

		cancelSuccess = 'Booking cancelled successfully';
		closeCancelModal();
		setTimeout(() => cancelSuccess = '', 3000);
	}

	function getBookingById(bookingId: string | null) {
		if (!bookingId) return null;
		return bookings.find(b => b.id === bookingId) || teamBookings.find(b => b.id === bookingId) || null;
	}

	// Reschedule functions
	function openRescheduleModal(bookingId: string) {
		reschedulingBookingId = bookingId;
	}

	function closeRescheduleModal() {
		reschedulingBookingId = null;
	}

	async function submitRescheduleProposal(bookingId: string, newStartTime: string, newEndTime: string, message: string) {
		const response = await fetch('/api/bookings/propose-reschedule', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				bookingId,
				proposedStartTime: newStartTime,
				proposedEndTime: newEndTime,
				message: message || null
			})
		});

		if (!response.ok) {
			const errData = await response.json() as { message?: string };
			throw new Error(errData.message || 'Failed to send reschedule proposal');
		}

		// Update local state - mark as pending reschedule in both views
		bookings = bookings.map(b =>
			b.id === bookingId
				? { ...b, status: 'rescheduled' }
				: b
		);
		teamBookings = teamBookings.map(b =>
			b.id === bookingId
				? { ...b, status: 'rescheduled' }
				: b
		);

		rescheduleSuccess = 'Reschedule proposal sent to attendee';
		closeRescheduleModal();
		setTimeout(() => rescheduleSuccess = '', 3000);
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white shadow-sm border-b border-gray-100">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-3">
					<div>
						<div class="flex items-center gap-2">
							<h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
							{#if data.organization}
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
									{data.organization.organization_name}
								</span>
							{/if}
						</div>
						<p class="text-sm text-gray-600">Welcome back, {data.user?.name || 'User'}!</p>
					</div>
				</div>
				<div class="flex gap-3">
					<a
						href="/dashboard/calendars"
						class="px-3.5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
					>
						Calendars
					</a>
					<a
						href="/dashboard/emails"
						class="px-3.5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
					>
						Emails
					</a>
					<a
						href="/dashboard/availability"
						class="px-3.5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
					>
						Set Availability
					</a>
					<form method="POST" action="/auth/logout">
						<button
							type="submit"
							class="px-3.5 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition"
						>
							Logout
						</button>
					</form>
				</div>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="border-t border-gray-200 bg-white">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<nav class="flex space-x-8" aria-label="Tabs">
					<button
						type="button"
						onclick={() => activeTab = 'personal'}
						class="py-3.5 px-1 border-b-2 font-medium text-sm transition flex items-center gap-2 {activeTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
						</svg>
						<span>My Calendar</span>
						<span class="ml-1 px-2 py-0.5 text-xs rounded-full {activeTab === 'personal' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">
							{bookings.length}
						</span>
					</button>

					{#if data.organization}
						<button
							type="button"
							onclick={() => activeTab = 'team_calendar'}
							class="py-3.5 px-1 border-b-2 font-medium text-sm transition flex items-center gap-2 {activeTab === 'team_calendar' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
							</svg>
							<span>Team Calendar</span>
							<span class="ml-1 px-2 py-0.5 text-xs rounded-full {activeTab === 'team_calendar' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">
								{teamBookings.length}
							</span>
						</button>

						<button
							type="button"
							onclick={() => activeTab = 'team_members'}
							class="py-3.5 px-1 border-b-2 font-medium text-sm transition flex items-center gap-2 {activeTab === 'team_members' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
							</svg>
							<span>Team Members</span>
							<span class="ml-1 px-2 py-0.5 text-xs rounded-full {activeTab === 'team_members' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">
								{teamMembers.length}
							</span>
						</button>

						{#if data.userRole === 'owner' || data.userRole === 'admin'}
							<button
								type="button"
								onclick={() => activeTab = 'meeting_rooms'}
								class="py-3.5 px-1 border-b-2 font-medium text-sm transition flex items-center gap-2 {activeTab === 'meeting_rooms' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
								</svg>
								<span>Meeting Rooms</span>
								<span class="ml-1 px-2 py-0.5 text-xs rounded-full {activeTab === 'meeting_rooms' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">
									{meetingRooms.length}
								</span>
							</button>
						{/if}
					{/if}
				</nav>
			</div>
		</div>
	</header>

	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{#if cancelSuccess || rescheduleSuccess}
			<div class="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm mb-6">
				{cancelSuccess || rescheduleSuccess}
			</div>
		{/if}

		{#if activeTab === 'personal'}
			<!-- Profile Section -->
			<ProfileSection user={data.user} />

			<!-- Booking Links Section -->
			<div class="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-sm space-y-4">
				<h2 class="text-base font-semibold text-gray-900">Your Booking Links</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="p-3.5 bg-blue-50/60 border border-blue-200 rounded-lg">
						<span class="text-xs font-semibold text-blue-900 block mb-1">Direct Personal Link</span>
						<div class="flex items-center gap-2">
							<input
								type="text"
								readonly
								value="{data.appUrl}/u/{data.user?.slug || 'me'}/"
								class="flex-1 px-2.5 py-1.5 bg-white border border-blue-300 rounded text-xs font-mono text-gray-800"
							/>
							<button
								onclick={() => navigator.clipboard.writeText(`${data.appUrl}/u/${data.user?.slug || 'me'}/`)}
								class="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs font-medium"
							>
								Copy
							</button>
						</div>
					</div>

					{#if data.organization}
						<div class="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
							<span class="text-xs font-semibold text-emerald-900 block mb-1">Organization Team Link</span>
							<div class="flex items-center gap-2">
								<input
									type="text"
									readonly
									value="{data.appUrl}/org/{data.organization.organization_slug}/{data.user?.slug || 'me'}/"
									class="flex-1 px-2.5 py-1.5 bg-white border border-emerald-300 rounded text-xs font-mono text-gray-800"
								/>
								<button
									onclick={() => navigator.clipboard.writeText(`${data.appUrl}/org/${data.organization?.organization_slug}/${data.user?.slug || 'me'}/`)}
									class="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition text-xs font-medium"
								>
									Copy
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
				<!-- Event Types -->
				<EventTypesList eventTypes={data.eventTypes || []} />

				<!-- Recent Bookings -->
				<BookingsList {bookings} onCancelClick={openCancelModal} onRescheduleClick={openRescheduleModal} />
			</div>

			<!-- Webhooks Section -->
			<WebhooksCard />

		{:else if activeTab === 'team_calendar'}
			<!-- Team Calendar View -->
			<TeamCalendarView
				{teamBookings}
				{teamMembers}
				currentUserId={data.user?.id}
				userRole={data.userRole}
				onCancelClick={openCancelModal}
				onRescheduleClick={openRescheduleModal}
			/>

		{:else if activeTab === 'team_members'}
			<!-- Team Members View -->
			<TeamMembersView
				organization={data.organization}
				bind:teamMembers={teamMembers}
				bind:pendingInvitations={pendingInvitations}
				currentUserId={data.user?.id}
				userRole={data.userRole}
				appUrl={data.appUrl}
			/>

		{:else if activeTab === 'meeting_rooms'}
			<!-- Meeting Rooms View -->
			<MeetingRoomsView
				bind:rooms={meetingRooms}
				userRole={data.userRole}
			/>
		{/if}
	</main>
</div>

<!-- Cancel Booking Modal -->
<CancelBookingModal
	booking={getBookingById(cancellingBookingId)}
	show={showCancelModal}
	onClose={closeCancelModal}
	onCancel={cancelBooking}
/>

<!-- Host Reschedule Modal -->
<HostRescheduleModal
	booking={getBookingById(reschedulingBookingId)}
	onClose={closeRescheduleModal}
	onSubmit={submitRescheduleProposal}
/>
