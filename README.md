# GymRutinas 🏋️

PWA mobile-first para controlar tus rutinas y el día a día del gimnasio: rutinas
multi-día, modo entrenamiento con comparación **serie a serie** (Plan · Anterior · Hoy),
historial con fechas, clonado de rutinas y todo almacenado **localmente** en el
dispositivo. Funciona sin conexión e instalable desde el navegador.

🌐 **En producción**: <https://joangilabert94.github.io/segim/>

📄 El plan completo de desarrollo está en [PLAN.md](PLAN.md).

## Qué hace

- **Hoy**: día sugerido de tu rutina activa, reanudar sesión en curso, racha y volumen.
- **Modo entrenamiento**: cada serie muestra lo planeado, lo de la sesión anterior
  (con fecha relativa) y tus inputs de hoy; checks, notas, series extra y cronómetro
  de descanso opcional (presets 60/90/120/180/240/300 s, editables).
  La sesión en curso se guarda en cada cambio: puedes cerrar la pestaña y volver.
  **No se mide la duración** (sin marcar arranque/final): solo cuenta la fecha de
  realización, que puedes cambiar cuando quieras.
- **Rutinas**: editor por días → ejercicios → series (cada serie con su peso y reps),
  reordenación, clonado profundo, rutina activa, archivar.
- **Compartir rutinas**: exportar/importar un `.json` con solo rutinas y sus ejercicios
  (nunca sesiones ni ajustes) desde la pestaña *Rutinas*; reimportar no duplica.
- **Catálogo de ejercicios con id estable**: al montar una rutina autocompleta y elige un
  ejercicio existente o crea uno nuevo (queda guardado); la comparación entre sesiones usa
  el **id**, no el nombre. Pestaña *Ejercicios* para buscar, renombrar (propaga a todas las
  rutinas) y limpiar el catálogo.
- **Historial**: sesiones agrupadas por mes, detalle con todas las series, edición
  (reabrir), **fecha de realización editable** y borrado, volumen y racha.
- **Ajustes**: **tema (automático/claro/oscuro)**, kg/lb, presets de descanso,
  **exportar/importar JSON** (base para la
  fase 2 con Google Drive) y borrado total.

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
  views/           # Hoy, Session, History, SessionDetail, Routines, RoutineEditor, Exercises, Settings
  components/      # SeriesRow, ExercisePicker, BottomSheet, ConfirmDialog, RestControls
  styles/          # tokens, base, componentes
tests/             # vitest (27 tests)
```

## Roadmap (fase 2)

- Sincronización **opcional** con Google Drive usando las copias JSON
  (la capa `db` + `backup.ts` ya está preparada como puente `StorageAdapter`).
- Estadísticas y gráficas de progresión.
- Exportar/importar el catálogo hacia plantillas compartibles.
