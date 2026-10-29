export const BACKUP_FILE_NAME = 'segim-backup.json';
export const BACKUP_FOLDER_NAME = 'Segim';
export const LEGACY_BACKUP_FOLDER_NAME = 'GymRutinas';
// Se sigue buscando: si se perdió la referencia, se reutiliza esa copia en vez de duplicarla.
export const LEGACY_BACKUP_FILE_NAME = 'gymrutinas-backup.json';
export const DATED_COPY_PREFIX = 'copia-';

// Ancho fijo: ordenar por nombre equivale a ordenar por fecha.
export function datedCopyName(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `${DATED_COPY_PREFIX}${ymd}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const FILE_FIELDS = 'id,name,modifiedTime,size,parents';

export interface DriveFileMeta {
  id: string;
  name?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
}

export type DriveErrorKind =
  | 'auth'
  | 'notFound'
  | 'quota'
  | 'network'
  | 'server'
  | 'unknown';

export class DriveError extends Error {
  readonly kind: DriveErrorKind;
  readonly status: number;

  constructor(kind: DriveErrorKind, status: number, message: string) {
    super(message);
    this.name = 'DriveError';
    this.kind = kind;
    this.status = status;
  }
}

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

// Con el scope `drive.file` solo aparecen los ficheros de esta app: buscar por nombre no toca otros.
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

export async function findBackupFolders(token: string): Promise<DriveFileMeta[]> {
  const names = [BACKUP_FOLDER_NAME, LEGACY_BACKUP_FOLDER_NAME]
    .map((name) => `name = '${name}'`)
    .join(' or ');
  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and (${names}) and trashed = false`,
  );
  const url =
    `${API_BASE}/files?q=${q}&spaces=drive` +
    `&fields=files(${FILE_FIELDS})&orderBy=createdTime&pageSize=10`;
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

export function buildMultipartBody(
  content: string,
  folderId?: string,
  name = BACKUP_FILE_NAME,
): { body: Blob; contentType: string } {
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

// `about.get` admite el scope `drive.file`: no hace falta pedir permisos nuevos.
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
