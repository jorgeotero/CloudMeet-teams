<script lang="ts">
	import { formatSelectedDate } from '$lib/utils/dateFormatters';

	interface TimeSlot {
		start: string;
		end: string;
	}

	interface Props {
		selectedDate: string;
		availableSlots: TimeSlot[];
		selectedSlot: TimeSlot | null;
		loading: boolean;
		brandColor: string;
		locale?: 'es' | 'en';
		formatTime: (isoStr: string) => string;
		onSelectSlot: (slot: TimeSlot) => void;
		onConfirm: () => void;
	}

	let {
		selectedDate,
		availableSlots,
		selectedSlot,
		loading,
		brandColor,
		locale = 'es',
		formatTime,
		onSelectSlot,
		onConfirm
	}: Props = $props();

	function getDayHeader(dateStr: string) {
		const date = new Date(dateStr + 'T12:00:00');
		return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
			weekday: 'long',
			day: 'numeric',
			month: 'short'
		}).format(date);
	}
</script>

<div class="w-52 ml-6 border-l border-slate-200/80 pl-6 flex flex-col" style="max-height: 400px;">
	<h3 class="text-xs uppercase tracking-wider font-bold text-slate-500 mb-4 flex-shrink-0">
		{getDayHeader(selectedDate)}
	</h3>

	{#if loading}
		<div class="flex items-center justify-center py-8">
			<div class="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style="border-color: {brandColor}; border-top-color: transparent"></div>
		</div>
	{:else if availableSlots.length === 0}
		<p class="text-xs text-slate-400 py-4 italic">{locale === 'es' ? 'Sin horarios disponibles' : 'No available times'}</p>
	{:else}
		<div class="space-y-2 overflow-y-auto flex-1 pr-2 pb-2 scrollbar-thin">
			{#each availableSlots as slot}
				{#if selectedSlot === slot}
					<div class="flex gap-2">
						<button type="button" class="flex-1 py-2 px-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs">
							{formatTime(slot.start)}
						</button>
						<button
							type="button"
							onclick={onConfirm}
							class="flex-1 py-2 px-2.5 text-white rounded-xl text-xs font-bold transition shadow-xs hover:opacity-95"
							style="background-color: {brandColor}"
						>
							{locale === 'es' ? 'Siguiente' : 'Next'}
						</button>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => onSelectSlot(slot)}
						class="w-full py-2 px-3 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-800 rounded-xl text-xs font-bold transition shadow-2xs"
					>
						{formatTime(slot.start)}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
