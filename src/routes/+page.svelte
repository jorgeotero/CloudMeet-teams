<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>CloudMeet Teams | Self-Hosted Multi-Tenant & Team Scheduling on Cloudflare</title>
	<meta
		name="description"
		content="Open-source multi-tenant & team scheduling extension for CloudMeet running on Cloudflare Pages, D1, and KV. Seamless calendar synchronization with zero double-bookings."
	/>
</svelte:head>

<div class="min-h-screen bg-slate-50 flex flex-col justify-between text-gray-800">
	<!-- Navbar -->
	<header class="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
			<a href="/" class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
					<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
						<line x1="16" y1="2" x2="16" y2="6"></line>
						<line x1="8" y1="2" x2="8" y2="6"></line>
						<line x1="3" y1="10" x2="21" y2="10"></line>
					</svg>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-xl font-bold tracking-tight text-gray-900">CloudMeet</span>
					<span class="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Teams</span>
				</div>
			</a>

			<div class="flex items-center gap-4">
				<a href="https://github.com/jorgeotero/CloudMeet-teams" target="_blank" rel="noopener noreferrer" class="hidden sm:inline-block text-sm text-gray-600 hover:text-blue-600 transition font-medium">
					GitHub Repo &rarr;
				</a>
				{#if data.isAuthenticated}
					<a
						href="/dashboard"
						class="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
					>
						<span>Go to Dashboard</span>
						<svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
						</svg>
					</a>
				{:else}
					<a
						href="/auth/login"
						class="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
					>
						Sign In with Google
					</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-1">
		<!-- Hero Section -->
		<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 text-center">
			<div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs sm:text-sm font-semibold mb-6 shadow-sm">
				<span>⚡ Multi-Tenant & Team Scheduling Platform on Cloudflare</span>
			</div>

			<h1 class="text-4xl sm:text-6xl font-extrabold text-gray-900 tracking-tight max-w-4xl mx-auto leading-tight sm:leading-none mb-6">
				Effortless Team Scheduling <span class="text-blue-600">Built for the Edge</span>
			</h1>

			<p class="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
				An open-source Calendly and Cal.com alternative running 100% on Cloudflare Pages, D1, and KV. Multi-user organizations, team booking links, offline meeting rooms, and real-time calendar synchronization with zero double-bookings.
			</p>

			<div class="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
				{#if data.isAuthenticated}
					<a
						href="/dashboard"
						class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-base font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5"
					>
						<span>Open Dashboard</span>
						<svg class="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
						</svg>
					</a>
				{:else}
					<a
						href="/auth/login"
						class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-base font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5"
					>
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"/>
						</svg>
						Sign In with Google
					</a>
				{/if}
				<a
					href="https://github.com/jorgeotero/CloudMeet-teams"
					target="_blank"
					rel="noopener noreferrer"
					class="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 text-base font-semibold rounded-xl text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-sm transition"
				>
					View on GitHub
				</a>
			</div>
		</section>

		<!-- Features Grid -->
		<section class="bg-white border-y border-gray-200 py-16">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="text-center max-w-3xl mx-auto mb-12">
					<h2 class="text-3xl font-extrabold text-gray-900 tracking-tight mb-4">Enterprise Features on Cloudflare Free Tier</h2>
					<p class="text-gray-600 text-base sm:text-lg">
						Everything needed to orchestrate calendars for single users, departments, and multi-tenant organizations.
					</p>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
					<!-- Card 1 -->
					<div class="bg-slate-50 border border-gray-200 rounded-2xl p-8 hover:shadow-md transition">
						<div class="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center mb-6">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
						</div>
						<h3 class="text-xl font-bold text-gray-900 mb-2">Organizations & Team Links</h3>
						<p class="text-gray-600 text-sm leading-relaxed">
							Manage multiple team members under role-based organizations (Owner, Admin, Member). Individual links (<code>/u/member</code>) and organization-scoped links (<code>/org/company/member</code>).
						</p>
					</div>

					<!-- Card 2 -->
					<div class="bg-slate-50 border border-gray-200 rounded-2xl p-8 hover:shadow-md transition">
						<div class="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center mb-6">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
						</div>
						<h3 class="text-xl font-bold text-gray-900 mb-2">Real-Time Sync & Buffers</h3>
						<p class="text-gray-600 text-sm leading-relaxed">
							Bidirectional Google & Outlook Calendar sync. Intelligent availability checks with configurable before/after meeting buffer minutes and custom per-event availability overrides.
						</p>
					</div>

					<!-- Card 3 -->
					<div class="bg-slate-50 border border-gray-200 rounded-2xl p-8 hover:shadow-md transition">
						<div class="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center mb-6">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
							</svg>
						</div>
						<h3 class="text-xl font-bold text-gray-900 mb-2">Meeting Rooms & Webhooks</h3>
						<p class="text-gray-600 text-sm leading-relaxed">
							Prevent double-booking physical office rooms across different hosts. Integrate outbound HMAC-SHA256 signed webhooks to trigger actions in your CRM, Zapier, or API.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- How It Works Section -->
		<section class="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center max-w-3xl mx-auto mb-12">
				<h2 class="text-3xl font-extrabold text-gray-900 tracking-tight mb-4">How It Works</h2>
				<p class="text-gray-600 text-base">
					Three easy steps to deploy and manage automated team scheduling on Cloudflare.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
				<div class="text-center p-6">
					<div class="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4 shadow-md">
						1
					</div>
					<h4 class="text-lg font-bold text-gray-900 mb-2">Connect Your Calendar</h4>
					<p class="text-gray-600 text-sm">
						Log in with Google or Outlook to read availability and automatically insert scheduled meetings into your calendar.
					</p>
				</div>

				<div class="text-center p-6">
					<div class="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4 shadow-md">
						2
					</div>
					<h4 class="text-lg font-bold text-gray-900 mb-2">Share Booking Links</h4>
					<p class="text-gray-600 text-sm">
						Send your personal link or embed it into your app or website with <code>?embed=true</code> and postMessage communication.
					</p>
				</div>

				<div class="text-center p-6">
					<div class="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4 shadow-md">
						3
					</div>
					<h4 class="text-lg font-bold text-gray-900 mb-2">Get Booked & Automate</h4>
					<p class="text-gray-600 text-sm">
						Appointments are created with Google Meet or physical rooms, and HMAC webhooks notify your backend systems instantly.
					</p>
				</div>
			</div>
		</section>
	</main>

	<!-- Footer for Compliance & Open-Source Links -->
	<footer class="bg-white border-t border-gray-200 py-8 px-4 sm:px-6 lg:px-8">
		<div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600">
			<div class="flex items-center gap-2">
				<div class="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white">
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
						<line x1="16" y1="2" x2="16" y2="6"></line>
						<line x1="8" y1="2" x2="8" y2="6"></line>
						<line x1="3" y1="10" x2="21" y2="10"></line>
					</svg>
				</div>
				<span class="font-bold text-gray-900">CloudMeet Teams</span>
				<span>&copy; {new Date().getFullYear()} Open-Source Software.</span>
			</div>
			
			<div class="flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm">
				<a href="/privacy" class="hover:text-blue-700 underline transition">
					Privacy Policy
				</a>
				<a href="/terms" class="hover:text-blue-700 underline transition">
					Terms of Service
				</a>
				<a href="https://github.com/jorgeotero/CloudMeet-teams" target="_blank" rel="noopener noreferrer" class="hover:text-blue-700 underline transition">
					GitHub Repository
				</a>
			</div>
		</div>

		<!-- Mandatory Google API Limited Use Policy Disclosure -->
		<div class="max-w-7xl mx-auto mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center md:text-left">
			CloudMeet Teams' use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" class="underline hover:text-gray-600">Google API Services User Data Policy</a>, including the Limited Use requirements.
		</div>
	</footer>
</div>
