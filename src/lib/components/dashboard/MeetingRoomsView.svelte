<script lang="ts">
	interface MeetingRoom {
		id: string;
		organization_id: string;
		name: string;
		location: string | null;
		capacity: number;
		is_active: number;
		created_at?: string;
	}

	interface Props {
		rooms: MeetingRoom[];
		userRole?: string;
	}

	let {
		rooms = $bindable([]),
		userRole = 'member'
	}: Props = $props();

	const canManage = $derived(userRole === 'owner' || userRole === 'admin');

	// Modal state
	let showModal = $state(false);
	let editingRoom = $state<MeetingRoom | null>(null);
	let roomName = $state('');
	let roomLocation = $state('');
	let roomCapacity = $state(4);
	let roomIsActive = $state(true);

	let submitting = $state(false);
	let actionError = $state('');
	let actionSuccess = $state('');

	function openAddModal() {
		editingRoom = null;
		roomName = '';
		roomLocation = '';
		roomCapacity = 4;
		roomIsActive = true;
		actionError = '';
		showModal = true;
	}

	function openEditModal(room: MeetingRoom) {
		editingRoom = room;
		roomName = room.name;
		roomLocation = room.location || '';
		roomCapacity = room.capacity || 4;
		roomIsActive = room.is_active === 1;
		actionError = '';
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingRoom = null;
		actionError = '';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!roomName.trim()) {
			actionError = 'Room name is required';
			return;
		}

		submitting = true;
		actionError = '';

		try {
			if (editingRoom) {
				// Update room
				const res = await fetch('/api/organizations/rooms', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: editingRoom.id,
						name: roomName.trim(),
						location: roomLocation.trim() || null,
						capacity: roomCapacity,
						is_active: roomIsActive ? 1 : 0
					})
				});

				if (!res.ok) {
					const data = await res.json() as { message?: string };
					throw new Error(data.message || 'Failed to update meeting room');
				}

				const { room } = await res.json() as { room: MeetingRoom };
				rooms = rooms.map(r => r.id === room.id ? room : r);
				actionSuccess = 'Meeting room updated successfully';
			} else {
				// Create room
				const res = await fetch('/api/organizations/rooms', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: roomName.trim(),
						location: roomLocation.trim() || null,
						capacity: roomCapacity
					})
				});

				if (!res.ok) {
					const data = await res.json() as { message?: string };
					throw new Error(data.message || 'Failed to create meeting room');
				}

				const { room } = await res.json() as { room: MeetingRoom };
				rooms = [room, ...rooms];
				actionSuccess = 'Meeting room added successfully';
			}

			closeModal();
			setTimeout(() => actionSuccess = '', 3000);
		} catch (err: any) {
			actionError = err.message || 'Failed to save meeting room';
		} finally {
			submitting = false;
		}
	}

	async function handleDelete(roomId: string, name: string) {
		if (!confirm(`Are you sure you want to delete room "${name}"?`)) {
			return;
		}

		try {
			const res = await fetch('/api/organizations/rooms', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: roomId })
			});

			if (!res.ok) {
				const data = await res.json() as { message?: string };
				throw new Error(data.message || 'Failed to delete meeting room');
			}

			rooms = rooms.filter(r => r.id !== roomId);
			actionSuccess = `Meeting room "${name}" deleted`;
			setTimeout(() => actionSuccess = '', 3000);
		} catch (err: any) {
			alert(err.message || 'Failed to delete meeting room');
		}
	}
</script>

<div class="space-y-6">
	<!-- Header Bar -->
	<div class="bg-white rounded-xl shadow-sm p-5 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h2 class="text-lg font-bold text-gray-900">Physical Meeting Rooms</h2>
			<p class="text-sm text-gray-500 mt-1">
				Configure offline conference rooms. When attached to an event type, rooms are automatically reserved with cross-team conflict prevention.
			</p>
		</div>

		{#if canManage}
			<button
				type="button"
				onclick={openAddModal}
				class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition shadow-sm self-start sm:self-auto"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
				</svg>
				<span>Add Meeting Room</span>
			</button>
		{/if}
	</div>

	{#if actionSuccess}
		<div class="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">
			{actionSuccess}
		</div>
	{/if}

	<!-- Rooms Grid -->
	{#if rooms.length === 0}
		<div class="bg-white rounded-xl border border-gray-200 p-12 text-center">
			<div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
				</svg>
			</div>
			<h3 class="text-base font-semibold text-gray-900 mb-1">No meeting rooms added yet</h3>
			<p class="text-sm text-gray-500 max-w-sm mx-auto mb-4">
				Add physical conference rooms or meeting spaces so event types can automatically block rooms when booked.
			</p>
			{#if canManage}
				<button
					type="button"
					onclick={openAddModal}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition"
				>
					Add Your First Room
				</button>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
			{#each rooms as room}
				<div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:border-gray-300 transition flex flex-col justify-between">
					<div>
						<div class="flex items-start justify-between gap-2 mb-2">
							<div class="flex items-center gap-2">
								<span class="w-2.5 h-2.5 rounded-full {room.is_active ? 'bg-green-500' : 'bg-gray-300'}"></span>
								<h3 class="text-base font-semibold text-gray-900">{room.name}</h3>
							</div>
							<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
								<svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
								</svg>
								Cap: {room.capacity}
							</span>
						</div>

						{#if room.location}
							<p class="text-xs text-gray-600 flex items-center gap-1 mb-3">
								<svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
								</svg>
								<span class="truncate">{room.location}</span>
							</p>
						{:else}
							<p class="text-xs text-gray-400 italic mb-3">No location / floor specified</p>
						{/if}
					</div>

					{#if canManage}
						<div class="border-t border-gray-100 pt-3 mt-3 flex items-center justify-between">
							<span class="text-xs {room.is_active ? 'text-green-600 font-medium' : 'text-gray-400'}">
								{room.is_active ? 'Active' : 'Inactive'}
							</span>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => openEditModal(room)}
									class="px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition"
								>
									Edit
								</button>
								<button
									type="button"
									onclick={() => handleDelete(room.id, room.name)}
									class="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition"
								>
									Delete
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Add / Edit Room Modal -->
{#if showModal}
	<div class="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
		<div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95">
			<button
				type="button"
				onclick={closeModal}
				class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
				</svg>
			</button>

			<h3 class="text-lg font-bold text-gray-900 mb-1">
				{editingRoom ? 'Edit Meeting Room' : 'Add New Meeting Room'}
			</h3>
			<p class="text-xs text-gray-500 mb-4">
				{editingRoom ? 'Update room configuration and capacity.' : 'Register a physical space for team scheduling.'}
			</p>

			{#if actionError}
				<div class="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-xs mb-4">
					{actionError}
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<label for="room_name" class="block text-xs font-semibold text-gray-700 mb-1">
						Room Name <span class="text-red-500">*</span>
					</label>
					<input
						type="text"
						id="room_name"
						bind:value={roomName}
						placeholder="e.g. Conference Room A, Boardroom, Phone Booth 1"
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<div>
					<label for="room_location" class="block text-xs font-semibold text-gray-700 mb-1">
						Location / Floor
					</label>
					<input
						type="text"
						id="room_location"
						bind:value={roomLocation}
						placeholder="e.g. 2nd Floor, Room 204, East Wing"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<div>
					<label for="room_capacity" class="block text-xs font-semibold text-gray-700 mb-1">
						Capacity (People)
					</label>
					<input
						type="number"
						id="room_capacity"
						bind:value={roomCapacity}
						min="1"
						max="500"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				{#if editingRoom}
					<div class="flex items-center gap-2 pt-1">
						<input
							type="checkbox"
							id="room_active"
							bind:checked={roomIsActive}
							class="h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<label for="room_active" class="text-xs font-medium text-gray-700">
							Active (room is available for bookings)
						</label>
					</div>
				{/if}

				<div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
					<button
						type="button"
						onclick={closeModal}
						class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={submitting}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
					>
						{#if submitting}
							<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
						{/if}
						<span>{editingRoom ? 'Save Changes' : 'Create Room'}</span>
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
