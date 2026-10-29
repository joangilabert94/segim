# Plan de desarrollo — PWA de control de rutinas de gimnasio

> Documento vivo. Cada cambio acordado se refleja aquí antes de tocar código.
>
> **Estado (29 oct 2026): v0.8.3.** Fases 0–4 completadas, catálogo de ejercicios, revisión
> de robustez, **fase 2: copia de seguridad en Google Drive** (manual o automática, con
> retardos), **renombrado de la app a Segim** e **iconos rediseñados** (PNG + SVG con
> generador propio). Verificado: `npm run typecheck` ✓ · `npm test` (194 tests) ✓ ·
> `npm run build` ✓ (PWA offline instalable). Incluye la **política de privacidad**
> pública (`/segim/privacidad.html`) que Google exige para publicar la app. El despliegue
> va por etiqueta de versión (`v0.8.3`).

## 1. Objetivo

Aplicación PWA mobile-first para gestionar rutinas de gimnasio y registrar sesiones de entrenamiento: rutinas multi-día, modo "entrenamiento" con series/pesos/reps planeados vs. reales, comparación con la sesión anterior (progresión semana a semana), historial con fechas, clonado de rutinas y persistencia **local** (IndexedDB) con exportación/importación JSON. Desplegable en GitHub Pages y usable offline desde cualquier dispositivo.

Fase 2 (v0.7.0, ampliada en v0.8.0): copia de seguridad en el Google Drive del usuario, manual o automática (al cerrar sesión y, con retardo, al editar) — ver §9.1.

## 2. Stack técnico

| Capa | Elección | Por qué |
|---|---|---|
| Build | **Vite + TypeScript** | Arranque instantáneo, build estático perfecto para Pages |
| UI | **Preact** (~4 KB) + JSX | React-like sin peso; suficiente para una app de 5-6 pantallas |
| Router | **Hash router propio** (~30 líneas: `#/hoy`, `#/sesion`) | Cero dependencias; funciona en GitHub Pages sin config de servidor |
| Persistencia | **IndexedDB** con `idb-keyval` (~600 B) + repositorios tipados propios | Offline total, sin backend; suficiente para cientos de sesiones |
| Estilos | **CSS moderno propio** (custom properties, grid, `clamp()`) | Sin framework; tema oscuro mobile-first, control total del diseño |
| PWA | **`vite-plugin-pwa`** (Workbox `generateSW`) | Manifest + cache del shell para offline e instalable, configuración mínima |
| Copia en la nube (opcional) | **Drive API v3 + Google Identity Services** por `fetch` | Copia en el Drive del usuario sin backend, sin SDK y con permiso por fichero |
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
  date: string;          // YYYY-MM-DD: fecha de realización (editable, única marca temporal)
  routineId?: string;
  dayId?: string;
  dayName: string;       // copia del nombre del día (la rutina puede cambiar)
  status: 'in-progress' | 'completed';
  entries: SessionEntry[]; // SIN duración: no se guarda ni arranque ni final
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
- **Fecha editable**: la cabecera tiene un botón 📅 para cambiar la fecha de realización de la sesión en curso (la sesión no guarda duración: sin marcar arranque/final).
- Solo puede haber **una sesión en curso** a la vez (al empezar otra, la anterior se cierra con aviso).

### 4.3 Historial (`#/historial`)
- Lista agrupada por mes: fecha, día, nº de ejercicios, volumen total (Σ peso × reps × series).
- Detalle (`#/historial/:id`): ejercicio a ejercicio con todas las series (peso y reps de cada una), notas y volumen; botones **editar** y **eliminar**, y **fecha de realización editable** (input de fecha que reordena el historial).
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
  rutinas, catálogo de ejercicios, sesiones y ajustes).
- **Copia en Google Drive** (opcional): conectar/desconectar, *Subir ahora* y *Restaurar*,
  más el ajuste **copia automática** (por defecto, desactivado) al terminar una sesión o al
  editar una sesión, rutina o ejercicio. Deja `segim-backup.json` (última) y las 10
  copias fechadas más recientes.
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

- **Mobile-first**, tema **oscuro** con acento de alto contraste (lima/eléctrico), tipografía del sistema (cero descargas de fuentes). *(Posteriormente se añadió el tema **claro**, con selector Automático/Claro/Oscuro en Ajustes.)*
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
public/icons/              # iconos PNG (normal y maskable) + icon.svg de la pestaña
src/
  main.tsx                 # bootstrap + registro SW
  app.tsx                  # layout + tab bar + router
  router.ts                # hash router propio
  models.ts                # tipos (Exercise, PlannedSet, PerformedSet...)
  timer.ts                 # estado del cronómetro de descanso
  state.ts                 # estado global + mutaciones + persistencia
  db/
    idb.ts                 # wrappers idb-keyval (exercises/routines/sessions/settings)
    driveStore.ts          # metadatos de la conexión con Drive (fileId, última subida)
  services/
    previousSession.ts     # identidad por id con fallback a nombre
    catalog.ts             # catálogo: buscar/crear, sembrado y vinculado
    prefill.ts             # emparejado serie↔serie
    session.ts             # construcción de sesión con prefill
    cloneRoutine.ts
    suggestDay.ts
    stats.ts
    backup.ts              # export/import JSON + contrato BackupTarget
    drive/
      api.ts               # Drive v3 por REST: subir, descargar, listar, borrar
      auth.ts              # Google Identity Services: token en memoria (~1 h)
      target.ts            # BackupTarget: última copia + 10 fechadas con rotación
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
tests/                     # vitest (194): comparación por id, catálogo, prefill, clonado, stats, Drive
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
| **5. Google Drive** (v0.7.0) | OAuth con Google Identity Services, cliente REST, copia visible + 10 fechadas con rotación, restauración validada | Copia de seguridad en la nube (manual o automática) |

### 9.1 Fase 2 — Copia en Google Drive (v0.7.0)

Implementada como **copia de seguridad** (manual o automática), no como sincronización.

- **Qué se sube**: el mismo `BackupFile` del export/import (rutinas, catálogo, todas
  las sesiones —incluida la que está en curso— y ajustes). Nada más.
- **Cuándo se sube**: al pulsar *Subir ahora* y, si se activa la copia automática en
  Ajustes, al **terminar una sesión** (5 s de retardo) y al **editar** una sesión, una
  rutina o un ejercicio (20–30 s sin tocar nada, para que una ráfaga de cambios acabe en
  una sola subida). Una subida a la vez (cola), token pedido en silencio y, si Google
  exige interacción, aviso con la vía manual. Las ediciones solo actualizan
  `segim-backup.json`; las copias fechadas se crean al cerrar sesión o a mano, para
  que la rotación de 10 no expulse las de días anteriores.
- **Dónde**: carpeta `Segim` del Drive del usuario: `segim-backup.json` (la app se llamó
  antes GymRutinas: se sigue leyendo el `gymrutinas-backup.json` anterior y la marca interna
  del JSON no cambia, para no invalidar copias ya guardadas). La primera subida tras el
  cambio renombra la carpeta antigua a `Segim` y recuerda el nombre en `drive:meta`, así que
  solo hace esa petición una vez.
  (última copia, la que se restaura) y `copia-AAAA-MM-DD-HHmm.json` (se conservan las
  10 más recientes; el resto se borra al subir). Drive mantiene además el historial de
  versiones del fichero.
- **Permiso**: `https://www.googleapis.com/auth/drive.file`, **no sensible**: la app solo
  ve los ficheros que ella crea. Sin client secret y sin backend.
- **Sesión**: modelo token de Google Identity Services. El access token dura ~1 h y vive
  solo en memoria; se renueva con `prompt: 'none'` (sin UI) mientras el consentimiento
  siga vivo y, si Google exige interacción, al pulsar el botón.
- **Restaurar**: descarga, valida con `parseBackup` (una copia dañada se rechaza sin tocar
  los datos) y pide confirmación mostrando fecha y recuentos.
- **Sin mezcla de datos**: no hay merge ni resolución de conflictos; restaurar sustituye.
  (La copia automática añadida después solo **sube** al terminar una sesión o al editar;
  nunca restaura ni mezcla por su cuenta, así que este modelo no cambia.)
- **Metadatos**: `drive:meta` (fileId, carpeta, última subida) se guarda aparte y
  **sobrevive a "borrar todos los datos"**, para no duplicar ni sobrescribir el fichero
  remoto por accidente.
- **Configuración**: `VITE_GOOGLE_CLIENT_ID` en `.env.local` (local) y como variable del
  repositorio en el workflow de Pages. Orígenes autorizados:
  `https://joangilabert94.github.io` y `http://localhost:5173`.
- **Límites conocidos** (modo *Testing*): 100 usuarios de prueba y reautorización cada
  7 días; publicar y verificar la marca elimina ambos. La copia es **visible** en el Drive
  del usuario (la variante oculta con `drive.appdata` queda como opción futura).

## 10. Riesgos y decisiones tomadas

- **Identidad de ejercicios**: resuelta con **catálogo + `exerciseId` estable** (fase «catálogo").
  Los datos antiguos sin id siguen funcionando por nombre normalizado hasta que se editen
  (o hasta el sembrado/vinculado automático en la primera carga). Al cargar o importar una
  copia se fusionan los duplicados por nombre y se reparan los vínculos de rutinas y sesiones.
- **Mapeo por índice serie↔serie**: es lo más simple y predecible; si cambia el nº de series entre semanas se marca qué series no tienen previos.
- **Edición de sesiones pasadas**: permitida desde el historial (reabrir la sesión); la comparación usa la última sesión *completada* anterior.
- **IndexedDB vs localStorage**: IndexedDB por el volumen de sesiones con series y notas (límite ~5 MB en localStorage).
- Una sola sesión en curso a la vez (modelo simple, sin confusiones).
- **OAuth sin backend**: no hay refresh token; el token dura ~1 h y renovarlo exige un
  gesto del usuario. La copia manual sigue siendo la vía principal; la automática pide el
  token en silencio (`prompt: 'none'`) y, si Google exige interacción, avisa en lugar de
  abrir una ventana sin gesto previo.
- **Modo Testing de Google**: 100 usuarios y consentimiento cada 7 días hasta publicar y
  verificar la marca (con `drive.file` no hay auditoría de seguridad).
- **Multi-dispositivo**: sin merge; dos dispositivos comparten un único fichero y la
  última subida gana.
- **Datos fuera del dispositivo**: solo si el usuario conecta Drive; el token no se
  persiste y se puede revocar en cualquier momento.
- **Service worker**: no se cachean respuestas de Google; solo se precachean los
  estáticos del build.

---

## 11. Estado del repositorio y pendientes

- **Versión**: `v0.8.3` — iconos rediseñados, copia automática en Drive con retardos,
  renombrado de la app a Segim y política de privacidad pública. El despliegue va por
  etiqueta: publicar `v0.8.3` actualiza GitHub Pages.
- **Iconos**: generador propio sin dependencias (`npm run icons`) con antialiasing 4×4,
  mancuerna diagonal, sombra y exportación de `public/icons/icon.svg` para la pestaña.
- **Configuración local**: `VITE_GOOGLE_CLIENT_ID` en `.env.local` (ignorado por Git);
  en CI es una variable del repositorio. Sin ella, Ajustes muestra Drive "no configurado".
- **Caducidad de Google**: en modo Testing el consentimiento expira a los 7 días. Para
  salir de Testing: Branding completo, dominio `joangilabert94.github.io` verificado en
  Search Console, homepage y política de privacidad publicadas, y **Audience → Publish app**.
  Con `drive.file` (no sensible) no hay verificación de scopes; la de marca solo hace falta
  para que se vean nombre y logo en el consentimiento.
- **Decisiones aparcadas**: publicar y verificar la app en Google (quita Testing y los 7
  días), copias ocultas (`appDataFolder`) y más automatismos de subida.

---

**Modo de trabajo**: este `PLAN.md` se actualiza con cada cambio acordado; el desarrollo avanza fase a fase cuando tú lo indiques.
