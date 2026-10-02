# Plan de desarrollo — PWA de control de rutinas de gimnasio

> Documento vivo. Cada cambio acordado se refleja aquí antes de tocar código.
>
> **Estado (2 oct 2026): fases 0–4 completadas + catálogo de ejercicios.** v1 implementada
> y verificada: `npm run typecheck` ✓ · `npm test` (27 tests) ✓ · `npm run build` ✓
> (19,6 kB JS + 4,1 kB CSS gzip, PWA offline instalable). Pendiente solo el despliegue
> real en GitHub Pages (workflow listo) y la fase 2 (Google Drive).

## 1. Objetivo

Aplicación PWA mobile-first para gestionar rutinas de gimnasio y registrar sesiones de entrenamiento: rutinas multi-día, modo "entrenamiento" con series/pesos/reps planeados vs. reales, comparación con la sesión anterior (progresión semana a semana), historial con fechas, clonado de rutinas y persistencia **local** (IndexedDB) con exportación/importación JSON. Desplegable en GitHub Pages y usable offline desde cualquier dispositivo.

Fase 2 (fuera de este plan, pero dejaremos la puerta abierta): almacenamiento opcional en Google Drive.

## 2. Stack técnico

| Capa | Elección | Por qué |
|---|---|---|
| Build | **Vite + TypeScript** | Arranque instantáneo, build estático perfecto para Pages |
| UI | **Preact** (~4 KB) + JSX | React-like sin peso; suficiente para una app de 5-6 pantallas |
| Router | **Hash router propio** (~30 líneas: `#/hoy`, `#/sesion`) | Cero dependencias; funciona en GitHub Pages sin config de servidor |
| Persistencia | **IndexedDB** con `idb-keyval` (~600 B) + repositorios tipados propios | Offline total, sin backend; suficiente para cientos de sesiones |
| Estilos | **CSS moderno propio** (custom properties, grid, `clamp()`) | Sin framework; tema oscuro mobile-first, control total del diseño |
| PWA | **`vite-plugin-pwa`** (Workbox `generateSW`) | Manifest + cache del shell para offline e instalable, configuración mínima |
| Tests | **Vitest** sobre lógica pura (comparación por serie, clonado, cálculos) | Barato de mantener y protege la parte no trivial |

Objetivo de peso: **< 50 KB comprimido** (JS+CSS), FCP instantánea.

## 3. Modelo de datos — cada serie con su propio peso y reps

**Punto central del diseño: todo es por serie.** Tanto lo planeado como lo realizado guardan peso y repeticiones individuales para cada serie, de forma que series de un mismo ejercicio pueden ser distintas (pirámides, descanso-reducción, etc.).

```ts
// Persistido en IndexedDB (stores: exercises, routines, sessions, settings)

Exercise {                 // CATÁLOGO: identidad estable de cada ejercicio
  id: string;              // uuid — la identidad real (nunca el nombre)
  name: string;            // etiqueta visible, editable
  muscleGroup?: string;
  createdAt: string;
}

Routine {
  id: string;            // uuid
  name: string;
  days: RoutineDay[];    // multi-día: Push / Pull / Legs, Upper / Lower...
  archived: boolean;
  createdAt: string;     // ISO
  updatedAt: string;
  sourceRoutineId?: string; // si fue clonada, rutina origen
}

RoutineDay {
  id: string;
  name: string;          // "Día 1 — Push"
  exercises: RoutineExercise[];
}RoutineExercise {
  id: string;
  exerciseId?: string;     // vínculo con el catálogo (opcional en datos antiguos)
  name: string;            // copia denormalizada para mostrar
  muscleGroup?: string;
  plannedSets: PlannedSet[];
}

PlannedSet {
  weight?: number;       // peso objetivo de ESTA serie (opcional)
  reps: number;          // reps planeadas de ESTA serie
  note?: string;         // p.ej. "bajar lento", "drop set en la última"
}

Session {
  id: string;
  date: string;          // ISO date (obligatorio: de cada sesión se guarda la fecha)
  routineId?: string;
  dayId?: string;
  dayName: string;       // copia del nombre del día (la rutina puede cambiar)
  status: 'in-progress' | 'completed';
  startedAt: string;
  completedAt?: string;
  entries: SessionEntry[];
}

SessionEntry {
  exerciseId?: string;     // vínculo con el catálogo (opcional en datos antiguos)
  exerciseName: string;    // copia plana; sin id, la identidad es el nombre normalizado
  note?: string;
  // Cada serie realizada tiene SU peso y Sus reps (pueden diferir entre series)
  sets: PerformedSet[];
}

PerformedSet {
  weight: number;        // peso real de ESTA serie
  reps: number;          // reps reales de ESTA serie
  done: boolean;
  note?: string;         // nota por serie
  extra?: boolean;       // serie añadida sobre la marcha (no planificada)
}

Settings {
  unit: 'kg' | 'lb';
  restPresets: number[]; // [60, 90, 120, 180, x, x] — 6 valores, editables
}
```

## 4. Pantallas y funcionalidades

### 4.1 Hoy (`#/hoy`)
- Saludo + fecha.
- **Día sugerido**: si hay una rutina activa, calcula el siguiente día no entrenado según secuencia y últimos 7 días; si no, "Empezar entrenamiento" genérico.
- Tarjeta con el día que toca: ejercicios que lo componen (vista previa).
- Últimas sesiones (3-5) con fecha y nº de ejercicios.
- Botón fijo grande **"Iniciar sesión"**.

### 4.2 Sesión / Modo entrenamiento (`#/sesion`)
- Al iniciar desde un día de rutina: se crean las `SessionEntry` con **una `PerformedSet` por cada `PlannedSet`**, y **se pre-rellena serie a serie** con los valores de la serie correspondiente de la última sesión que contuvo ese ejercicio (mismo nombre normalizado).
- **Comparación por serie** (la fila de cada serie muestra tres columnas):
  - **Plan**: `60 kg × 8` (de la serie i de la rutina),
  - **Anterior**: `62 kg × 8` + fecha relativa ("hace 4 días" / "semana pasada"), de la serie i de la sesión anterior,
  - **Hoy**: dos inputs editables (peso y reps) precargados con lo anterior (si existe) o con lo planeado.
  - La identidad del ejercicio es su **`exerciseId` del catálogo**; solo se usa el nombre
    normalizado como fallback en datos antiguos. Si la sesión anterior tenía **otro número
    de series**: se mapean por índice, y las que no tengan equivalente se muestran como «—».
- Contador de progreso (3/12 series hechas) y navegación por ejercicios (tabs/accordion).
- Por serie: checkbox de completada, inputs peso y reps, menú ⋮ con **nota de serie** y **añadir serie extra** (no planificada — también con sus propios peso/reps).
- Utilidades de relleno rápido sobre valores por serie: **"Aplicar esta serie a todas"** y **"Copiar plan"** (sobrescribe los inputs con lo planeado), pensadas para rutinas con peso constante o pirámides.
- **Cronómetro de descanso opcional**: botón **"Iniciar descanso"** (nunca automático) que abre los 6 presets; al activarlo, regresiva visible en cabecera/FAB con "reiniciar" y "parar".
- Nota general por ejercicio.
- Barra inferior con **"Finalizar sesión"** (guarda con `date` = hoy). La sesión `in-progress` se persiste **en cada cambio** en IndexedDB: cerrar o recargar la app no pierde nada; al volver se retoma.
- Solo puede haber **una sesión en curso** a la vez (al empezar otra, la anterior se cierra con aviso).

### 4.3 Historial (`#/historial`)
- Lista agrupada por mes: fecha, día, nº de ejercicios, volumen total (Σ peso × reps × series).
- Detalle (`#/historial/:id`): ejercicio a ejercicio con todas las series (peso y reps de cada una), notas y volumen; botones **editar** y **eliminar**.
- Estadísticas ligeras: sesiones en los últimos 30 días, volumen total, racha.

### 4.4 Rutinas (`#/rutinas`) y editor (`#/rutinas/:id`)
- Lista con nº de días/ejercicios; acciones: editar, **clonar**, archivar, eliminar.
- **Clonar rutina**: deep clone con todos los ids nuevos y `sourceRoutineId` apuntando al original; nombre "Copia de …" editable.
- Editor en 3 niveles: días → ejercicios → **series planeadas**, donde **cada serie se edita individualmente** (peso objetivo opcional + reps + nota), con añadir/eliminar/reordenar series, reordenar ejercicios y días.
- **Selector de ejercicio con autocompletado**: escribe y elige uno del catálogo (vincula
  por `exerciseId`) o crea uno nuevo con «＋ Crear …» — se guarda en el catálogo. Al salir
  del campo, el nombre/grupo se propaga al catálogo y al resto de rutinas.
- Selector de **rutina "activa"** para el cálculo del día sugerido.

### 4.5 Ejercicios (`#/ejercicios`) — catálogo
- Lista de todos los ejercicios con grupo muscular y nº de rutinas que lo usan.
- Buscador, crear nuevos, editar (renombrar/reagrupar con propagación) y quitar del catálogo
  (las rutinas y sesiones conservan sus datos).
- **Sembrado automático**: si el catálogo está vacío pero hay rutinas, se rellena con sus
  ejercicios y se vinculan por id en la primera carga.

### 4.6 Ajustes (`#/ajustes`)
- Unidad kg/lb.
- Editar los 6 presets de descanso.
- **Exportar backup** (JSON descargado) / **Importar backup** (restaurar — incluye
  rutinas, catálogo de ejercicios, sesiones y ajustes). Base de la fase 2 con Google Drive.
- Borrar todos los datos, versión, instrucciones de instalación PWA.

## 5. Lógica clave (servicios puros, testeadas)

- `matchesExercise(a, b)`: identidad de ejercicios — si ambos lados tienen `exerciseId`,
  comparación **por id**; si no, fallback al nombre normalizado (datos antiguos).
- `findPreviousSession(sessions, ref, options)`: última sesión completada anterior que
  contenga el ejercicio (por id o nombre). Devuelve `date` para "hace N días" / "semana pasada".
- `prefillSetsByIndex(plannedSets, previousSets)`: emparejamiento **serie i ↔ serie i**.
- Catálogo (`services/catalog.ts`): `findExercise` (nombre normalizado),
  `pickOrCreateExercise` (nunca duplica), `seedCatalogFromRoutines` y
  `linkRoutinesToCatalog` (vinculado automático de datos antiguos).
- `cloneRoutine(routine)`, `suggestNextDay(routine, history)`, `volumeOf(session)`,
  `streak(sessions)`.

## 6. Diseño

- **Mobile-first**, tema **oscuro** con acento de alto contraste (lima/eléctrico), tipografía del sistema (cero descargas de fuentes).
- **Tab bar inferior** fija (Hoy · Rutinas · Ejercicios · Historial · Ajustes); en modo sesión se sustituye por la barra de acciones de la sesión.
- Tarjetas redondeadas, sombras sutiles, **targets táctiles ≥ 44 px**, inputs numéricos grandes con `inputmode="decimal"`.
- Fila de serie en modo sesión con las 3 columnas (Plan · Ant. · Hoy) legibles en pantallas de 360 px; en móvil estrecho, Plan y Ant. se apilan en línea secundaria compacta.
- Microinteracciones: checkbox con animación, barra de progreso del día, cronómetro flotante.
- Modo sesión pensado para usar con una mano y sin mirar de cerca.

## 7. Estructura del proyecto

```
PLAN.md                    # este plan
index.html
vite.config.ts             # plugin-pwa, base desde BASE_PATH
vitest.config.ts
.github/workflows/deploy.yml
scripts/generate-icons.mjs # generador de iconos PNG (sin dependencias)
public/icons/              # iconos maskable para manifest
src/
  main.tsx                 # bootstrap + registro SW
  app.tsx                  # layout + tab bar + router
  router.ts                # hash router propio
  models.ts                # tipos (Exercise, PlannedSet, PerformedSet...)
  timer.ts                 # estado del cronómetro de descanso
  state.ts                 # estado global + mutaciones + persistencia
  db/
    idb.ts                 # wrappers idb-keyval (exercises/routines/sessions/settings)
  services/
    previousSession.ts     # identidad por id con fallback a nombre
    catalog.ts             # catálogo: buscar/crear, sembrado y vinculado
    prefill.ts             # emparejado serie↔serie
    session.ts             # construcción de sesión con prefill
    cloneRoutine.ts
    suggestDay.ts
    stats.ts
    backup.ts              # export/import JSON (incluye el catálogo)
    format.ts              # fechas/números es-ES
  views/
    Hoy.tsx
    Session.tsx
    History.tsx
    SessionDetail.tsx
    Routines.tsx
    RoutineEditor.tsx
    Exercises.tsx          # gestión del catálogo
    Settings.tsx
  components/
    BottomSheet.tsx
    ConfirmDialog.tsx
    RestControls.tsx
    SeriesRow.tsx
    ExercisePicker.tsx     # autocompletado: elegir existente o crear nuevo
  styles/
    tokens.css
    base.css
    components.css
tests/                     # vitest: comparación por id, catálogo, prefill, clonado, stats
README.md
```

## 8. Despliegue en GitHub Pages

- GitHub Actions: `npm ci && npm test && npm run build` → sube `dist/` a Pages.
- `BASE_PATH` en tiempo de build (`/nombre-repo/`) para subrutas.
- Router por **hash** → sin 404 en Pages.
- Manifest + service worker (precache del shell, `NetworkFirst` para navegación) → instalable y 100 % offline.

## 9. Fases de desarrollo (avanzamos a tu ritmo, fase a fase)

| Fase | Contenido | Entregable |
|---|---|---|
| **0. Cimiento** | Crear `PLAN.md`, Vite + Preact + TS, hash router, tema/tokens CSS, capa IndexedDB, tipos, plugin PWA, CI Pages, Vitest | App "hueca" navegable y desplegada en Pages |
| **1. Rutinas** | CRUD rutinas/días/ejercicios, **editor de series individuales** (peso+reps por serie), **clonar**, rutina activa | Puedo crear y clonar mis rutinas |
| **2. Sesión** | Modo entrenamiento: prefill serie↔serie, comparación Plan/Ant./Hoy por serie, checks, notas, series extra, atajos de relleno, cronómetro con presets, persistencia incremental, finalizar | Núcleo de la app funcionando |
| **3. Historial y datos** | Lista/detalle/edición de sesiones, métricas y racha, ajustes (unidad, presets), export/import JSON | Ciclo completo de datos |
| **4. Pulido y salida** | Diseño fino y microinteracciones, iconos, instalabilidad, offline real, README, tests de lógica | **v1 publicada** |

Fase 2 futura (no incluida): sincronización opcional con Google Drive — `db` + `backup.ts` queda diseñado como puente para añadir un `StorageAdapter` sin tocar la UI.

## 10. Riesgos y decisiones tomadas

- **Identidad de ejercicios**: resuelta con **catálogo + `exerciseId` estable** (fase «catálogo").
  Los datos antiguos sin id siguen funcionando por nombre normalizado hasta que se editen
  (o hasta el sembrado/vinculado automático en la primera carga).
- **Mapeo por índice serie↔serie**: es lo más simple y predecible; si cambia el nº de series entre semanas se marca qué series no tienen previos.
- **Edición de sesiones pasadas**: permitida desde el historial (reabrir la sesión); la comparación usa la última sesión *completada* anterior.
- **IndexedDB vs localStorage**: IndexedDB por el volumen de sesiones con series y notas (límite ~5 MB en localStorage).
- Una sola sesión en curso a la vez (modelo simple, sin confusiones).

---

**Modo de trabajo**: este `PLAN.md` se actualiza con cada cambio acordado; el desarrollo avanza fase a fase cuando tú lo indiques.
