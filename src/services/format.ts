const fmtDayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fmtMonthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const fmtWeekdayShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
// Dos decimales: hay discos de 1,25 kg y el peso no debe redondearse al mostrarse.
const fmtWeightText = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
// Sin separador de miles: en un input, parseNumber no sabría releer "1.234,5".
const fmtWeightPlain = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function fmtDate(iso: string): string {
  return fmtDayMonth.format(parseISODate(iso));
}

export function fmtDateLong(iso: string): string {
  const s = fmtLong.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${fmtDayMonth.format(date)}, ${fmtTime.format(date)}`;
}

export function fmtMonth(iso: string): string {
  const s = fmtMonthYear.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtWeekday(iso: string): string {
  const s = fmtWeekdayShort.format(parseISODate(iso));
  return s.replace('.', '');
}

export function fmtRelative(iso: string, from: string = todayISO()): string {
  const diff = daysBetween(iso, from);
  if (diff < 0) {
    const days = -diff;
    return days === 1 ? 'mañana' : `en ${days} días`;
  }
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff >= 5 && diff <= 9) return 'semana pasada';
  if (diff < 14) return `hace ${diff} días`;
  const weeks = Math.floor(diff / 7);
  return `hace ${weeks} semanas`;
}

export function fmtVolume(value: number, unit: string): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('es-ES')} ${unit}`;
}

export function fmtWeight(value: number): string {
  return fmtWeightText.format(value);
}

export function fmtWeightInput(value: number): string {
  return fmtWeightPlain.format(value);
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function greeting(hour: number = new Date().getHours()): string {
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface RepsValue {
  reps: number;
  repsMax?: number;
}

export function parseRepsRange(text: string): RepsValue | null {
  const t = text.trim().replace(/[–—]/g, '-');
  const parts = t.split('-');
  if (parts.length === 1) {
    const n = parseNumber(t);
    return n === null ? null : { reps: Math.max(0, Math.round(n)) };
  }
  if (parts.length !== 2) return null;
  const a = parseNumber(parts[0]);
  const b = parseNumber(parts[1]);
  if (a === null || b === null) return null;
  const lo = Math.max(0, Math.round(Math.min(a, b)));
  const hi = Math.max(0, Math.round(Math.max(a, b)));
  return hi > lo ? { reps: lo, repsMax: hi } : { reps: lo };
}

export function parseRepsFixed(text: string): number | null {
  const n = parseNumber(text);
  if (n === null || n < 0) return null;
  return Math.round(n);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function fmtReps(reps: number, repsMax?: number): string {
  return repsMax !== undefined && repsMax > reps ? `${reps}-${repsMax}` : String(reps);
}
