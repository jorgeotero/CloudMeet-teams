<script lang="ts">
	interface Props {
		bookingForm: {
			name: string;
			email: string;
			phone?: string;
			notes: string;
		};
		bookingStatus: 'idle' | 'submitting' | 'success' | 'error';
		bookingError: string;
		brandColor: string;
		brandDark: string;
		locale?: 'es' | 'en';
		lockPrefill?: boolean;
		onSubmit: (e: Event) => void;
	}

	let {
		bookingForm = $bindable(),
		bookingStatus,
		bookingError,
		brandColor,
		brandDark,
		locale = 'es',
		lockPrefill = false,
		onSubmit
	}: Props = $props();
</script>

<div class="max-w-md">
	<h2 class="text-lg font-bold text-slate-900 mb-5">{locale === 'es' ? 'Tus Datos de Contacto' : 'Enter Details'}</h2>

	{#if bookingError}
		<div class="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 mb-5 text-xs font-semibold">
			{bookingError}
		</div>
	{/if}

	<form onsubmit={onSubmit} class="space-y-4">
		<div>
			<label for="name" class="block text-xs font-bold text-slate-700 mb-1.5">
				{locale === 'es' ? 'Nombre Completo *' : 'Name *'}
				{#if lockPrefill && bookingForm.name}
					<span class="text-[10px] text-slate-400 font-normal ml-1">({locale === 'es' ? 'fijo' : 'locked'})</span>
				{/if}
			</label>
			<input
				type="text"
				id="name"
				bind:value={bookingForm.name}
				required
				readonly={lockPrefill && Boolean(bookingForm.name)}
				placeholder={locale === 'es' ? 'Ej. Juan Garza' : 'John Doe'}
				class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm transition {lockPrefill && bookingForm.name ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'text-slate-800'}"
			/>
		</div>
		<div>
			<label for="email" class="block text-xs font-bold text-slate-700 mb-1.5">
				{locale === 'es' ? 'Correo Electrónico *' : 'Email *'}
				{#if lockPrefill && bookingForm.email}
					<span class="text-[10px] text-slate-400 font-normal ml-1">({locale === 'es' ? 'fijo' : 'locked'})</span>
				{/if}
			</label>
			<input
				type="email"
				id="email"
				bind:value={bookingForm.email}
				required
				readonly={lockPrefill && Boolean(bookingForm.email)}
				placeholder="cliente@ejemplo.com"
				class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm transition {lockPrefill && bookingForm.email ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'text-slate-800'}"
			/>
		</div>
		<div>
			<label for="phone" class="block text-xs font-bold text-slate-700 mb-1.5">
				{locale === 'es' ? 'Teléfono Móvil' : 'Phone'} <span class="text-[10px] text-slate-400 font-normal">({locale === 'es' ? 'opcional' : 'optional'})</span>
				{#if lockPrefill && bookingForm.phone}
					<span class="text-[10px] text-slate-400 font-normal ml-1">({locale === 'es' ? 'fijo' : 'locked'})</span>
				{/if}
			</label>
			<input
				type="tel"
				id="phone"
				bind:value={bookingForm.phone}
				placeholder="+52 (81) 0000-0000"
				readonly={lockPrefill && Boolean(bookingForm.phone)}
				class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm transition {lockPrefill && bookingForm.phone ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'text-slate-800'}"
			/>
		</div>
		<div>
			<label for="notes" class="block text-xs font-bold text-slate-700 mb-1.5">
				{locale === 'es' ? 'Comentarios o temas a revisar' : 'Please share anything that will help prepare for our meeting.'}
			</label>
			<textarea
				id="notes"
				bind:value={bookingForm.notes}
				rows="3"
				placeholder={locale === 'es' ? '¿Hay algún tema o duda puntual de tu cotización o propiedad?' : 'Any specific questions or topics...'}
				class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none text-sm text-slate-800 transition"
			></textarea>
		</div>
		<button
			type="submit"
			disabled={bookingStatus === 'submitting'}
			class="w-full text-white py-3 px-6 rounded-xl font-bold text-sm transition shadow-xs disabled:opacity-50 cursor-pointer"
			style="background-color: {brandColor}"
			onmouseenter={(e) => e.currentTarget.style.backgroundColor = brandDark}
			onmouseleave={(e) => e.currentTarget.style.backgroundColor = brandColor}
		>
			{bookingStatus === 'submitting' ? (locale === 'es' ? 'Confirmando cita...' : 'Scheduling...') : (locale === 'es' ? 'Confirmar y Agendar Cita' : 'Schedule Event')}
		</button>
	</form>
</div>
