export type Locale = 'es' | 'en';

export interface BookingTranslations {
	selectDateTime: string;
	timeZone: string;
	selectTime: string;
	noAvailableTimes: string;
	next: string;
	enterDetails: string;
	name: string;
	namePlaceholder: string;
	email: string;
	phone: string;
	phonePlaceholder: string;
	optional: string;
	locked: string;
	notes: string;
	notesPlaceholder: string;
	scheduleEvent: string;
	scheduling: string;
	back: string;
	meetingWith: string;
	confirmedTitle: string;
	confirmedSubtitle: string;
	joinMeeting: string;
	openCalendar: string;
	mins: string;
	googleMeet: string;
	teams: string;
	inPerson: string;
	days: string[];
	months: string[];
}

export const translations: Record<Locale, BookingTranslations> = {
	es: {
		selectDateTime: 'Selecciona Fecha y Hora',
		timeZone: 'Zona horaria',
		selectTime: 'Selecciona un Horario',
		noAvailableTimes: 'No hay horarios disponibles para esta fecha',
		next: 'Continuar',
		enterDetails: 'Ingresa tus Datos',
		name: 'Nombre Completo',
		namePlaceholder: 'Ej. Roberto González',
		email: 'Correo Electrónico',
		phone: 'Teléfono Móvil',
		phonePlaceholder: '+52 (81) 0000-0000',
		optional: 'opcional',
		locked: 'fijo',
		notes: 'Comentarios o temas a revisar',
		notesPlaceholder: '¿Hay algún tema o duda puntual de tu cotización o propiedad?',
		scheduleEvent: 'Confirmar Cita',
		scheduling: 'Confirmando cita...',
		back: 'Atrás',
		meetingWith: 'Reunión con',
		confirmedTitle: '¡Reunión Agendada!',
		confirmedSubtitle: 'Hemos enviado la invitación con el enlace de Google Meet a tu correo.',
		joinMeeting: 'Entrar a Google Meet',
		openCalendar: 'Ver en Google Calendar',
		mins: 'min',
		googleMeet: 'Google Meet',
		teams: 'Microsoft Teams',
		inPerson: 'Reunión Presencial',
		days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
		months: [
			'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
			'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
		]
	},
	en: {
		selectDateTime: 'Select a Date & Time',
		timeZone: 'Time zone',
		selectTime: 'Select a Time',
		noAvailableTimes: 'No available times for this date',
		next: 'Next',
		enterDetails: 'Enter Details',
		name: 'Full Name',
		namePlaceholder: 'e.g. John Doe',
		email: 'Email Address',
		phone: 'Phone Number',
		phonePlaceholder: '+1 (555) 000-0000',
		optional: 'optional',
		locked: 'locked',
		notes: 'Additional notes',
		notesPlaceholder: 'Share any details or questions for our meeting',
		scheduleEvent: 'Schedule Meeting',
		scheduling: 'Scheduling...',
		back: 'Back',
		meetingWith: 'Meeting with',
		confirmedTitle: 'Meeting Confirmed!',
		confirmedSubtitle: 'A calendar invitation with Google Meet has been sent to your email.',
		joinMeeting: 'Join Google Meet',
		openCalendar: 'Open Google Calendar',
		mins: 'min',
		googleMeet: 'Google Meet',
		teams: 'Microsoft Teams',
		inPerson: 'In-Person Meeting',
		days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
		months: [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
		]
	}
};
