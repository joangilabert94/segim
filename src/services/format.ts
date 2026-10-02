// Utilidades de formato de fechas y números (es-ES).

const fmtDayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fmtMonthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const fmtWeekdayShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });

/** Fecha local de hoy en formato YYYY-MM-DD. */
export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convierte "YYYY-MM-DD" a Date a medianoche local. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Diferencia en días naturales: b - a. */
export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** "4 oct" */
export function fmtDate(iso: string): string {
  return fmtDayMonth.format(parseISODate(iso));
}

/** "lunes, 4 de octubre" */
export function fmtDateLong(iso: string): string {
  const s = fmtLong.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Octubre de 2026" — para agrupar el historial por mes. */
export function fmtMonth(iso: string): string {
  const s = fmtMonthYear.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "lun" */
export function fmtWeekday(iso: string): string {
  const s = fmtWeekdayShort.format(parseISODate(iso));
  return s.replace('.', '');
}

/** Fecha relativa: hoy / ayer / hace N días / hace N semanas / semana pasada. */
export function fmtRelative(iso: string, from: string = todayISO()): string {
  const diff = daysBetween(iso, from);
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff >= 5 && diff <= 9) return 'semana pasada';
  if (diff < 14) return `hace ${diff} días`;
  const weeks = Math.floor(diff / 7);
  return `hace ${weeks} semanas`;
}

/** Volumen con formato local: 12.340 kg */
export function fmtVolume(value: number, unit: string): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('es-ES')} ${unit}`;
}

/** Duración en segundos → "1:30" / "12:05" / "1:02:03" */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Saludo según la hora del día. */
export function greeting(hour: number = new Date().getHours()): string {
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Interpreta texto de input numérico aceptando coma decimal. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
