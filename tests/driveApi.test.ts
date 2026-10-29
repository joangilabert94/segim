import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMultipartBody,
  classifyError,
  createBackupFile,
  createJsonFile,
  datedCopyName,
  downloadBackupText,
  DriveError,
  findBackupFile,
  listDatedCopies,
  renameFile,
  getDriveAccount,
  updateBackupFile,
} from '../src/services/drive/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sustituye `fetch` y captura la URL y la configuración de cada llamada. */
function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {}),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const callOf = (mock: ReturnType<typeof stubFetch>, index = 0) =>
  mock.mock.calls[index] as unknown as [string, RequestInit];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findBackupFile', () => {
  it('busca la copia por nombre y devuelve la más reciente', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ files: [{ id: 'f1', modifiedTime: '2026-10-28T10:00:00.000Z' }] }),
    );

    const file = await findBackupFile('tok');

    expect(file?.id).toBe('f1');
    const [url, init] = callOf(fetchMock);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("name = 'segim-backup.json'");
    // También el nombre anterior: si se perdió la referencia, se reutiliza la
    // copia que ya está en Drive en lugar de crear un duplicado.
    expect(decoded).toContain("name = 'gymrutinas-backup.json'");
    expect(decoded).toContain('trashed = false');
    expect(decoded).toContain('orderBy=modifiedTime desc');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('devuelve null si no hay ninguna copia', async () => {
    stubFetch(() => jsonResponse({ files: [] }));
    await expect(findBackupFile('tok')).resolves.toBeNull();
  });
});

describe('getDriveAccount', () => {
  it('consulta about.get con el correo de la cuenta', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        user: { emailAddress: 'me.joang+segim@gmail.com', displayName: 'Joan' },
      }),
    );

    const account = await getDriveAccount('tok');

    expect(account.email).toBe('me.joang+segim@gmail.com');
    expect(account.displayName).toBe('Joan');
    const [url, init] = callOf(fetchMock);
    // `fields` es obligatorio en about.get, y el scope drive.file basta.
    expect(decodeURIComponent(url)).toContain('/about?fields=user(emailAddress,displayName)');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('devuelve campos vacíos si Drive no trae usuario', async () => {
    stubFetch(() => jsonResponse({}));
    await expect(getDriveAccount('tok')).resolves.toEqual({
      email: undefined,
      displayName: undefined,
    });
  });
});

describe('subida', () => {
  it('crea el fichero con una petición multipart', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: 'nuevo' }));

    const file = await createBackupFile('tok', '{"app":"gymrutinas"}', 'carpeta-1');

    expect(file.id).toBe('nuevo');
    const [url, init] = callOf(fetchMock);
    expect(url).toContain('upload/drive/v3/files?uploadType=multipart');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toMatch(
      /^multipart\/related; boundary=segim-/,
    );
  });

  it('actualiza el contenido con una subida "media"', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: 'f1' }));

    await updateBackupFile('tok', 'f1', '{"exportedAt":"x"}');

    const [url, init] = callOf(fetchMock);
    expect(url).toContain('upload/drive/v3/files/f1?uploadType=media');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"exportedAt":"x"}');
  });

  it('el multipart incluye nombre, carpeta y el JSON de la copia', async () => {
    const { body, contentType } = buildMultipartBody('{"app":"gymrutinas"}', 'carpeta-9');
    const text = await body.text();

    expect(contentType).toMatch(/^multipart\/related; boundary=/);
    expect(text).toContain('"name":"segim-backup.json"');
    expect(text).toContain('"parents":["carpeta-9"]');
    expect(text).toContain('{"app":"gymrutinas"}');
    // La frontera del Content-Type es la misma que la del cuerpo.
    const boundary = contentType.split('boundary=')[1];
    expect(text.startsWith(`--${boundary}`)).toBe(true);
    expect(text.endsWith(`--${boundary}--`)).toBe(true);
  });

  it('sin carpeta no manda parents', async () => {
    const { body } = buildMultipartBody('{}');
    expect(await body.text()).not.toContain('parents');
  });
});

describe('renameFile', () => {
  it('renombra con un PATCH de metadatos, sin tocar el contenido', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: 'folder-1', name: 'Segim' }));

    const file = await renameFile('tok', 'folder-1', 'Segim');

    expect(file.name).toBe('Segim');
    const [url, init] = callOf(fetchMock);
    expect(url).toContain('/drive/v3/files/folder-1?fields=');
    expect(url).not.toContain('upload/drive');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"name":"Segim"}');
    expect(new Headers(init.headers).get('Content-Type')).toContain('application/json');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });
});

describe('copias fechadas', () => {
  it('el nombre lleva fecha y hora local, con ancho fijo', () => {
    expect(datedCopyName(new Date(2026, 9, 28, 18, 42))).toBe('copia-2026-10-28-1842.json');
    expect(datedCopyName(new Date(2027, 0, 5, 8, 5))).toBe('copia-2027-01-05-0805.json');
  });

  it('crea el fichero con el nombre indicado', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: 'c1' }));

    await createJsonFile('tok', 'copia-2026-10-28-1842.json', '{}', 'carpeta-1');

    const [url, init] = callOf(fetchMock);
    expect(url).toContain('uploadType=multipart');
    const text = await (init.body as Blob).text();
    expect(text).toContain('"name":"copia-2026-10-28-1842.json"');
    expect(text).toContain('"parents":["carpeta-1"]');
  });

  it('lista solo las copias de la carpeta, de la más nueva a la más vieja', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ files: [{ id: 'c1', name: 'copia-2026-10-28-1842.json' }] }),
    );

    const copies = await listDatedCopies('tok', 'carpeta-1');

    expect(copies).toHaveLength(1);
    const decoded = decodeURIComponent(callOf(fetchMock)[0]);
    expect(decoded).toContain("name contains 'copia-'");
    expect(decoded).toContain("'carpeta-1' in parents");
    expect(decoded).toContain('orderBy=name desc');
  });

  it('sin carpeta conocida busca en todo el Drive visible para la app', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ files: [] }));

    await listDatedCopies('tok');

    const decoded = decodeURIComponent(callOf(fetchMock)[0]);
    expect(decoded).not.toContain(' in parents');
  });
});

describe('descarga', () => {
  it('devuelve el texto tal cual', async () => {
    stubFetch(() => new Response('{"app":"gymrutinas"}', { status: 200 }));
    await expect(downloadBackupText('tok', 'f1')).resolves.toBe('{"app":"gymrutinas"}');
  });
});

describe('errores', () => {
  const capture = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (err) {
      return err as DriveError;
    }
    throw new Error('Se esperaba un error');
  };

  it('401 → hay que pedir token de nuevo', async () => {
    stubFetch(() =>
      jsonResponse({ error: { message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } }, 401),
    );
    const err = await capture(downloadBackupText('tok', 'f1'));
    expect(err).toBeInstanceOf(DriveError);
    expect(err.kind).toBe('auth');
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/sesión con Google ha caducado/i);
  });

  it('403 por cuota se distingue de un permiso denegado', async () => {
    stubFetch(() =>
      jsonResponse({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403),
    );
    const err = await capture(downloadBackupText('tok', 'f1'));
    expect(err.kind).toBe('quota');
    expect(err.message).toMatch(/no tiene espacio/i);
  });

  it('sin red → error de tipo network con status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const err = await capture(downloadBackupText('tok', 'f1'));
    expect(err.kind).toBe('network');
    expect(err.status).toBe(0);
  });

  it('traduce los códigos habituales', () => {
    expect(classifyError(404).kind).toBe('notFound');
    expect(classifyError(429).kind).toBe('server');
    expect(classifyError(503).kind).toBe('server');
    expect(classifyError(418).kind).toBe('unknown');
  });
});
