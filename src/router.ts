// Router por hash mínimo. Funciona en GitHub Pages sin configuración de servidor.

export type PathListener = (path: string) => void;

const listeners = new Set<PathListener>();

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw === '' || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function emit(): void {
  const path = currentPath();
  listeners.forEach((fn) => fn(path));
}

export function subscribePath(fn: PathListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getPath(): string {
  return currentPath();
}

export function navigate(path: string): void {
  if (currentPath() === path) {
    emit();
    return;
  }
  window.location.hash = path;
}

window.addEventListener('hashchange', emit);

/** Coincide "/historial/abc" con "/historial/:id" devolviendo { id: 'abc' }. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      params[p[i].slice(1)] = decodeURIComponent(a[i]);
    } else if (p[i] !== a[i]) {
      return null;
    }
  }
  return params;
}
