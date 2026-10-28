# GymRutinas 🏋️

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
  (con fecha relativa) y tus inputs de hoy; checks, notas, series extra y cronómetro
  de descanso opcional (presets 60/90/120/180/240/300 s, editables).
  La sesión en curso se guarda en cada cambio: puedes cerrar la pestaña y volver.
  **No se mide la duración** (sin marcar arranque/final): solo cuenta la fecha de
  realización, que puedes cambiar cuando quieras.
- **Rutinas**: editor por días → ejercicios → series (cada serie con su peso y reps),
  reordenación de días, ejercicios y series, clonado profundo, rutina activa, archivar.
- **Compartir rutinas**: exportar/importar un `.json` con solo rutinas y sus ejercicios
  (nunca sesiones ni ajustes) desde la pestaña *Rutinas*; reimportar no duplica.
- **Catálogo de ejercicios con id estable**: al montar una rutina autocompleta y elige un
  ejercicio existente o crea uno nuevo (queda guardado); la comparación entre sesiones usa
  el **id**, no el nombre. Pestaña *Ejercicios* para buscar, renombrar (propaga a todas las
  rutinas) y limpiar el catálogo. Al cargar o importar se **fusionan los duplicados por
  nombre** y se reparan los vínculos de rutinas e historial.
- **Historial**: sesiones agrupadas por mes, detalle con todas las series, edición
  (reabrir), **fecha de realización editable** y borrado, volumen y racha.
- **Ajustes**: **tema (automático/claro/oscuro)**, cambio de unidad kg/lb que **convierte
  los pesos guardados** (con confirmación), presets de descanso, **exportar/importar JSON**
  validado, **copia de seguridad en Google Drive** (opcional y manual) y borrado total.

## Copia de seguridad en Google Drive (opcional)

Desde Ajustes puedes conectar tu cuenta de Google y subir todas tus rutinas, sesiones y
ajustes a **tu** Drive. Nada pasa por un servidor: la app habla directamente con la API de
Google con un token que vive solo en memoria.

```
GymRutinas/
  gymrutinas-backup.json        ← última copia (es la que se restaura)
  copia-2026-10-28-1842.json    ← copias fechadas (se conservan las 10 últimas)
```

- Copia **manual**: se sube al pulsar *Subir ahora*; no hay sincronización automática.
- Permiso **`drive.file`** (no sensible): la app solo ve los ficheros que ella crea.
- *Restaurar* valida el JSON con el mismo criterio que el import por fichero y pide
  confirmación antes de reemplazar los datos locales.
- El token de Google dura ~1 h; al caducar, el botón vuelve a autorizar sin repetir el
  consentimiento mientras la sesión de Google siga activa.
- *Desconectar* revoca el permiso; los ficheros siguen en tu Drive.

### Configurarlo

1. Crea un **Client ID de OAuth** (tipo "Aplicación web") en Google Cloud, con la Drive API
   habilitada y estos orígenes autorizados: `https://joangilabert94.github.io` y
   `http://localhost:5173`.
2. En local, define `VITE_GOOGLE_CLIENT_ID` en `.env.local` (ignorado por Git).
3. En GitHub Pages, define la **variable del repositorio** `VITE_GOOGLE_CLIENT_ID`
   (Settings → Secrets and variables → Actions → Variables).

Con el proyecto en modo *Testing* solo conectan las cuentas de prueba (hasta 100) y la
autorización caduca a los 7 días; publicar y verificar la marca elimina ambos límites.

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
npm run icons      # regenera los iconos PNG (scripts/generate-icons.mjs)
```

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
  services/drive/  # copia en Google Drive (api REST, auth, BackupTarget)
  db/driveStore.ts # metadatos de la conexión con Google Drive
  views/           # Hoy, Session, History, SessionDetail, Routines, RoutineEditor, Exercises, Settings
  components/      # SeriesRow, ExercisePicker, BottomSheet, ConfirmDialog, RestControls
  styles/          # tokens, base, componentes
tests/             # vitest (170 tests)
```

## Roadmap

- ✓ **Copia de seguridad en Google Drive** (v0.7.0, manual; ver arriba).
- Sincronización automática entre dispositivos (requiere backend que custodie refresh
  tokens: un access token de navegador dura ~1 h y renovarlo exige un gesto).
- Estadísticas y gráficas de progresión.
- Exportar/importar el catálogo hacia plantillas compartibles.
