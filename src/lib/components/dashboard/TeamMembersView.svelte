<script lang="ts">
	interface TeamMember {
		member_id: string;
		role: 'owner' | 'admin' | 'member';
		joined_at: string;
		user_id: string;
		name: string;
		email: string;
		slug: string;
		profile_image: string | null;
		google_connected: number;
		outlook_connected: number;
	}

	interface PendingInvitation {
		id: string;
		email: string;
		role: 'owner' | 'admin' | 'member';
		token: string;
		expires_at: string;
		created_at: string;
	}

	interface Props {
		organization: {
			id: string;
			organization_id: string;
			organization_name: string;
			organization_slug: string;
			role: 'owner' | 'admin' | 'member';
		} | null;
		teamMembers: TeamMember[];
		pendingInvitations: PendingInvitation[];
		currentUserId?: string;
		userRole?: string;
		appUrl?: string;
	}

	let {
		organization,
		teamMembers = $bindable([]),
		pendingInvitations = $bindable([]),
		currentUserId,
		userRole = 'member',
		appUrl = ''
	}: Props = $props();

	let showInviteModal = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state<'admin' | 'member'>('member');
	let inviteSubmitting = $state(false);
	let inviteError = $state('');
	let actionMessage = $state('');
	let copiedToken = $state<string | null>(null);

	const canManage = $derived(userRole === 'owner' || userRole === 'admin');

	async function handleInvite(e: Event) {
		e.preventDefault();
		inviteSubmitting = true;
		inviteError = '';

		try {
			const res = await fetch('/api/organizations/members', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteEmail,
					role: inviteRole
				})
			});

			if (!res.ok) {
				const data = await res.json() as { message?: string };
				throw new Error(data.message || 'Failed to send invitation');
			}

			const data = await res.json() as { success: boolean; invitation: PendingInvitation };
			pendingInvitations = [data.invitation, ...pendingInvitations.filter(i => i.email !== inviteEmail)];

			inviteEmail = '';
			inviteRole = 'member';
			showInviteModal = false;
			actionMessage = 'Invitation generated successfully!';
			setTimeout(() => actionMessage = '', 3500);
		} catch (err: any) {
			inviteError = err.message || 'Failed to invite member';
		} finally {
			inviteSubmitting = false;
		}
	}

	async function changeRole(targetUserId: string, newRole: 'admin' | 'member') {
		try {
			const res = await fetch('/api/organizations/members', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetUserId,
					newRole
				})
			});

			if (!res.ok) {
				const data = await res.json() as { message?: string };
				throw new Error(data.message || 'Failed to change role');
			}

			teamMembers = teamMembers.map(m =>
				m.user_id === targetUserId ? { ...m, role: newRole } : m
			);
			actionMessage = 'Member role updated!';
			setTimeout(() => actionMessage = '', 3000);
		} catch (err: any) {
			alert(err.message || 'Failed to change role');
		}
	}

	async function removeMember(targetUserId: string, memberName: string) {
		if (!confirm(`Are you sure you want to remove ${memberName} from this organization?`)) {
			return;
		}

		try {
			const res = await fetch('/api/organizations/members', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetUserId })
			});

			if (!res.ok) {
				const data = await res.json() as { message?: string };
				throw new Error(data.message || 'Failed to remove member');
			}

			teamMembers = teamMembers.filter(m => m.user_id !== targetUserId);
			actionMessage = 'Member removed from team.';
			setTimeout(() => actionMessage = '', 3000);
		} catch (err: any) {
			alert(err.message || 'Failed to remove member');
		}
	}

	async function cancelInvitation(invitationId: string) {
		try {
			const res = await fetch('/api/organizations/members', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ invitationId })
			});

			if (!res.ok) {
				const data = await res.json() as { message?: string };
				throw new Error(data.message || 'Failed to cancel invitation');
			}

			pendingInvitations = pendingInvitations.filter(i => i.id !== invitationId);
			actionMessage = 'Invitation canceled.';
			setTimeout(() => actionMessage = '', 3000);
		} catch (err: any) {
			alert(err.message || 'Failed to cancel invitation');
		}
	}

	function copyInviteLink(token: string) {
		const link = `${appUrl}/auth/login`;
		navigator.clipboard.writeText(link);
		copiedToken = token;
		setTimeout(() => copiedToken = null, 2500);
	}
</script>

<div class="space-y-8">
	{#if actionMessage}
		<div class="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm flex items-center justify-between">
			<span>{actionMessage}</span>
			<button type="button" onclick={() => actionMessage = ''} class="text-green-600 hover:text-green-800">✕</button>
		</div>
	{/if}

	<!-- Organization Card -->
	<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200">
			<div>
				<div class="flex items-center gap-2 mb-1">
					<h2 class="text-xl font-bold text-gray-900">{organization?.organization_name || 'Organization'}</h2>
					<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
						{userRole}
					</span>
				</div>
				<p class="text-sm text-gray-500">
					Workspace Slug: <code class="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-800">{organization?.organization_slug}</code>
				</p>
			</div>

			{#if canManage}
				<button
					type="button"
					onclick={() => showInviteModal = true}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold flex items-center gap-2 self-start sm:self-auto shadow-sm"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
					</svg>
					Invite Member
				</button>
			{/if}
		</div>

		<!-- Team Members List -->
		<div class="pt-6">
			<h3 class="text-base font-semibold text-gray-900 mb-4 flex items-center justify-between">
				<span>Active Members</span>
				<span class="text-xs font-normal text-gray-500">{teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}</span>
			</h3>

			<div class="divide-y divide-gray-100">
				{#each teamMembers as member}
					<div class="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
						<!-- User Identity -->
						<div class="flex items-center gap-3">
							{#if member.profile_image}
								<img src={member.profile_image} alt="" class="w-10 h-10 rounded-full object-cover border border-gray-200" />
							{:else}
								<div class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
									{member.name.charAt(0)}
								</div>
							{/if}
							<div>
								<div class="flex items-center gap-2">
									<span class="font-semibold text-gray-900 text-sm">{member.name}</span>
									{#if member.user_id === currentUserId}
										<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">You</span>
									{/if}
									{#if member.role === 'owner'}
										<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">Owner</span>
									{:else if member.role === 'admin'}
										<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Admin</span>
									{:else}
										<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Member</span>
									{/if}
								</div>
								<div class="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
									<span>{member.email}</span>
									<span>•</span>
									<a
										href="/u/{member.slug}"
										target="_blank"
										class="text-blue-600 hover:underline"
									>
										/u/{member.slug}
									</a>
								</div>
							</div>
						</div>

						<!-- Badges & Actions -->
						<div class="flex items-center gap-3 self-end sm:self-auto">
							<!-- Calendar Connection Status -->
							<div class="flex items-center gap-1.5">
								<span
									title={member.google_connected ? 'Google Calendar connected' : 'Google Calendar not connected'}
									class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium {member.google_connected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-400 border border-gray-200'}"
								>
									Google {member.google_connected ? '✓' : '—'}
								</span>
								<span
									title={member.outlook_connected ? 'Outlook Calendar connected' : 'Outlook Calendar not connected'}
									class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium {member.outlook_connected ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-gray-50 text-gray-400 border border-gray-200'}"
								>
									Outlook {member.outlook_connected ? '✓' : '—'}
								</span>
							</div>

							<!-- Role change & Remove actions -->
							{#if canManage && member.role !== 'owner' && member.user_id !== currentUserId}
								<div class="flex items-center gap-1.5 ml-2">
									{#if member.role === 'member'}
										<button
											type="button"
											onclick={() => changeRole(member.user_id, 'admin')}
											class="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition font-medium"
										>
											Make Admin
										</button>
									{:else if member.role === 'admin'}
										<button
											type="button"
											onclick={() => changeRole(member.user_id, 'member')}
											class="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition font-medium"
										>
											Make Member
										</button>
									{/if}

									<button
										type="button"
										onclick={() => removeMember(member.user_id, member.name)}
										class="p-1 text-gray-400 hover:text-red-600 rounded transition"
										title="Remove member"
										aria-label="Remove member"
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
										</svg>
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Pending Invitations -->
		{#if pendingInvitations.length > 0}
			<div class="mt-8 pt-6 border-t border-gray-200">
				<h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
					<span>Pending Invitations</span>
					<span class="text-xs text-gray-500">{pendingInvitations.length} pending</span>
				</h3>
				<div class="divide-y divide-gray-100">
					{#each pendingInvitations as invitation}
						<div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900">{invitation.email}</span>
									<span class="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 capitalize">
										{invitation.role}
									</span>
								</div>
								<span class="text-xs text-gray-500">Expires on {new Date(invitation.expires_at).toLocaleDateString()}</span>
							</div>

							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => copyInviteLink(invitation.token)}
									class="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition"
								>
									{copiedToken === invitation.token ? 'Link Copied!' : 'Copy Login URL'}
								</button>
								{#if canManage}
									<button
										type="button"
										onclick={() => cancelInvitation(invitation.id)}
										class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition"
									>
										Revoke
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Invite Member Modal -->
{#if showInviteModal}
	<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
		<div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-bold text-gray-900">Invite Team Member</h3>
				<button
					type="button"
					onclick={() => showInviteModal = false}
					class="text-gray-400 hover:text-gray-600 text-lg leading-none"
				>
					✕
				</button>
			</div>

			<p class="text-xs text-gray-600">
				Invite a colleague to join <strong>{organization?.organization_name}</strong>. Once invited, they can log in via Google OAuth with this email address.
			</p>

			{#if inviteError}
				<div class="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
					{inviteError}
				</div>
			{/if}

			<form onsubmit={handleInvite} class="space-y-4">
				<div>
					<label for="invite-email" class="block text-xs font-semibold text-gray-700 mb-1">Email Address *</label>
					<input
						type="email"
						id="invite-email"
						bind:value={inviteEmail}
						required
						placeholder="colleague@example.com"
						class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
					/>
				</div>

				<div>
					<label for="invite-role" class="block text-xs font-semibold text-gray-700 mb-1">Organization Role</label>
					<select
						id="invite-role"
						bind:value={inviteRole}
						class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
					>
						<option value="member">Member (Can manage own calendar & availability)</option>
						<option value="admin">Admin (Can manage team bookings & invite colleagues)</option>
					</select>
				</div>

				<div class="flex items-center justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => showInviteModal = false}
						class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={inviteSubmitting}
						class="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
					>
						{inviteSubmitting ? 'Inviting...' : 'Send Invitation'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
