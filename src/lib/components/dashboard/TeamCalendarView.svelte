<script lang="ts">
	interface HostInfo {
		host_id: string;
		host_name: string;
		host_email: string;
		host_slug: string;
		host_image: string | null;
	}

	interface TeamBooking extends HostInfo {
		id: string;
		start_time: string;
		end_time: string;
		attendee_name: string;
		attendee_email: string;
		attendee_phone: string | null;
		attendee_notes?: string | null;
		event_type_id?: string;
		status: string;
		created_at: string;
		meeting_url: string | null;
		event_type_name: string;
		event_type_slug: string;
		duration_minutes: number;
	}

	interface TeamMember {
		user_id: string;
		name: string;
		email: string;
		slug: string;
		profile_image: string | null;
		role: string;
	}

	interface Props {
		teamBookings: TeamBooking[];
		teamMembers: TeamMember[];
		currentUserId?: string;
		userRole?: string;
		onCancelClick?: (bookingId: string) => void;
		onRescheduleClick?: (bookingId: string) => void;
	}

	let {
		teamBookings = [],
		teamMembers = [],
		currentUserId,
		userRole = 'member',
		onCancelClick,
		onRescheduleClick
	}: Props = $props();

	let selectedMemberId = $state<string | null>(null);
	let statusFilter = $state<'all' | 'confirmed' | 'rescheduled' | 'canceled'>('all');

	const filteredBookings = $derived.by(() => {
		return teamBookings.filter(b => {
			if (selectedMemberId && b.host_id !== selectedMemberId) {
				return false;
			}
			if (statusFilter !== 'all' && b.status !== statusFilter) {
				return false;
			}
			return true;
		});
	});

	function formatDate(isoStr: string) {
		const date = new Date(isoStr);
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function formatTime(isoStr: string) {
		const date = new Date(isoStr);
		return new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(date);
	}
</script>

<div class="space-y-6">
	<!-- Filter Bar -->
	<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
			<!-- Member Filter Pills -->
			<div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
				<button
					type="button"
					onclick={() => selectedMemberId = null}
					class="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 {selectedMemberId === null ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
				>
					<span>All Members</span>
					<span class="px-1.5 py-0.5 rounded-full text-[10px] {selectedMemberId === null ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}">
						{teamBookings.length}
					</span>
				</button>

				{#each teamMembers as member}
					{@const count = teamBookings.filter(b => b.host_id === member.user_id).length}
					<button
						type="button"
						onclick={() => selectedMemberId = member.user_id}
						class="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex items-center gap-2 {selectedMemberId === member.user_id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
					>
						{#if member.profile_image}
							<img src={member.profile_image} alt="" class="w-4 h-4 rounded-full object-cover" />
						{:else}
							<span class="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
								{member.name.charAt(0)}
							</span>
						{/if}
						<span>{member.name}</span>
						<span class="px-1.5 py-0.5 rounded-full text-[10px] {selectedMemberId === member.user_id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}">
							{count}
						</span>
					</button>
				{/each}
			</div>

			<!-- Status Filter Pills -->
			<div class="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg self-start sm:self-auto">
				<button
					type="button"
					onclick={() => statusFilter = 'all'}
					class="px-2.5 py-1 text-xs font-medium rounded-md transition {statusFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
				>
					All
				</button>
				<button
					type="button"
					onclick={() => statusFilter = 'confirmed'}
					class="px-2.5 py-1 text-xs font-medium rounded-md transition {statusFilter === 'confirmed' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
				>
					Confirmed
				</button>
				<button
					type="button"
					onclick={() => statusFilter = 'rescheduled'}
					class="px-2.5 py-1 text-xs font-medium rounded-md transition {statusFilter === 'rescheduled' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
				>
					Rescheduled
				</button>
				<button
					type="button"
					onclick={() => statusFilter = 'canceled'}
					class="px-2.5 py-1 text-xs font-medium rounded-md transition {statusFilter === 'canceled' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
				>
					Canceled
				</button>
			</div>
		</div>
	</div>

	<!-- Bookings List -->
	{#if filteredBookings.length === 0}
		<div class="bg-white rounded-xl border border-gray-200 p-12 text-center">
			<div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
				</svg>
			</div>
			<h3 class="text-base font-semibold text-gray-900 mb-1">No bookings found</h3>
			<p class="text-sm text-gray-500">There are no team bookings matching your current filter.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4">
			{#each filteredBookings as booking}
				<div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:border-gray-300 transition">
					<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
						<!-- Left: Meeting info & Host -->
						<div class="space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<!-- Host Pill -->
								<div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-800">
									{#if booking.host_image}
										<img src={booking.host_image} alt="" class="w-4 h-4 rounded-full object-cover" />
									{:else}
										<span class="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
											{booking.host_name.charAt(0)}
										</span>
									{/if}
									<span>Host: <strong>{booking.host_name}</strong></span>
								</div>

								<!-- Meeting Name -->
								<span class="font-semibold text-gray-900">{booking.event_type_name}</span>
								<span class="text-xs text-gray-500">({booking.duration_minutes}m)</span>

								<!-- Status Badge -->
								{#if booking.status === 'confirmed'}
									<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">Confirmed</span>
								{:else if booking.status === 'rescheduled'}
									<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Rescheduled</span>
								{:else}
									<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">Canceled</span>
								{/if}
							</div>

							<!-- Attendee Info -->
							<div class="flex flex-wrap items-center gap-4 text-sm text-gray-600">
								<div class="flex items-center gap-1.5">
									<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
									</svg>
									<span class="font-medium text-gray-900">{booking.attendee_name}</span>
									<span class="text-gray-400">({booking.attendee_email})</span>
								</div>
								{#if booking.attendee_phone}
									<div class="flex items-center gap-1.5 text-xs text-gray-500">
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
										</svg>
										<span>{booking.attendee_phone}</span>
									</div>
								{/if}
							</div>

							<!-- Date & Time -->
							<div class="flex items-center gap-2 text-xs text-gray-500">
								<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<span class="font-medium text-gray-700">{formatDate(booking.start_time)}</span>
								<span>•</span>
								<span>{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</span>
							</div>

							{#if booking.attendee_notes}
								<p class="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 italic">
									"{booking.attendee_notes}"
								</p>
							{/if}
						</div>

						<!-- Right: Actions -->
						<div class="flex items-center gap-2 shrink-0">
							{#if booking.meeting_url && booking.status !== 'canceled'}
								<a
									href={booking.meeting_url}
									target="_blank"
									rel="noopener noreferrer"
									class="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs font-semibold flex items-center gap-1.5"
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
									</svg>
									Join Call
								</a>
							{/if}

							{#if (booking.host_id === currentUserId || userRole === 'owner' || userRole === 'admin') && booking.status !== 'canceled'}
								{#if onRescheduleClick}
									<button
										type="button"
										onclick={() => onRescheduleClick(booking.id)}
										class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-xs font-medium"
									>
										Reschedule
									</button>
								{/if}
								{#if onCancelClick}
									<button
										type="button"
										onclick={() => onCancelClick(booking.id)}
										class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-xs font-medium"
									>
										Cancel
									</button>
								{/if}
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
