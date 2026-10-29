import { describe, expect, it, vi } from 'vitest';
import { ExistingBackupError, buildBackup } from '../src/services/backup';
import { DEFAULT_SETTINGS } from '../src/models';
import { type DriveMeta, type DriveMetaStore } from '../src/db/driveStore';
import { type DriveFileMeta, DriveError } from '../src/services/drive/api';
import { createDriveTarget } from '../src/services/drive/target';

const backup = buildBackup({
  routines: [],
  exercises: [],
  sessions: [],
  settings: DEFAULT_SETTINGS,
});

/** Reloj fijo: así el nombre de la copia fechada es predecible. */
const NOW = new Date(2026, 9, 28, 18, 42); // 28 oct 2026, 18:42 (hora local)

function memoryStore(initial: DriveMeta | null = null) {
  let current = initial;
  const store: DriveMetaStore & { peek: () => DriveMeta | null } = {
    load: async () => current,
    save: async (meta) => {
      current = meta;
    },
    clear: async () => {
      current = null;
    },
    peek: () => current,
  };
  return store;
}

function fakeClient() {
  return {
    findBackupFile: vi.fn(async (): Promise<DriveFileMeta | null> => null),
    getFileMeta: vi.fn(async (_token: string, fileId: string): Promise<DriveFileMeta> => ({
      id: fileId,
    })),
    findBackupFolders: vi.fn(async (): Promise<DriveFileMeta[]> => []),
    createFolder: vi.fn(async (): Promise<DriveFileMeta> => ({ id: 'folder-1' })),
    createBackupFile: vi.fn(
      async (): Promise<DriveFileMeta> => ({
        id: 'file-1',
        modifiedTime: '2026-10-28T10:00:00.000Z',
      }),
    ),
    createJsonFile: vi.fn(
      async (_token: string, name: string): Promise<DriveFileMeta> => ({ id: `dated-${name}`, name }),
    ),
    // Drive devuelve el mismo fichero que se ha actualizado: el id se conserva.
    updateBackupFile: vi.fn(
      async (_token: string, fileId: string): Promise<DriveFileMeta> => ({
        id: fileId,
        modifiedTime: '2026-10-28T11:00:00.000Z',
      }),
    ),
    downloadBackupText: vi.fn(async (): Promise<string> => JSON.stringify(backup)),
    listDatedCopies: vi.fn(async (): Promise<DriveFileMeta[]> => []),
    deleteFile: vi.fn(async (): Promise<void> => undefined),
    getDriveAccount: vi.fn(async (): Promise<{ email?: string }> => ({})),
    // Drive devuelve el fichero con el nombre nuevo ya aplicado.
    renameFile: vi.fn(
      async (_token: string, fileId: string, name: string): Promise<DriveFileMeta> => ({
        id: fileId,
        name,
      }),
    ),
  };
}

const target = (
  client: ReturnType<typeof fakeClient>,
  store: DriveMetaStore,
  options: {
    getToken?: (interactive: boolean) => Promise<string>;
    hasToken?: () => boolean;
    maxCopies?: number;
    now?: () => Date;
  } = {},
) =>
  createDriveTarget({
    client,
    metaStore: store,
    getToken: options.getToken ?? (async () => 'tok'),
    hasToken: options.hasToken ?? (() => true),
    isConfigured: () => true,
    maxCopies: options.maxCopies,
    now: options.now ?? (() => NOW),
  });

describe('subida a Drive', () => {
  it('con dated:false refresca la copia viva sin crear copia fechada', async () => {
    const client = fakeClient();
    const store = memoryStore({ folderId: 'folder-1', fileId: 'file-1' });

    const result = await target(client, store).upload(backup, { dated: false });

    expect(client.updateBackupFile).toHaveBeenCalledWith('tok', 'file-1', JSON.stringify(backup));
    // Ni copia fechada ni rotación: no se toca el historial del Drive.
    expect(client.createJsonFile).not.toHaveBeenCalled();
    expect(client.listDatedCopies).not.toHaveBeenCalled();
    expect(client.deleteFile).not.toHaveBeenCalled();
    expect(store.peek()?.lastSyncAt).toBe('2026-10-28T11:00:00.000Z');
    expect(result.warning).toBeUndefined();
  });

  it('la primera vez crea carpeta, última copia y copia fechada', async () => {
    const client = fakeClient();
    const store = memoryStore();

    const result = await target(client, store).upload(backup);

    expect(client.createFolder).toHaveBeenCalledTimes(1);
    expect(client.createBackupFile).toHaveBeenCalledWith('tok', JSON.stringify(backup), 'folder-1');
    expect(client.createJsonFile).toHaveBeenCalledWith(
      'tok',
      'copia-2026-10-28-1842.json',
      JSON.stringify(backup),
      'folder-1',
    );
    expect(result.syncedAt).toBe('2026-10-28T10:00:00.000Z');
    expect(result.warning).toBeUndefined();
    expect(store.peek()).toMatchObject({
      fileId: 'file-1',
      folderId: 'folder-1',
      lastSyncAt: '2026-10-28T10:00:00.000Z',
    });
  });

  it('con referencia guardada actualiza sin buscar ni crear carpetas', async () => {
    const client = fakeClient();
    const store = memoryStore({ fileId: 'file-1', folderId: 'folder-1' });

    await target(client, store).upload(backup);

    expect(client.updateBackupFile).toHaveBeenCalledWith('tok', 'file-1', JSON.stringify(backup));
    expect(client.findBackupFile).not.toHaveBeenCalled();
    expect(client.createFolder).not.toHaveBeenCalled();
  });

  it('sin referencia no pisa la copia que ya está en Drive', async () => {
    const client = fakeClient();
    client.findBackupFile.mockResolvedValue({ id: 'file-9', modifiedTime: '2026-10-20T09:00:00.000Z' });
    const store = memoryStore({});

    const err = await target(client, store)
      .upload(backup)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ExistingBackupError);
    expect((err as ExistingBackupError).modifiedTime).toBe('2026-10-20T09:00:00.000Z');
    expect(client.updateBackupFile).not.toHaveBeenCalled();
    expect(client.createBackupFile).not.toHaveBeenCalled();
    expect(client.createFolder).not.toHaveBeenCalled();
    expect(store.peek()).toEqual({});
  });

  it('con replaceExisting sustituye la copia de Drive y usa su carpeta', async () => {
    const client = fakeClient();
    client.findBackupFile.mockResolvedValue({ id: 'file-9', parents: ['folder-9'] });
    client.findBackupFolders.mockResolvedValue([
      { id: 'folder-1', name: 'Segim' },
      { id: 'folder-9', name: 'Segim' },
    ]);
    const store = memoryStore({});

    await target(client, store).upload(backup, { replaceExisting: true });

    expect(client.updateBackupFile).toHaveBeenCalledWith('tok', 'file-9', JSON.stringify(backup));
    expect(client.createBackupFile).not.toHaveBeenCalled();
    expect(client.createFolder).not.toHaveBeenCalled();
    expect(store.peek()).toMatchObject({ fileId: 'file-9', folderId: 'folder-9' });
  });

  it('reutiliza la carpeta de la app en vez de crear otra', async () => {
    const client = fakeClient();
    client.findBackupFolders.mockResolvedValue([{ id: 'folder-7', name: 'Segim' }]);
    const store = memoryStore();

    await target(client, store).upload(backup);

    expect(client.createFolder).not.toHaveBeenCalled();
    expect(client.createBackupFile).toHaveBeenCalledWith('tok', JSON.stringify(backup), 'folder-7');
    expect(store.peek()?.folderId).toBe('folder-7');
  });

  it('tras restaurar en otro dispositivo sube a la carpeta que contiene la copia', async () => {
    const client = fakeClient();
    client.getFileMeta.mockResolvedValue({ id: 'file-9', parents: ['folder-9'] });
    client.findBackupFolders.mockResolvedValue([
      { id: 'folder-1', name: 'Segim' },
      { id: 'folder-9', name: 'Segim' },
    ]);
    const store = memoryStore({ fileId: 'file-9' });

    await target(client, store).upload(backup);

    expect(client.findBackupFile).not.toHaveBeenCalled();
    expect(client.updateBackupFile).toHaveBeenCalledWith('tok', 'file-9', JSON.stringify(backup));
    expect(client.createJsonFile).toHaveBeenCalledWith(
      'tok',
      'copia-2026-10-28-1842.json',
      JSON.stringify(backup),
      'folder-9',
    );
    expect(store.peek()?.folderId).toBe('folder-9');
  });

  it('si el fichero se borró en Drive, lo vuelve a crear al momento', async () => {
    const client = fakeClient();
    client.updateBackupFile.mockRejectedValueOnce(
      new DriveError('notFound', 404, 'La copia ya no está en tu Google Drive.'),
    );
    const store = memoryStore({ fileId: 'borrado', folderId: 'folder-1' });

    await target(client, store).upload(backup);

    expect(client.createFolder).not.toHaveBeenCalled(); // reutiliza la carpeta
    expect(client.createBackupFile).toHaveBeenCalledWith('tok', JSON.stringify(backup), 'folder-1');
    expect(store.peek()?.fileId).toBe('file-1');
  });

  it('conserva solo las 10 copias fechadas más recientes', async () => {
    const client = fakeClient();
    // Drive devuelve las copias de la más nueva a la más vieja.
    const copies = Array.from({ length: 12 }, (_, i) => ({
      id: `dated-${i + 1}`,
      name: `copia-2026-10-${String(28 - i).padStart(2, '0')}-1200.json`,
    }));
    client.listDatedCopies.mockResolvedValue(copies);
    const store = memoryStore({ fileId: 'file-1', folderId: 'folder-1' });

    await target(client, store).upload(backup);

    expect(client.deleteFile).toHaveBeenCalledTimes(2);
    expect(client.deleteFile).toHaveBeenCalledWith('tok', 'dated-11');
    expect(client.deleteFile).toHaveBeenCalledWith('tok', 'dated-12');
  });

  it('si la copia fechada falla, la copia principal se guarda y se avisa', async () => {
    const client = fakeClient();
    client.createJsonFile.mockRejectedValueOnce(
      new DriveError('quota', 403, 'Tu Google Drive no tiene espacio libre.'),
    );
    const store = memoryStore({ fileId: 'file-1', folderId: 'folder-1' });

    const result = await target(client, store).upload(backup);

    expect(result.syncedAt).toBe('2026-10-28T11:00:00.000Z');
    expect(result.warning).toMatch(/no tiene espacio/i);
    expect(store.peek()?.lastSyncAt).toBe('2026-10-28T11:00:00.000Z');
  });

  it('reintenta una vez con token nuevo si Google responde 401', async () => {
    const client = fakeClient();
    client.updateBackupFile.mockRejectedValueOnce(
      new DriveError('auth', 401, 'La sesión con Google ha caducado.'),
    );
    const store = memoryStore({ fileId: 'file-1', folderId: 'folder-1' });
    const getToken = vi.fn(async () => 'tok-nuevo');

    await target(client, store, { getToken }).upload(backup, { interactive: true });

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(client.updateBackupFile).toHaveBeenLastCalledWith(
      'tok-nuevo',
      'file-1',
      JSON.stringify(backup),
    );
  });

  it('sin interacción no reintenta: deja que la UI pida reconectar', async () => {
    const client = fakeClient();
    client.updateBackupFile.mockRejectedValueOnce(
      new DriveError('auth', 401, 'La sesión con Google ha caducado.'),
    );
    const store = memoryStore({ fileId: 'file-1', folderId: 'folder-1' });
    const getToken = vi.fn(async () => 'tok');

    await expect(target(client, store, { getToken }).upload(backup)).rejects.toBeInstanceOf(
      DriveError,
    );
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});

describe('restauración desde Drive', () => {
  it('descarga y valida la copia', async () => {
    const client = fakeClient();
    const store = memoryStore({ fileId: 'file-1' });

    const restored = await target(client, store).downloadLatest();

    expect(restored.app).toBe('gymrutinas');
    expect(restored.sessions).toEqual([]);
  });

  it('rechaza una copia dañada sin tocar los datos locales', async () => {
    const client = fakeClient();
    client.downloadBackupText.mockResolvedValue('{ esto no es json');
    const store = memoryStore({ fileId: 'file-1' });

    await expect(target(client, store).downloadLatest()).rejects.toThrow(/no es un JSON válido/i);
  });

  it('si no hay copia en Drive lo dice claro', async () => {
    const client = fakeClient();
    const store = memoryStore({});

    const err = await target(client, store)
      .downloadLatest()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DriveError);
    expect((err as DriveError).kind).toBe('notFound');
    expect((err as DriveError).message).toMatch(/no hay ninguna copia/i);
  });
});

describe('renombrado de la carpeta', () => {
  it('renombra la carpeta antigua una sola vez y lo recuerda', async () => {
    const client = fakeClient();
    const store = memoryStore({ folderId: 'folder-1', fileId: 'file-1', folderName: 'GymRutinas' });

    await target(client, store).upload(backup);

    expect(client.renameFile).toHaveBeenCalledWith('tok', 'folder-1', 'Segim');
    expect(client.createFolder).not.toHaveBeenCalled();
    expect(store.peek()?.folderName).toBe('Segim');

    // La siguiente subida ya no repite la petición.
    client.renameFile.mockClear();
    await target(client, store).upload(backup);
    expect(client.renameFile).not.toHaveBeenCalled();
  });

  it('con metadatos anteriores (sin nombre guardado) lo comprueba igual', async () => {
    // Las instalaciones de antes del renombrado no tienen `folderName`.
    const client = fakeClient();
    const store = memoryStore({ folderId: 'folder-1', fileId: 'file-1' });

    await target(client, store).upload(backup);

    expect(client.renameFile).toHaveBeenCalledWith('tok', 'folder-1', 'Segim');
    expect(store.peek()?.folderName).toBe('Segim');
  });

  it('si Google no deja renombrar, la copia se sube igual y se reintenta después', async () => {
    const client = fakeClient();
    client.renameFile.mockRejectedValueOnce(new DriveError('server', 500, 'Google no responde'));
    const store = memoryStore({ folderId: 'folder-1', fileId: 'file-1', folderName: 'GymRutinas' });

    const result = await target(client, store).upload(backup);

    expect(client.updateBackupFile).toHaveBeenCalledWith('tok', 'file-1', JSON.stringify(backup));
    expect(result.warning).toBeUndefined();
    // Sin nombre recordado: la próxima subida volverá a intentarlo.
    expect(store.peek()?.folderName).toBeUndefined();
    expect(store.peek()?.lastSyncAt).toBe('2026-10-28T11:00:00.000Z');
  });

  it('una carpeta antigua encontrada en Drive se renombra al reutilizarla', async () => {
    const client = fakeClient();
    client.findBackupFolders.mockResolvedValue([{ id: 'folder-old', name: 'GymRutinas' }]);
    const store = memoryStore();

    await target(client, store).upload(backup);

    expect(client.createFolder).not.toHaveBeenCalled();
    expect(client.renameFile).toHaveBeenCalledWith('tok', 'folder-old', 'Segim');
    expect(store.peek()).toMatchObject({ folderId: 'folder-old', folderName: 'Segim' });
  });

  it('una carpeta recién creada ya lleva el nombre actual', async () => {
    const client = fakeClient();
    const store = memoryStore();

    await target(client, store).upload(backup);

    expect(client.createFolder).toHaveBeenCalledTimes(1);
    expect(client.renameFile).not.toHaveBeenCalled();
    expect(store.peek()?.folderName).toBe('Segim');
  });
});

describe('cuenta que recibe la copia', () => {
  it('guarda el correo de about.get y lo devuelve en status', async () => {
    const client = fakeClient();
    client.getDriveAccount.mockResolvedValue({ email: 'me.joang+segim@gmail.com' });
    const store = memoryStore({ fileId: 'file-1', folderId: 'folder-1' });

    await target(client, store).upload(backup);

    expect(client.getDriveAccount).toHaveBeenCalledWith('tok');
    expect(store.peek()?.account).toBe('me.joang+segim@gmail.com');
    await expect(target(client, store).status()).resolves.toMatchObject({
      connected: true,
      account: 'me.joang+segim@gmail.com',
    });
  });

  it('si about.get falla la copia se sube igual y se conserva el correo anterior', async () => {
    const client = fakeClient();
    client.getDriveAccount.mockRejectedValue(new DriveError('network', 0, 'Sin conexión'));
    const store = memoryStore({
      fileId: 'file-1',
      folderId: 'folder-1',
      account: 'antes@ejemplo.com',
    });

    const result = await target(client, store).upload(backup);

    expect(result.warning).toBeUndefined();
    expect(store.peek()?.account).toBe('antes@ejemplo.com');
    await expect(target(client, store).status()).resolves.toMatchObject({
      account: 'antes@ejemplo.com',
    });
  });
});

describe('estado', () => {
  it('sin Client ID configurado el destino no está disponible', async () => {
    const status = await createDriveTarget({
      client: fakeClient(),
      metaStore: memoryStore(),
      getToken: async () => 'tok',
      isConfigured: () => false,
    }).status();

    expect(status).toEqual({ available: false, connected: false });
  });

  it('refleja la conexión y la última sincronización', async () => {
    const store = memoryStore({ fileId: 'file-1', lastSyncAt: '2026-10-28T11:00:00.000Z' });

    await expect(target(fakeClient(), store).status()).resolves.toEqual({
      available: true,
      connected: true,
      lastSyncAt: '2026-10-28T11:00:00.000Z',
      authorized: true,
    });
  });

  it('indica si hace falta volver a autorizar antes de subir', async () => {
    const store = memoryStore({ fileId: 'file-1' });

    await expect(
      target(fakeClient(), store, { hasToken: () => false }).status(),
    ).resolves.toMatchObject({ connected: true, authorized: false });
  });
});
