import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isCloudConfigured, supabaseKey, supabaseUrl } from './config';

let client: SupabaseClient | null = null;

export function cloudClient(): SupabaseClient {
  if (!isCloudConfigured()) {
    throw new Error('Esta versión no tiene configurada la nube.');
  }
  if (!client) {
    client = createClient(supabaseUrl(), supabaseKey(), {
      auth: {
        // La sesión se guarda en el navegador para no pedir la contraseña en cada apertura.
        persistSession: true,
        autoRefreshToken: true,
        // La app no usa enlaces mágicos: no hay tokens en la URL que haya que procesar.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
