// Configuración pública de Supabase. La publishable key identifica la app, no autoriza
// filas: eso lo decide el RLS con el token del usuario que ha iniciado sesión.
export function supabaseUrl(): string {
  const value = import.meta.env.VITE_SUPABASE_URL;
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

export function supabaseKey(): string {
  const value = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

export function isCloudConfigured(): boolean {
  return supabaseUrl() !== '' && supabaseKey() !== '';
}
