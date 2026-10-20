<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
</script>

<div class="flex items-center justify-center {className}">
	<a
		href="https://github.com/jorgeotero/CloudMeet-teams"
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-gray-100/80 transition group"
		title="CloudMeet Teams"
	>
		<span class="text-xs text-gray-400 group-hover:text-gray-600 transition">Powered by</span>
		<span class="text-xs font-semibold text-gray-700 group-hover:text-gray-900 transition">CloudMeet Teams</span>
	</a>
</div>
