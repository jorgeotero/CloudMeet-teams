<script lang="ts">
	import { onMount } from 'svelte';

	interface Webhook {
		id: string;
		url: string;
		events: string[];
		secret: string;
		isActive: boolean;
		createdAt?: string;
	}

	let webhooks = $state<Webhook[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let successMsg = $state<string | null>(null);

	// Form state
	let showAddModal = $state(false);
	let newUrl = $state('');
	let newSecret = $state('');
	let selectAllEvents = $state(true);
	let selectedEvents = $state<string[]>([
		'booking.created',
		'booking.rescheduled',
		'booking.canceled',
		'booking.proposal_sent'
	]);
	let saving = $state(false);
	let showSecretMap = $state<Record<string, boolean>>({});

	const AVAILABLE_EVENTS = [
		{ id: 'booking.created', label: 'Booking Created', desc: 'When a new meeting is scheduled' },
		{ id: 'booking.rescheduled', label: 'Booking Rescheduled', desc: 'When a meeting is rescheduled' },
		{ id: 'booking.canceled', label: 'Booking Canceled', desc: 'When a host or attendee cancels' },
		{ id: 'booking.proposal_sent', label: 'Proposal Sent', desc: 'When a host proposes a new time' }
	];

	onMount(() => {
		loadWebhooks();
	});

	async function loadWebhooks() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/webhooks');
			if (res.ok) {
				const data = (await res.json()) as { webhooks: Webhook[] };
				webhooks = data.webhooks || [];
			} else {
				error = 'Failed to load webhooks';
			}
		} catch (err) {
			error = 'Failed to load webhooks';
		} finally {
			loading = false;
		}
	}

	async function handleAddWebhook(e: Event) {
		e.preventDefault();
		if (!newUrl.trim()) return;

		saving = true;
		error = null;
		successMsg = null;

		const events = selectAllEvents ? ['*'] : selectedEvents;

		try {
			const res = await fetch('/api/webhooks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: newUrl.trim(),
					events,
					secret: newSecret.trim() || undefined
				})
			});

			if (!res.ok) {
				const data = await res.json() as { message?: string };
				throw new Error(data.message || 'Failed to create webhook');
			}

			newUrl = '';
			newSecret = '';
			selectAllEvents = true;
			showAddModal = false;
			successMsg = 'Webhook configured successfully';
			await loadWebhooks();
			setTimeout(() => { successMsg = null; }, 4000);
		} catch (err: any) {
			error = err.message || 'Failed to create webhook';
		} finally {
			saving = false;
		}
	}

	async function toggleActive(wh: Webhook) {
		const newStatus = !wh.isActive;
		try {
			const res = await fetch('/api/webhooks', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: wh.id,
					isActive: newStatus
				})
			});
			if (res.ok) {
				wh.isActive = newStatus;
			}
		} catch (err) {
			console.error('Failed to toggle webhook state:', err);
		}
	}

	async function deleteWebhook(id: string) {
		if (!confirm('Are you sure you want to delete this webhook endpoint?')) return;
		try {
			const res = await fetch(`/api/webhooks?id=${id}`, { method: 'DELETE' });
			if (res.ok) {
				webhooks = webhooks.filter(w => w.id !== id);
				successMsg = 'Webhook deleted';
				setTimeout(() => { successMsg = null; }, 3000);
			}
		} catch (err) {
			console.error('Failed to delete webhook:', err);
		}
	}

	function toggleEvent(eventId: string) {
		if (selectedEvents.includes(eventId)) {
			selectedEvents = selectedEvents.filter(e => e !== eventId);
		} else {
			selectedEvents = [...selectedEvents, eventId];
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		successMsg = 'Secret copied to clipboard!';
		setTimeout(() => { successMsg = null; }, 3000);
	}
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
		<div>
			<div class="flex items-center gap-2">
				<h2 class="text-xl font-bold text-gray-900">Webhooks</h2>
				<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">HMAC-SHA256</span>
			</div>
			<p class="text-sm text-gray-500 mt-1">
				Receive real-time signed HTTP notifications for booking creations, cancellations, and reschedules.
			</p>
		</div>
		<button
			type="button"
			onclick={() => { showAddModal = !showAddModal; }}
			class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			{showAddModal ? 'Close Form' : 'Add Webhook'}
		</button>
	</div>

	{#if error}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between">
			<span>{error}</span>
			<button type="button" onclick={() => { error = null; }} class="text-red-500 hover:text-red-700">✕</button>
		</div>
	{/if}

	{#if successMsg}
		<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg flex items-center justify-between">
			<span>{successMsg}</span>
			<button type="button" onclick={() => { successMsg = null; }} class="text-green-600 hover:text-green-800">✕</button>
		</div>
	{/if}

	{#if showAddModal}
		<form onsubmit={handleAddWebhook} class="mb-6 p-5 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
			<h3 class="text-base font-semibold text-gray-900">New Webhook Subscription</h3>

			<div>
				<label for="webhook-url" class="block text-sm font-medium text-gray-700 mb-1">Payload URL *</label>
				<input
					type="url"
					id="webhook-url"
					bind:value={newUrl}
					required
					placeholder="https://example.com/api/webhooks/cloudmeet"
					class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<p class="text-xs text-gray-500 mt-1">Must be an active HTTP/HTTPS endpoint capable of accepting POST requests.</p>
			</div>

			<div>
				<label for="webhook-secret" class="block text-sm font-medium text-gray-700 mb-1">
					Signing Secret <span class="text-xs text-gray-400 font-normal">(optional — auto-generated if left blank)</span>
				</label>
				<input
					type="text"
					id="webhook-secret"
					bind:value={newSecret}
					placeholder="Leave blank to generate a secure random secret"
					class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-2">Subscribed Events</label>
				<div class="space-y-2">
					<label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800">
						<input
							type="checkbox"
							checked={selectAllEvents}
							onchange={(e) => { selectAllEvents = (e.target as HTMLInputElement).checked; }}
							class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
						/>
						<span>Send me everything (All Events - <code>*</code>)</span>
					</label>

					{#if !selectAllEvents}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200">
							{#each AVAILABLE_EVENTS as ev}
								<label class="flex items-start gap-2 p-2 border border-gray-200 bg-white rounded-lg cursor-pointer hover:bg-gray-50 text-xs">
									<input
										type="checkbox"
										checked={selectedEvents.includes(ev.id)}
										onchange={() => toggleEvent(ev.id)}
										class="w-4 h-4 mt-0.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
									/>
									<div>
										<div class="font-medium text-gray-900">{ev.label}</div>
										<div class="text-gray-500">{ev.id}</div>
									</div>
								</label>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="flex items-center justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => { showAddModal = false; }}
					class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition text-sm"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={saving}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
				>
					{saving ? 'Saving...' : 'Create Webhook'}
				</button>
			</div>
		</form>
	{/if}

	<!-- Webhooks List -->
	{#if loading}
		<div class="py-8 text-center text-gray-400 text-sm">Loading webhooks...</div>
	{:else if webhooks.length === 0}
		<div class="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
			<svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
			</svg>
			<p class="text-gray-500 text-sm">No webhooks configured yet.</p>
			<p class="text-xs text-gray-400 mt-1">Connect your CRM, Zapier, or backend API to receive instant updates.</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each webhooks as wh (wh.id)}
				<div class="p-4 border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition">
					<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
						<div class="flex items-center gap-2 overflow-hidden">
							<span class="w-2.5 h-2.5 rounded-full {wh.isActive ? 'bg-green-500' : 'bg-gray-300'} flex-shrink-0"></span>
							<span class="font-mono text-sm font-semibold text-gray-900 truncate" title={wh.url}>{wh.url}</span>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<button
								type="button"
								onclick={() => toggleActive(wh)}
								class="px-2.5 py-1 text-xs font-medium rounded-full transition {wh.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							>
								{wh.isActive ? 'Active' : 'Paused'}
							</button>
							<button
								type="button"
								onclick={() => deleteWebhook(wh.id)}
								class="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition"
								title="Delete webhook"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							</button>
						</div>
					</div>

					<!-- Subscribed events pills -->
					<div class="flex flex-wrap items-center gap-1.5 mb-3">
						<span class="text-xs text-gray-400">Events:</span>
						{#if wh.events.includes('*')}
							<span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-md font-mono">All Events (*)</span>
						{:else}
							{#each wh.events as ev}
								<span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-md font-mono">{ev}</span>
							{/each}
						{/if}
					</div>

					<!-- Secret display and copy -->
					<div class="flex items-center justify-between text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
						<div class="flex items-center gap-2 overflow-hidden">
							<span class="text-gray-500 font-medium">Secret:</span>
							<span class="font-mono text-gray-700">
								{showSecretMap[wh.id] ? wh.secret : '••••••••••••••••••••••••••••••••'}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => { showSecretMap[wh.id] = !showSecretMap[wh.id]; }}
								class="text-blue-600 hover:text-blue-800 font-medium"
							>
								{showSecretMap[wh.id] ? 'Hide' : 'Show'}
							</button>
							<span class="text-gray-300">|</span>
							<button
								type="button"
								onclick={() => copyToClipboard(wh.secret)}
								class="text-blue-600 hover:text-blue-800 font-medium"
							>
								Copy
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
