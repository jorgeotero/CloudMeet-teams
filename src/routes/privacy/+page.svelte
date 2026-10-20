<script lang="ts">
</script>

<svelte:head>
	<title>Privacy Policy & Google API Disclosure | CloudMeet Teams</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-xl shadow-sm border border-gray-200">
		<a href="/" class="text-blue-600 hover:underline text-sm mb-6 inline-block">&larr; Back to Home</a>
		
		<h1 class="text-3xl font-bold text-gray-900 mb-2">Privacy Policy & Google API Disclosure</h1>
		<p class="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

		<div class="prose max-w-none text-gray-700 space-y-6">
			<section>
				<h2 class="text-xl font-semibold text-gray-900 mb-2">1. Overview</h2>
				<p>
					<strong>CloudMeet Teams</strong> is an open-source, self-hosted scheduling platform. When deployed on your own infrastructure or Cloudflare account, you retain complete ownership and sovereignty over all data.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-gray-900 mb-2">2. Information Handled</h2>
				<p>To provide calendar booking and scheduling services, the application accesses:</p>
				<ul class="list-disc pl-6 space-y-1">
					<li><strong>Google Account Profile:</strong> Name, email address, and profile picture for authentication.</li>
					<li><strong>Calendar Data:</strong> Existing events to calculate busy slots and avoid double-booking, plus creation of new booked events.</li>
					<li><strong>Attendee Details:</strong> Name, email, phone number, and form responses submitted during booking.</li>
				</ul>
			</section>

			<section class="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
				<h2 class="text-xl font-semibold text-blue-900 mb-2">3. Google API Services User Data Policy Compliance</h2>
				<p class="mb-3">
					The application requests Google Calendar API permissions strictly to read availability and insert scheduled meetings.
				</p>
				<p class="font-medium text-blue-900 mb-2">Limited Use Requirements:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li><strong>No selling data:</strong> User data obtained from Google APIs is never sold to third parties or brokers.</li>
					<li><strong>No advertising:</strong> User data is never used for serving advertisements.</li>
					<li><strong>No AI/ML model training:</strong> User data is never used to train generalized artificial intelligence or machine learning models.</li>
					<li><strong>Strictly functional use:</strong> Data is only used to provide the user-facing scheduling features.</li>
				</ul>
				<p class="mt-4 text-sm font-semibold">
					CloudMeet Teams' use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" class="underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-gray-900 mb-2">4. Data Storage & Security</h2>
				<p>
					OAuth access and refresh tokens are stored securely in Cloudflare D1 with TLS encryption in transit. Tokens can be revoked anytime via <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Google Account Permissions</a>.
				</p>
			</section>
		</div>
	</div>
</div>
