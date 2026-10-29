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
  reordenación de días, ejercicios y series, clonado profundo, rutina activa, archivar.
- **Compartir rutinas**: exportar/importar un `.json` con solo rutinas y sus ejercicios
  (nunca sesiones ni ajustes) desde la pestaña *Rutinas*; reimportar no duplica.
- **Catálogo de ejercicios con id estable**: al montar una rutina autocompleta y elige un
  ejercicio existente o crea uno nuevo (queda guardado); la comparación entre sesiones usa
  el **id**, no el nombre. Pestaña *Ejercicios* para buscar, renombrar (propaga a todas las
  rutinas) y limpiar el catálogo. Al cargar o importar se **fusionan los duplicados por
  nombre** y se reparan los vínculos de rutinas e historial. Cada ejercicio puede ser
  **normal, de peso corporal (con lastre) o asistido** (menos asistencia es mejor), hacerse
  **por lado** (cuenta doble en kg) y tener su propio incremento de progresión.
- **Historial**: sesiones agrupadas por mes, detalle con todas las series y sus récords,
  edición (reabrir), **fecha de realización editable** y borrado, volumen, racha y **series
  semanales por grupo muscular** (con la diferencia frente a la semana anterior).
- **Ajustes**: **tema (automático/claro/oscuro)**, cambio de unidad kg/lb que **convierte
  los pesos guardados** (con confirmación), presets de descanso, incremento de la progresión,
  peso corporal opcional (para 1RM y volumen de lastrados y asistidos), **exportar/importar JSON**
  validado, **copia de seguridad en Google Drive** (opcional; manual o automática) y borrado
  total.

## Copia de seguridad en Google Drive (opcional)

Desde Ajustes puedes conectar tu cuenta de Google y subir todas tus rutinas, sesiones y
ajustes a **tu** Drive. Nada pasa por un servidor: la app habla directamente con la API de
Google con un token que vive solo en memoria.

```
Segim/
  segim-backup.json             ← última copia (es la que se restaura)
  copia-2026-10-28-1842.json    ← copias fechadas (se conservan las 10 últimas)
```

- Copia **manual** (*Subir ahora*) o **automática**, que se activa en Ajustes: sube al
  terminar una sesión (a los 5 s) y, tras editar una sesión, una rutina o un ejercicio,
  cuando dejas de tocar nada (20–30 s), de modo que una ráfaga de cambios produce una sola
  copia.
- Las copias fechadas se crean al terminar una sesión y al subir a mano; las ediciones solo
  actualizan `segim-backup.json`, para no expulsar del historial las de días anteriores.
- Si no hay conexión o Google pide volver a autorizar, la app lo avisa y queda la vía
  manual; nunca restaura nada por su cuenta. Sin permiso vigente (dura ~1 h) no intenta
  pedirlo en segundo plano, porque el navegador bloquea esa ventana: el aviso trae un botón
  *☁️ Subir ahora* que autoriza y sube en un toque.
- El JSON conserva la marca interna `"app": "gymrutinas"` y la app sigue leyendo
  `gymrutinas-backup.json`: son identificadores de formato, no el nombre visible, y cambiarlos
  invalidaría las copias ya guardadas.
- Si tu carpeta se creó con el nombre anterior (`GymRutinas`), la primera subida la renombra a
  `Segim` sin mover ni duplicar nada; el fichero de la copia conserva el nombre con el que se
  creó.
- Permiso **`drive.file`** (no sensible): la app solo ve los ficheros que ella crea.
- En Ajustes se muestra **la cuenta de Google a la que se sube la copia**: se consulta con
  `about.get`, que también admite `drive.file`, así que no pide ningún permiso nuevo.
- *Restaurar* valida el JSON con el mismo criterio que el import por fichero y pide
  confirmación antes de reemplazar los datos locales. Está disponible aunque el dispositivo
  no esté conectado, para recuperar la copia en un móvil nuevo.
- Conectar un dispositivo que nunca ha subido nada **no pisa** una copia que ya esté en
  Drive: la app avisa con su fecha y solo la sustituye si lo confirmas. También reutiliza la
  carpeta `Segim` existente en vez de crear otra.
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

La app publica su **política de privacidad** en `/segim/privacidad.html` (enlazada desde
Ajustes): Google exige una URL pública y el dominio verificado en Search Console.

Con el proyecto en modo *Testing* solo conectan las cuentas de prueba (hasta 100) y la
autorización caduca a los 7 días. Publicar la app (**Audience → Publish app**) elimina ambos
límites; con `drive.file`, que no es sensible, no hay verificación de scopes, y la de marca
solo es necesaria para que el consentimiento muestre el nombre y el logo.

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
  services/drive/  # copia en Google Drive (api REST, auth, BackupTarget)
  db/driveStore.ts # metadatos de la conexión con Google Drive
  views/           # Hoy, Session, History, SessionDetail, Routines, RoutineEditor, Exercises, Settings
  components/      # SeriesRow, ExercisePicker, BottomSheet, ConfirmDialog, RestControls
  styles/          # tokens, base, componentes
tests/             # vitest (250 tests)
```

## Roadmap

- ✓ **Copia de seguridad en Google Drive** (v0.8.4; manual o automática, con retardos).
- ✓ **v0.9.0**: lastrados, asistidos y unilaterales; progresión doble; récords al finalizar;
  series semanales por grupo muscular.
- **Siguiente**: superseries.
- Sincronización automática entre dispositivos (requiere backend que custodie refresh
  tokens: un access token de navegador dura ~1 h y renovarlo exige un gesto).
- Estadísticas y gráficas de progresión.
- Exportar/importar el catálogo hacia plantillas compartibles.
