// Cliente mínimo de la API REST de Google Drive (v3).
//
// Sin SDK a propósito: son cinco operaciones y la app es una PWA de ~30 kB.
// Todo va con `fetch` y el token en la cabecera Authorization.
//
// Los errores se convierten en `DriveError` con categoría, para que la UI sepa
// si debe pedir token, reintentar más tarde o avisar de que no queda espacio.

export const BACKUP_FILE_NAME = 'segim-backup.json';
export const BACKUP_FOLDER_NAME = 'Segim';
/**
 * Nombre con el que la app (antes "GymRutinas") creó la copia. Se sigue
 * buscando al leer: si el navegador perdió la referencia al fichero, se
 * reutiliza el que ya está en Drive en vez de crear un duplicado.
 */
export const LEGACY_BACKUP_FILE_NAME = 'gymrutinas-backup.json';
/** Prefijo de las copias fechadas que se conservan (rotación de las últimas 10). */
export const DATED_COPY_PREFIX = 'copia-';

/**
 * Nombre de una copia fechada con hora local: `copia-2026-10-28-1842.json`.
 * Ancho fijo, así que ordenar por nombre equivale a ordenar por fecha.
 */
export function datedCopyName(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `${DATED_COPY_PREFIX}${ymd}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** Campos de Drive que nos hacen falta: id y fecha de modificación bastan. */
const FILE_FIELDS = 'id,name,modifiedTime,size';

export interface DriveFileMeta {
  id: string;
  name?: string;
  modifiedTime?: string;
  size?: string;
}

export type DriveErrorKind =
  | 'auth' // token caducado, permiso revocado o cancelado por el usuario
  | 'notFound' // la copia ya no existe en Drive
  | 'quota' // sin espacio en el Drive del usuario
  | 'network' // sin conexión
  | 'server' // error de Google: se puede reintentar
  | 'unknown';

export class DriveError extends Error {
  readonly kind: DriveErrorKind;
  /** Código HTTP (0 si no hubo respuesta: sin red o fallo del navegador). */
  readonly status: number;

  constructor(kind: DriveErrorKind, status: number, message: string) {
    super(message);
    this.name = 'DriveError';
    this.kind = kind;
    this.status = status;
  }
}

/** Traduce un error HTTP de Google a algo que la UI pueda enseñar en español. */
export function classifyError(
  status: number,
  reason = '',
): { kind: DriveErrorKind; message: string } {
  if (status === 401) {
    return {
      kind: 'auth',
      message: 'La sesión con Google ha caducado. Conecta de nuevo para seguir copiando.',
    };
  }
  if (status === 403) {
    if (reason === 'storageQuotaExceeded') {
      return { kind: 'quota', message: 'Tu Google Drive no tiene espacio libre.' };
    }
    return {
      kind: 'auth',
      message: 'Google ha denegado el permiso. Vuelve a conectar con Google Drive.',
    };
  }
  if (status === 404) {
    return { kind: 'notFound', message: 'La copia ya no está en tu Google Drive.' };
  }
  if (status === 429) {
    return {
      kind: 'server',
      message: 'Google ha limitado las peticiones. Inténtalo de nuevo en un rato.',
    };
  }
  if (status >= 500) {
    return {
      kind: 'server',
      message: 'Google Drive no responde ahora mismo. Inténtalo de nuevo en un rato.',
    };
  }
  return { kind: 'unknown', message: 'No se pudo hablar con Google Drive.' };
}

interface GoogleErrorBody {
  error?: { message?: string; errors?: { reason?: string }[] };
}

/** Lanza `DriveError` a partir de una respuesta fallida de Google. */
async function throwForResponse(res: Response): Promise<never> {
  let reason = '';
  try {
    const body = (await res.json()) as GoogleErrorBody;
    reason = body.error?.errors?.[0]?.reason ?? '';
  } catch {
    // Respuesta sin JSON: nos quedamos con el código HTTP.
  }
  const { kind, message } = classifyError(res.status, reason);
  throw new DriveError(kind, res.status, message);
}

async function request(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new DriveError(
      'network',
      0,
      'Sin conexión: no se ha podido hablar con Google Drive.',
    );
  }

  if (!res.ok) await throwForResponse(res);
  return res;
}

/**
 * Busca la copia de la app por nombre. Con el scope `drive.file` solo aparecen
 * los ficheros que ha creado esta app, así que no hay riesgo de tocar otro.
 */
export async function findBackupFile(token: string): Promise<DriveFileMeta | null> {
  const names = [BACKUP_FILE_NAME, LEGACY_BACKUP_FILE_NAME]
    .map((name) => `name = '${name}'`)
    .join(' or ');
  const q = encodeURIComponent(`(${names}) and trashed = false`);
  const url =
    `${API_BASE}/files?q=${q}&spaces=drive` +
    `&fields=files(${FILE_FIELDS})&orderBy=modifiedTime desc&pageSize=10`;
  const res = await request(token, url);
  const data = (await res.json()) as { files?: DriveFileMeta[] };
  return data.files?.[0] ?? null;
}

/** Metadatos del fichero: sirve para saber si cambió sin descargarlo. */
export async function getFileMeta(token: string, fileId: string): Promise<DriveFileMeta> {
  const res = await request(
    token,
    `${API_BASE}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
  );
  return (await res.json()) as DriveFileMeta;
}

export async function downloadBackupText(token: string, fileId: string): Promise<string> {
  const res = await request(token, `${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
  return res.text();
}

/**
 * Copias fechadas de la carpeta, de la más nueva a la más vieja (por nombre).
 * Solo mira las que empiezan por `copia-`, nunca el fichero "última copia".
 */
export async function listDatedCopies(
  token: string,
  folderId?: string,
): Promise<DriveFileMeta[]> {
  const conditions = [`name contains '${DATED_COPY_PREFIX}'`, 'trashed = false'];
  if (folderId) conditions.push(`'${folderId}' in parents`);
  const q = encodeURIComponent(conditions.join(' and '));
  const url =
    `${API_BASE}/files?q=${q}&spaces=drive` +
    `&fields=files(${FILE_FIELDS})&orderBy=name desc&pageSize=100`;
  const res = await request(token, url);
  const data = (await res.json()) as { files?: DriveFileMeta[] };
  return data.files ?? [];
}

export async function createFolder(token: string): Promise<DriveFileMeta> {
  const res = await request(token, `${API_BASE}/files?fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  return (await res.json()) as DriveFileMeta;
}

/** Cuerpo multipart/related: metadatos + JSON de la copia en una sola petición. */
export function buildMultipartBody(
  content: string,
  folderId?: string,
  name = BACKUP_FILE_NAME,
): { body: Blob; contentType: string } {
  // Frontera aleatoria: el contenido lleva JSON con llaves y comillas, así que
  // no puede contener una cadena con esta forma.
  const boundary = `segim-${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = { name, mimeType: 'application/json' };
  if (folderId) metadata.parents = [folderId];

  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n`,
      `--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

/** Crea un JSON nuevo con un nombre concreto (última copia o copia fechada). */
export async function createJsonFile(
  token: string,
  name: string,
  content: string,
  folderId?: string,
): Promise<DriveFileMeta> {
  const { body, contentType } = buildMultipartBody(content, folderId, name);
  const res = await request(
    token,
    `${UPLOAD_BASE}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
    { method: 'POST', headers: { 'Content-Type': contentType }, body },
  );
  return (await res.json()) as DriveFileMeta;
}

export async function createBackupFile(
  token: string,
  content: string,
  folderId?: string,
): Promise<DriveFileMeta> {
  return createJsonFile(token, BACKUP_FILE_NAME, content, folderId);
}

/** Sobrescribe el contenido. Drive conserva el historial de versiones. */
export async function updateBackupFile(
  token: string,
  fileId: string,
  content: string,
): Promise<DriveFileMeta> {
  const res = await request(
    token,
    `${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: content,
    },
  );
  return (await res.json()) as DriveFileMeta;
}

/**
 * Renombra un fichero o carpeta existente (PATCH de metadatos).
 * Se usa para alinear el nombre antiguo de la carpeta ("GymRutinas") con el
 * actual ("Segim") sin mover ni duplicar nada.
 */
export async function renameFile(
  token: string,
  fileId: string,
  name: string,
): Promise<DriveFileMeta> {
  const res = await request(
    token,
    `${API_BASE}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name }),
    },
  );
  return (await res.json()) as DriveFileMeta;
}

export interface DriveAccount {
  email?: string;
  displayName?: string;
}

/**
 * Cuenta de Google a la que se sube la copia, para mostrarla en Ajustes.
 * `about.get` admite también el scope `drive.file`, así que no hace falta
 * pedir ningún permiso nuevo para consultarla.
 */
export async function getDriveAccount(token: string): Promise<DriveAccount> {
  const res = await request(
    token,
    `${API_BASE}/about?fields=user(emailAddress,displayName)`,
  );
  const data = (await res.json()) as {
    user?: { emailAddress?: string; displayName?: string };
  };
  return { email: data.user?.emailAddress, displayName: data.user?.displayName };
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await request(token, `${API_BASE}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}
