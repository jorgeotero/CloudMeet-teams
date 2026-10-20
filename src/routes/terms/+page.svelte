<script lang="ts">
</script>

<svelte:head>
	<title>Terms of Service | CloudMeet Teams</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-xl shadow-sm border border-gray-200">
		<a href="/" class="text-blue-600 hover:underline text-sm mb-6 inline-block">&larr; Back to Home</a>
		
		<h1 class="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
		<p class="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

		<div class="prose max-w-none text-gray-700 space-y-6">
			<section>
				<h2 class="text-xl font-semibold text-gray-900 mb-2">1. Terms Acceptance</h2>
				<p>
					By deploying, accessing, or using <strong>CloudMeet Teams</strong>, you agree to these terms. CloudMeet Teams is open-source software distributed under the MIT License.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-gray-900 mb-2">2. Service Description</h2>
				<p>
					CloudMeet Teams provides multi-tenant team scheduling, meeting room conflict management, and calendar synchronization with Google Calendar and Microsoft Outlook.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-gray-900 mb-2">3. Calendar Integration</h2>
				<p>
					The software uses authorized OAuth access to sync calendar events. Users maintain control over their permissions and can disconnect calendar accounts at any time.
				</p>
			</section>
		</div>
	</div>
</div>
