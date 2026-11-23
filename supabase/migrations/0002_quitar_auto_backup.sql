-- Segim · Quitar la columna de la copia automática de Google Drive (v0.12.0)
--
-- Ejecutar una vez en el SQL Editor de Supabase. Si el proyecto ya se creó sin Drive,
-- la columna no existe y no pasa nada: es idempotente.

alter table public.settings drop column if exists auto_backup;
