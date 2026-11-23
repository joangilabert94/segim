# Segim 🏋️

PWA mobile-first para controlar tus rutinas y el día a día del gimnasio: rutinas
multi-día, modo entrenamiento con comparación **serie a serie** (Plan · Anterior · Hoy),
historial con fechas, clonado de rutinas y todo almacenado **localmente** en el
dispositivo. Funciona sin conexión e instalable desde el navegador.

🌐 **En producción**: <https://joangilabert94.github.io/segim/>

📄 El plan completo de desarrollo está en [PLAN.md](PLAN.md).

## Qué hace

- **Hoy**: día sugerido de tu rutina activa, reanudar sesión en curso, racha y volumen.
  La **sesión libre** está siempre disponible, incluso sin ninguna rutina creada.
- **Modo entrenamiento**: cada serie muestra lo planeado, lo de la sesión anterior
  (con fecha relativa) y tus inputs de hoy, precargados con tu mejor resultado de las últimas
  8 semanas si supera al plan en peso y reps (si no, con el plan); checks, notas, series extra y cronómetro
  de descanso opcional (presets 60/90/120/180/240/300 s, editables).
  **Progresión doble**: cuando todas las series con rango (8-12) llegan al tope, la siguiente
  sesión sube el peso (2,5 kg o el incremento del ejercicio) y lo marca con `↑ +2,5`.
  Al finalizar, **récords** de peso, 1RM estimado, reps y volumen frente a todo tu historial.
  La sesión en curso se guarda en cada cambio: puedes cerrar la pestaña y volver.
  **No se mide la duración** (sin marcar arranque/final): solo cuenta la fecha de
  realización, que puedes cambiar cuando quieras.
- **Rutinas**: editor por días → ejercicios → series (cada serie con su peso y reps),
  reordenación de días, ejercicios y series, clonado profundo, rutina activa, archivar. Cada
  rutina muestra la **primera y la última vez** que la entrenaste y su **duración en semanas**.
- **Compartir rutinas**: exportar/importar un `.json` desde la pestaña *Rutinas* (todas o una
  sola desde su tarjeta), eligiendo entre **solo rutinas y sus ejercicios** (para compartirla
  con otra persona, sin tus pesos) o **rutinas + las sesiones realizadas de esas rutinas**
  (copia de seguridad o pasar el historial a otro dispositivo). Nunca incluye ajustes, y
  reimportar no duplica rutinas, ejercicios ni sesiones. Detalle y ejemplo del fichero en
  [Compartir rutinas y llevar el historial](#compartir-rutinas-y-llevar-el-historial).
- **Catálogo de ejercicios con id estable**: al montar una rutina autocompleta y elige un
  ejercicio existente o crea uno nuevo (queda guardado); la comparación entre sesiones usa
  el **id**, no el nombre. Pestaña *Ejercicios* para buscar, renombrar (propaga a todas las
  rutinas), ver la **última vez** que hiciste cada ejercicio y limpiar el catálogo. Al cargar o importar se **fusionan los duplicados por
  nombre** y se reparan los vínculos de rutinas e historial. Cada ejercicio puede ser
  **normal, de peso corporal (con lastre) o asistido** (menos asistencia es mejor), hacerse
  **por lado** (cuenta doble en kg) y tener su propio incremento de progresión.
- **Historial**: sesiones agrupadas por mes, detalle con todas las series y sus récords,
  edición (reabrir), **fecha de realización editable** y borrado, volumen, racha y **series
  semanales por grupo muscular** (con la diferencia frente a la semana anterior).
- **Ajustes**: **tema (automático/claro/oscuro)**, cambio de unidad kg/lb que **convierte
  los pesos guardados** (con confirmación), presets de descanso, incremento de la progresión,
  peso corporal opcional (para 1RM y volumen de lastrados y asistidos), **exportar/importar JSON**
  validado, **sincronización opcional con Supabase** (cuenta por correo) y borrado total.

## Compartir rutinas y llevar el historial

En *Rutinas*, **⬇️ Exportar rutinas** exporta todas y **⬇️ Exportar** en una tarjeta exporta solo
esa. En los dos casos eliges qué lleva el `.json`:

- **Solo rutinas y ejercicios**: la rutina y los ejercicios que usa. Es el fichero para pasársela a
  otra persona, que empieza sin tus pesos.
- **Rutinas + sesiones realizadas**: lo anterior más las sesiones **terminadas** de esas rutinas
  (las que están en curso no viajan), con su fecha, su día, las notas y todas sus series.

Los ajustes (unidad, tema, descansos, peso corporal…) nunca van en este fichero: para eso está la
copia de **Ajustes**.

### Qué hace la importación

Al importar desde *Rutinas*:

- **Rutinas**: se añaden por `id`. Si ya tienes una con el mismo `id` se omite en vez de
  sobrescribirla, así que reimportar el mismo fichero no duplica ni pisa tus ediciones.
- **Ejercicios**: se reutiliza el del catálogo con el mismo `id` o, si no, el que se llame igual;
  solo se crean los que faltan, y las rutinas y sesiones importadas quedan vinculadas a él.
- **Sesiones**: se añaden al historial por `id`, también sin duplicar. Su `exerciseId` se revincula
  al ejercicio local equivalente (como en las rutinas), de modo que la comparación serie a serie y
  los récords siguen funcionando. Una sesión inválida se descarta sin tumbar el resto.
- El campo `sessions` es **opcional**: un fichero sin él (los antiguos, o cuando eliges solo
  rutinas) importa únicamente rutinas.
- Las sesiones de una **copia completa** (`"app": "gymrutinas"`) no se leen desde *Rutinas*: esa
  copia se restaura entera en **Ajustes → Importar JSON**, que es donde también va el historial.

### Ejemplo del fichero

Un fichero de rutinas con sesiones, recortado a una rutina, un ejercicio y una sesión:

```json
{
  "kind": "gymrutinas-routines",
  "version": 1,
  "exportedAt": "2026-11-03T07:30:00.000Z",
  "routines": [
    {
      "id": "r-push",
      "name": "Push",
      "archived": false,
      "createdAt": "2026-09-01T07:00:00.000Z",
      "updatedAt": "2026-10-20T18:00:00.000Z",
      "days": [
        {
          "id": "d1",
          "name": "Día 1",
          "exercises": [
            {
              "id": "re1",
              "exerciseId": "e-press",
              "name": "Press banca",
              "plannedSets": [{ "weight": 60, "reps": 8 }]
            }
          ]
        }
      ]
    }
  ],
  "exercises": [
    {
      "id": "e-press",
      "name": "Press banca",
      "muscleGroup": "Pecho",
      "createdAt": "2026-09-01T07:00:00.000Z"
    }
  ],
  "sessions": [
    {
      "id": "s-2026-10-28",
      "date": "2026-10-28",
      "routineId": "r-push",
      "dayId": "d1",
      "dayName": "Día 1",
      "status": "completed",
      "entries": [
        {
          "exerciseId": "e-press",
          "exerciseName": "Press banca",
          "sets": [{ "weight": 62.5, "reps": 8, "done": true }]
        }
      ]
    }
  ]
}
```

`kind` es lo que identifica el fichero; `sessions` solo aparece cuando se exportan y su `status`
es `completed` en todas las que viajan. El orden de las claves no importa.

## Peso corporal, asistidos y unilaterales

En **Ejercicios → ✎** cada ejercicio puede ser **Normal**, de **Peso corporal** (apuntas el
lastre; 0 = sin lastre) o **Asistido** (apuntas la ayuda; menos es mejor), hacerse **por lado**
y tener su propio incremento de progresión. Si rellenas tu **peso corporal** en Ajustes, el
1RM y el volumen de esos ejercicios lo incluyen.

Al actualizar, los ejercicios que ya tenías quedan como Normal y nada cambia hasta que los
edites. El cambio se aplica a todas las rutinas y a todo el historial del ejercicio:

- Al pasar a Peso corporal, el peso guardado se lee como lastre (bien si apuntabas 0; si
  apuntabas tu peso corporal, corrige esas series).
- Con el peso corporal en Ajustes y con *por lado*, el volumen en kg del historial sube.
- Si haces el mismo movimiento asistido y lastrado, usa dos ejercicios distintos.

## Sincronización con Supabase (opcional)

IndexedDB sigue siendo la copia de trabajo: la app funciona sin cuenta y sin conexión. Si
quieres, puedes entrar con tu correo y contraseña y tener las rutinas, el catálogo de
ejercicios, las sesiones y los ajustes en todos tus dispositivos, con los cambios al momento.

- **Base de datos normalizada** (`supabase/migrations/0001_schema.sql`): `routines`,
  `routine_days`, `routine_exercises`, `planned_sets`, `sessions`, `session_entries`,
  `performed_sets`, `exercises` y `settings`, más dos vistas. Todas cuelgan de `auth.users`
  por `user_id` y el **RLS** hace que cada cuenta solo vea lo suyo; se puede consultar con SQL
  desde el panel de Supabase.
- **Subida por diferencias**: al guardar se suben solo esa rutina, esa sesión o esos ajustes,
  no la base entera (`src/services/cloud/sync.ts`). Las tablas hijas sin id propio se
  reescriben completas con su padre.
- **Realtime**: los cambios hechos en otro dispositivo llegan al momento y la copia local se
  actualiza sin recargar.
- **Primera vez con datos en los dos lados**: la app pregunta qué se queda (local o nube) en
  vez de mezclar. Sin sesión no se escribe nada en la nube.
- **Sin la nube configurada**, Ajustes muestra «no configurada» y todo sigue siendo local.

### Configurarlo

1. Crea un proyecto en [Supabase](https://supabase.com) y ejecuta los dos ficheros de
   `supabase/migrations/` en el **SQL Editor** (primero `0001_schema.sql`, después
   `0002_quitar_auto_backup.sql`). Son idempotentes.
2. En *Authentication → Users* crea tu usuario: el registro está cerrado (se abre en
   *Authentication → Sign In / Providers* si lo prefieres).
3. En local, define `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`
   (ignorado por Git).
4. En GitHub Pages, define esas dos como **variables del repositorio**
   (Settings → Secrets and variables → Actions → Variables).

La publishable key es pública: viaja en el bundle y solo identifica el proyecto; quién puede
leer cada fila lo decide el RLS con el token de la sesión.

## Stack

Vite + TypeScript + Preact (~4 KB) · router por hash propio · IndexedDB con
`idb-keyval` · CSS propio (**temas claro y oscuro**, automático según el dispositivo) · `vite-plugin-pwa` (Workbox) · Vitest.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests de lógica pura (vitest)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build de producción en dist/
npm run icons      # regenera los iconos PNG y el icon.svg (scripts/generate-icons.mjs)
```

Los iconos se generan por código, sin dependencias ni herramientas externas: el script
pinta a 4× y reduce para suavizar los bordes, y exporta también `public/icons/icon.svg`
para la pestaña del navegador. Si cambias el diseño, edita `scripts/generate-icons.mjs`
y vuelve a ejecutar `npm run icons`.


## Despliegue en GitHub Pages

1. Sube el repo a GitHub.
2. En **Settings → Pages → Source**, elige **GitHub Actions**.
3. Publica creando una **etiqueta de versión** (`v0.3.0`) y subiéndola: el workflow
   [.github/workflows/deploy.yml](.github/workflows/deploy.yml) solo se dispara con
   etiquetas `v*` (o manualmente desde *Actions → Run workflow*), ejecuta tests, build y
   publica `dist/`. La app queda en `https://<usuario>.github.io/<repo>/`.

Los pushes a `master` o a cualquier otra rama **no despliegan**: solo ejecutan el
workflow de comprobación [.github/workflows/ci.yml](.github/workflows/ci.yml)
(typecheck, tests y build), así puedes subir trabajo en curso sin publicarlo.

Si el paso *Configure Pages* falla, es porque el *source* de Pages todavía no estaba
seleccionado: actívalo y vuelve a lanzar el run (**Actions → el run fallido →
Re-run all jobs**).

El build define `BASE_PATH=/<nombre-del-repo>/` para que funcione bajo la subcarpeta
del repo (el router por hash evita problemas de 404). Si tu repo se llama
`usuario.github.io`, cambia ese valor a `/` en el workflow.

## Estructura

```
src/
  models.ts        # tipos (Exercise, Routine, Session, PlannedSet, PerformedSet…)
  state.ts         # estado global + acciones + persistencia
  db/idb.ts        # capa IndexedDB
  router.ts        # hash router
  timer.ts         # cronómetro de descanso
  services/        # lógica pura (catálogo, comparación, prefill, clonado, stats, backup)
  services/cloud/  # sincronización con Supabase (config, cliente, mapeadores, sync)
  views/           # Hoy, Session, History, SessionDetail, Routines, RoutineEditor, Exercises, Settings
  components/      # SeriesRow, ExercisePicker, BottomSheet, ConfirmDialog, RestControls, CloudPanel
  styles/          # tokens, base, componentes
tests/             # vitest (207 tests)
```

## Roadmap

- ✓ **Sincronización con Supabase** (v0.11.0; login por correo, tablas con RLS y realtime).
- ✓ **v0.9.0**: lastrados, asistidos y unilaterales; progresión doble; récords al finalizar;
  series semanales por grupo muscular.
- ✓ **v0.10.0**: compartir rutinas con o sin sus sesiones realizadas, todas o una sola desde
  su tarjeta.
- **Siguiente**: superseries.
- Estadísticas y gráficas de progresión.
- Exportar/importar el catálogo hacia plantillas compartibles.
