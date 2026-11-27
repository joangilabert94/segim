import { useEffect, useState } from 'preact/hooks';
import type { Exercise, Routine, Session, Settings } from '../../models';
import { getState, replaceAll, subscribe } from '../../state';
import { isCloudConfigured } from './config';
import { cloudClient } from './client';
import { diffEntities } from './mappers';
import {
  cloudDeleteExercises,
  cloudDeleteRoutines,
  cloudDeleteSessions,
  cloudPull,
  cloudPushAll,
  cloudPushExercises,
  cloudPushRoutine,
  cloudPushSession,
  cloudPushSettings,
  subscribeRemoteChanges,
} from './sync';

export type CloudPhase = 'off' | 'loading' | 'signed-out' | 'choice' | 'ready' | 'error';

export interface CloudStatus {
  phase: CloudPhase;
  email?: string;
  lastSyncAt?: string;
  message?: string;
  busy: boolean;
}

let status: CloudStatus = { phase: 'off', busy: false };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<CloudStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn());
}

export function subscribeCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useCloud(): CloudStatus {
  const [, setTick] = useState(0);
  useEffect(() => subscribeCloud(() => setTick((tick) => tick + 1)), []);
  return status;
}

interface Snapshot {
  routines: Map<string, string>;
  sessions: Map<string, string>;
  exercises: Map<string, string>;
  settings: string;
}

interface LocalData {
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}

const emptySnapshot = (): Snapshot => ({
  routines: new Map(),
  sessions: new Map(),
  exercises: new Map(),
  settings: '',
});

function snapshot(data: LocalData): Snapshot {
  return {
    routines: new Map(data.routines.map((item) => [item.id, JSON.stringify(item)])),
    sessions: new Map(data.sessions.map((item) => [item.id, JSON.stringify(item)])),
    exercises: new Map(data.exercises.map((item) => [item.id, JSON.stringify(item)])),
    settings: JSON.stringify(data.settings),
  };
}

let userId: string | null = null;
let pushed: Snapshot = emptySnapshot();
let unsubscribeStore: (() => void) | null = null;
let unsubscribeRemote: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pullTimer: ReturnType<typeof setTimeout> | null = null;
let suppressPullUntil = 0;
let applying = false;
let syncing = false;
let dirty = false;
let pullDeferrals = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempts = 0;

const PUSH_DELAY_MS = 800;
const PUSH_RETRY_DELAY_MS = 5_000;
const PULL_DELAY_MS = 600;
const PULL_RETRY_DELAY_MS = 800;
const MAX_PULL_DEFERRALS = 30;
const PUSH_AUTO_RETRY_BASE_MS = 5_000;
const PUSH_AUTO_RETRY_MAX_MS = 60_000;
const PUSH_AUTO_MAX_ATTEMPTS = 20; // ~ con backoff, varios minutos de reintentos en segundo plano

// Marca de que ESTE dispositivo ya resolvió la reconciliación inicial con la cuenta.
// Sin ella, attach() vería "los dos lados tienen datos" en cada recarga (y los dos lados
// tienen datos siempre, desde el primer sync) y preguntaría en cada arranque, dejando la
// fase en 'choice' y la sincronización automática muerta hasta pulsar el botón a mano.
const linkedKey = (userId: string) => `segim-cloud-linked:${userId}`;

function isLinked(userId: string): boolean {
  try {
    return localStorage.getItem(linkedKey(userId)) === '1';
  } catch {
    return false;
  }
}

function markLinked(userId: string): void {
  try {
    localStorage.setItem(linkedKey(userId), '1');
  } catch {
    // sin almacenamiento (modo privado): se preguntará en cada arranque, como antes
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'No se pudo hablar con la nube.';
}

function hasData(data: { routines: unknown[]; sessions: unknown[]; exercises: unknown[] }): boolean {
  return data.routines.length > 0 || data.sessions.length > 0 || data.exercises.length > 0;
}

function localData(): LocalData {
  const s = getState();
  return { routines: s.routines, exercises: s.exercises, sessions: s.sessions, settings: s.settings };
}

// La nube no guarda paletas: las de este dispositivo sobreviven a cualquier aplicación
// de ajustes remotos (pull, conexión inicial, elección de lado en el conflicto).
function withLocalPalettes(remote: Settings | null, local: Settings): Settings {
  if (!remote) return local;
  return { ...remote, lightPalette: local.lightPalette, darkPalette: local.darkPalette };
}

function sameMap(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

/**
 * ¿Hay cambios locales pendientes de subir? Si los hay, un pull ahora los
 * sobrescribiría sin remedio: primero debe ir el push.
 */
function hasUnpushedChanges(): boolean {
  const current = snapshot(localData());
  return (
    !sameMap(current.routines, pushed.routines) ||
    !sameMap(current.sessions, pushed.sessions) ||
    !sameMap(current.exercises, pushed.exercises) ||
    current.settings !== pushed.settings
  );
}

/**
 * Sube TODO lo local sobrescribiendo filas remotas del mismo id, pero SIN borrar nada:
 * a diferencia de cloudPushAll, no poda. Es seguro usarlo en cada arranque aunque la
 * nube tenga cosas que este dispositivo no conoce todavía.
 */
async function cloudUpsertAllNoPrune(data: LocalData, uid: string): Promise<void> {
  await cloudPushExercises(data.exercises, uid);
  for (const routine of data.routines) await cloudPushRoutine(routine, uid);
  for (const session of data.sessions) await cloudPushSession(session, uid);
  await cloudPushSettings(data.settings, uid);
}

/**
 * Ya vinculado: no hay conflicto que preguntar. Primero se sube lo local (prevalece id a
 * id, sin borrar nada) y luego se aplica lo remoto resultante encima (así sobreviven las
 * filas de otros dispositivos y lo subido hace un momento).
 */
async function reconcileLinked(uid: string, local: LocalData): Promise<void> {
  await cloudUpsertAllNoPrune(local, uid);
  const remote = await cloudPull();
  applying = true;
  try {
    replaceAll({
      routines: remote.routines,
      exercises: remote.exercises,
      sessions: remote.sessions,
      settings: withLocalPalettes(remote.settings, local.settings),
    });
  } finally {
    applying = false;
  }
  pushed = snapshot(localData());
}

function startListeners(): void {
  if (!unsubscribeStore) unsubscribeStore = subscribe(onLocalChange);
  if (!unsubscribeRemote) unsubscribeRemote = subscribeRemoteChanges(onRemoteChange);
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempts = 0;
}

// Tras un fallo, se reintenta solo (con backoff): un corte de red ya no deja la nube
// desactualizada hasta que el usuario vuelva a tocar algo o pulse «Subir ahora».
function scheduleRetry(): void {
  if (retryAttempts >= PUSH_AUTO_MAX_ATTEMPTS) return;
  if (retryTimer) clearTimeout(retryTimer);
  const delay = Math.min(PUSH_AUTO_RETRY_BASE_MS * 2 ** retryAttempts, PUSH_AUTO_RETRY_MAX_MS);
  retryAttempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncUp();
  }, delay);
}

function stopListeners(): void {
  if (pushTimer) clearTimeout(pushTimer);
  if (pullTimer) clearTimeout(pullTimer);
  pushTimer = null;
  pullTimer = null;
  pullDeferrals = 0;
  clearRetry();
  unsubscribeStore?.();
  unsubscribeRemote?.();
  unsubscribeStore = null;
  unsubscribeRemote = null;
}

function onLocalChange(): void {
  // Los cambios que llegan de la nube no se devuelven a la nube.
  if (applying) return;
  // En 'error' se reintenta igualmente: si no, un fallo transitorio dejaría la
  // nube desconectada para el resto de la sesión.
  if (status.phase !== 'ready' && status.phase !== 'error') return;
  if (pushTimer) clearTimeout(pushTimer);
  const delay = status.phase === 'error' ? PUSH_RETRY_DELAY_MS : PUSH_DELAY_MS;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void syncUp();
  }, delay);
}

function onRemoteChange(): void {
  // En 'error' una señal de que la red vive: reintentar la subida (nunca aplicar
  // la nube encima de cambios locales sin subir). En 'choice' el usuario aún no ha
  // elegido y un pull pisaría el lado local sin permiso.
  if (status.phase === 'error') {
    onLocalChange();
    return;
  }
  if (status.phase !== 'ready') return;
  // Los eventos que provocan nuestras propias subidas llegan unos segundos después:
  // no se descartan, se aplaza el pull a que termine la ventana de supresión.
  const wait = Math.max(0, suppressPullUntil - Date.now());
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(
    () => {
      pullTimer = null;
      void pullDown();
    },
    wait > 0 ? wait + 100 : PULL_DELAY_MS,
  );
}

async function syncUp(): Promise<void> {
  const current = userId;
  if (!current || (status.phase !== 'ready' && status.phase !== 'error')) return;
  if (syncing) {
    dirty = true;
    return;
  }
  syncing = true;
  try {
    const data = localData();
    const routinesDiff = diffEntities(pushed.routines, data.routines, (r) => r.id);
    const sessionsDiff = diffEntities(pushed.sessions, data.sessions, (s) => s.id);
    const exercisesDiff = diffEntities(pushed.exercises, data.exercises, (e) => e.id);

    if (routinesDiff.added.length + routinesDiff.changed.length > 0
      || sessionsDiff.added.length + sessionsDiff.changed.length > 0
      || exercisesDiff.added.length + exercisesDiff.changed.length > 0
      || exercisesDiff.removed.length + routinesDiff.removed.length + sessionsDiff.removed.length > 0
      || JSON.stringify(data.settings) !== pushed.settings) {
      suppressPullUntil = Date.now() + 3_000;
    }

    await cloudPushExercises([...exercisesDiff.added, ...exercisesDiff.changed], current);
    // Las borradas van después de subir las que quedan: si no, el vínculo se perdería.
    await cloudDeleteExercises(exercisesDiff.removed, current);

    // Rutinas y sesiones no se referencian entre sí en el esquema: se suben en paralelo.
    const pushes = [
      ...[...routinesDiff.added, ...routinesDiff.changed].map((routine) =>
        cloudPushRoutine(routine, current),
      ),
      ...[...sessionsDiff.added, ...sessionsDiff.changed].map((session) =>
        cloudPushSession(session, current),
      ),
    ];
    const results = await Promise.allSettled(pushes);
    const failure = results.find((r) => r.status === 'rejected');
    if (failure && failure.status === 'rejected') throw failure.reason;
    await cloudDeleteRoutines(routinesDiff.removed, current);
    await cloudDeleteSessions(sessionsDiff.removed, current);

    if (JSON.stringify(data.settings) !== pushed.settings) {
      await cloudPushSettings(data.settings, current);
    }

    pushed = snapshot(data);
    clearRetry();
    startListeners();
    setStatus({ lastSyncAt: new Date().toISOString(), message: undefined, phase: 'ready' });
  } catch (err) {
    setStatus({ phase: 'error', busy: false, message: messageOf(err) });
    scheduleRetry();
  } finally {
    syncing = false;
    if (dirty) {
      dirty = false;
      onLocalChange();
    }
  }
}

async function pullDown(): Promise<void> {
  const current = userId;
  if (!current) return;
  // Primero el push: si hay cambios locales sin subir o uno en curso, aplicar la
  // nube ahora los destruiría sin remedio. Se aplaza el pull (acotado) y el push
  // los sube; después el pull ya encuentra la nube al día.
  if (syncing || pushTimer !== null || hasUnpushedChanges()) {
    if (pullDeferrals < MAX_PULL_DEFERRALS) {
      pullDeferrals += 1;
      if (pullTimer) clearTimeout(pullTimer);
      pullTimer = setTimeout(() => {
        pullTimer = null;
        void pullDown();
      }, PULL_RETRY_DELAY_MS);
    }
    return;
  }
  pullDeferrals = 0;
  try {
    const remote = await cloudPull();
    const local = localData();

    // Nunca vaciar el dispositivo porque la nube esté vacía: se rellena la nube.
    if (!hasData(remote) && hasData(local)) {
      await cloudPushAll(local, current);
      pushed = snapshot(local);
      setStatus({ phase: 'ready', busy: false, lastSyncAt: new Date().toISOString() });
      return;
    }

    applying = true;
    try {
      replaceAll({
        routines: remote.routines,
        exercises: remote.exercises,
        sessions: remote.sessions,
        // Sin fila de ajustes en la nube se conservan los locales (unidad, peso
        // corporal, presets…), nunca se pisan con los valores por defecto.
        settings: withLocalPalettes(remote.settings, local.settings),
      });
    } finally {
      applying = false;
    }
    pushed = snapshot(localData());
    setStatus({ phase: 'ready', busy: false, lastSyncAt: new Date().toISOString() });
  } catch (err) {
    setStatus({ phase: 'error', busy: false, message: messageOf(err) });
  }
}

async function attach(uid: string, email: string | undefined, remoteData?: Awaited<ReturnType<typeof cloudPull>>): Promise<void> {
  userId = uid;
  setStatus({ phase: 'loading', busy: true, email, message: undefined });
  const remote = remoteData ?? (await cloudPull());
  const local = localData();
  const remoteHasData = hasData(remote);
  const localHasData = hasData(local);

  if (remoteHasData && localHasData) {
    // Ya vinculado en este dispositivo: reconciliar en silencio (sin tocar nada de la
    // nube que este dispositivo no conozca) en lugar de preguntar en cada arranque.
    if (isLinked(uid)) {
      await reconcileLinked(uid, local);
      startListeners();
      markLinked(uid);
      setStatus({ phase: 'ready', busy: false, lastSyncAt: new Date().toISOString() });
      return;
    }
    // Dos orígenes con datos por primera vez: no se pisa ninguno sin que el usuario elija.
    setStatus({ phase: 'choice', busy: false });
    return;
  }

  if (remoteHasData) {
    applying = true;
    try {
      replaceAll({
        routines: remote.routines,
        exercises: remote.exercises,
        sessions: remote.sessions,
        settings: withLocalPalettes(remote.settings, local.settings),
      });
    } finally {
      applying = false;
    }
    pushed = snapshot(localData());
  } else {
    if (localHasData) await cloudPushAll(local, uid);
    await cloudPushSettings(local.settings, uid);
    pushed = snapshot(local);
  }

  startListeners();
  markLinked(uid);
  setStatus({ phase: 'ready', busy: false, lastSyncAt: new Date().toISOString() });
}

/** Se llama al arrancar la app: retoma la sesión guardada, si la hay. */
export async function startCloud(): Promise<void> {
  if (!isCloudConfigured()) {
    setStatus({ phase: 'off', busy: false });
    return;
  }
  setStatus({ phase: 'loading', busy: true, message: undefined });
  try {
    const { data } = await cloudClient().auth.getSession();
    if (!data.session) {
      setStatus({ phase: 'signed-out', busy: false, email: undefined });
      return;
    }
    await attach(data.session.user.id, data.session.user.email ?? undefined);
  } catch (err) {
    setStatus({ phase: 'error', busy: false, message: messageOf(err) });
    scheduleRetry();
  }
}

function authError(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (lower.includes('email not confirmed')) return 'Confirma tu correo antes de entrar.';
  if (lower.includes('already registered')) return 'Ese correo ya tiene una cuenta.';
  if (lower.includes('password should be')) return 'La contraseña necesita al menos 6 caracteres.';
  if (lower.includes('unable to validate email')) return 'Ese correo no parece válido.';
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Demasiados intentos. Espera un momento.';
  }
  return text;
}

export async function cloudSignIn(email: string, password: string): Promise<void> {
  setStatus({ busy: true, message: undefined });
  try {
    const { data, error } = await cloudClient().auth.signInWithPassword({ email, password });
    if (error) {
      setStatus({ phase: 'signed-out', busy: false, message: authError(error.message) });
      return;
    }
    await attach(data.user.id, data.user.email ?? undefined);
  } catch (err) {
    setStatus({ phase: 'signed-out', busy: false, message: messageOf(err) });
  }
}

export async function cloudSignUp(email: string, password: string): Promise<void> {
  setStatus({ busy: true, message: undefined });
  try {
    const { data, error } = await cloudClient().auth.signUp({ email, password });
    if (error) {
      setStatus({ phase: 'signed-out', busy: false, message: authError(error.message) });
      return;
    }
    if (!data.session) {
      setStatus({
        phase: 'signed-out',
        busy: false,
        message: 'Cuenta creada. Confirma el correo que te hemos enviado y vuelve a entrar.',
      });
      return;
    }
    await attach(data.user!.id, data.user!.email ?? undefined);
  } catch (err) {
    setStatus({ phase: 'signed-out', busy: false, message: messageOf(err) });
  }
}

export async function cloudSignOut(): Promise<void> {
  stopListeners();
  userId = null;
  pushed = emptySnapshot();
  try {
    await cloudClient().auth.signOut();
  } catch {
    // Si no hay red, la sesión local se descarta igualmente.
  }
  setStatus({ phase: 'signed-out', busy: false, email: undefined, lastSyncAt: undefined });
}

/** Sin datos en ninguno de los dos lados deja de haber conflicto. */
export async function resolveCloudChoice(choice: 'cloud' | 'local'): Promise<void> {
  const current = userId;
  if (!current) return;
  setStatus({ busy: true, message: undefined });
  try {
    if (choice === 'local') {
      const local = localData();
      await cloudPushAll(local, current);
      pushed = snapshot(local);
    } else {
      const remote = await cloudPull();
      const local = localData();
      applying = true;
      try {
        replaceAll({
          routines: remote.routines,
          exercises: remote.exercises,
          sessions: remote.sessions,
          settings: withLocalPalettes(remote.settings, local.settings),
        });
      } finally {
        applying = false;
      }
      pushed = snapshot(localData());
    }
    startListeners();
    markLinked(current);
    setStatus({ phase: 'ready', busy: false, lastSyncAt: new Date().toISOString() });
  } catch (err) {
    setStatus({ phase: 'error', busy: false, message: messageOf(err) });
  }
}

/** «Subir ahora»: manda el estado de este dispositivo. */
export async function cloudSyncNow(): Promise<void> {
  const current = userId;
  if (!current) return;
  setStatus({ busy: true, message: undefined });
  try {
    const local = localData();
    suppressPullUntil = Date.now() + 3_000;
    await cloudPushAll(local, current);
    pushed = snapshot(local);
    setStatus({ phase: 'ready', busy: false, lastSyncAt: new Date().toISOString() });
  } catch (err) {
    setStatus({ phase: 'error', busy: false, message: messageOf(err) });
  }
}
