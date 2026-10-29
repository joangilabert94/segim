# Plan de desarrollo — PWA de control de rutinas de gimnasio

> Documento vivo. Cada cambio acordado se refleja aquí antes de tocar código.
>
> **Estado (29 oct 2026): v0.9.0.** Fases 0–4 completadas, catálogo de ejercicios, revisión
> de robustez, **fase 2: copia de seguridad en Google Drive** (manual o automática, con
> retardos), **renombrado de la app a Segim** e **iconos rediseñados** (PNG + SVG con
> generador propio). v0.9.0 añade la **fase 6, entrenamiento guiado** (§9.2): lastrados,
> asistidos y unilaterales, progresión doble, récords al finalizar y series semanales por
> grupo muscular. Verificado: `npm run typecheck` ✓ · `npm test` (250 tests) ✓ ·
> `npm run build` ✓ (PWA offline instalable). Incluye la **política de privacidad**
> pública (`/segim/privacidad.html`) que Google exige para publicar la app. El despliegue
> va por etiqueta de versión (`v0.9.0`).

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
  load?: 'external' | 'bodyweight' | 'assisted'; // sin definir = external (§9.2)
  unilateral?: boolean;    // se registra «por lado»
  increment?: number;      // incremento propio de la progresión doble
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
  theme: 'auto' | 'light' | 'dark';
  autoBackup: boolean;
  progressionIncrement: number; // 2,5 por defecto
  bodyweight?: number;          // peso corporal actual, opcional
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
- Al iniciar desde un día de rutina: se crean las `SessionEntry` con **una `PerformedSet` por cada `PlannedSet`**, y **se pre-rellena serie a serie** con el resultado más exigente de esa serie en las **últimas 8 semanas** que alcance el plan en peso **y** reps a la vez; si ninguno lo alcanza, con el plan. Nunca se combina el peso de un día con las reps de otro, y un récord antiguo no vuelve tras un parón. *Actualizar plan* (editor) aplica la misma regla.
- **Comparación por serie** (la fila de cada serie muestra tres columnas):
  - **Plan**: `60 kg × 8` (de la serie i de la rutina),
  - **Anterior**: `62 kg × 8` + fecha relativa ("hace 4 días" / "semana pasada"), de la serie i de la sesión anterior,
  - **Hoy**: dos inputs editables (peso y reps) precargados con la sugerencia anterior.
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
- **Progresión doble** (§9.2): la serie que sube respecto a la sesión anterior se marca con
  `↑ +2,5`. Al finalizar, aviso con los **récords** de la sesión; si no hay ninguna serie
  marcada, se pide confirmación antes de finalizar.

### 4.3 Historial (`#/historial`)
- Lista agrupada por mes: fecha, día, nº de ejercicios, volumen total (Σ peso × reps × series).
- Detalle (`#/historial/:id`): ejercicio a ejercicio con todas las series (peso y reps de cada una), notas y volumen; botones **editar** y **eliminar**, y **fecha de realización editable** (input de fecha que reordena el historial).
- Estadísticas ligeras: sesiones en los últimos 30 días, volumen total, racha.
- **Series por grupo muscular** de la semana (lunes a domingo), con navegación entre semanas
  y la diferencia con la anterior.
- El detalle muestra la tarjeta 🏆 con los **récords** de esa sesión, agrupados por ejercicio.

### 4.4 Rutinas (`#/rutinas`) y editor (`#/rutinas/:id`)
- Lista con nº de días/ejercicios; acciones: editar, **clonar**, archivar, eliminar.
- **Clonar rutina**: deep clone con todos los ids nuevos y `sourceRoutineId` apuntando al original; nombre "Copia de …" editable.
- Editor en 3 niveles: días → ejercicios → **series planeadas**, donde **cada serie se edita individualmente** (peso objetivo opcional + reps + nota), con añadir/eliminar/reordenar series, reordenar ejercicios y días.
- **Selector de ejercicio con autocompletado**: escribe y elige uno del catálogo (vincula
  por `exerciseId`) o crea uno nuevo con «＋ Crear …» — se guarda en el catálogo. Al salir
  del campo con un nombre nuevo, si el ejercicio tenía historial o lo usaban otras rutinas
  se **sustituye** por uno nuevo (renombrarlo le pasaría ese historial); si solo lo usaba
  esa entrada (p. ej. una errata) se renombra. Renombrar en todas partes se hace desde
  la pestaña Ejercicios.
- Selector de **rutina "activa"** para el cálculo del día sugerido.

### 4.5 Ejercicios (`#/ejercicios`) — catálogo
- Lista de todos los ejercicios con grupo muscular y nº de rutinas que lo usan.
- Buscador, crear nuevos, editar (renombrar/reagrupar con propagación) y quitar del catálogo
  (las rutinas y sesiones conservan sus datos).
- **Sembrado automático**: si el catálogo está vacío pero hay rutinas, se rellena con sus
  ejercicios y se vinculan por id en la primera carga.
- En la ficha de cada ejercicio: **tipo de carga** (Normal, Peso corporal, Asistido), **por
  lado** e **incremento** propio de la progresión. La gráfica de progresión llama a la métrica
  de peso «Lastre» o «Asistencia» según el tipo.

### 4.6 Ajustes (`#/ajustes`)
- Unidad kg/lb.
- Editar los 6 presets de descanso.
- **Incremento de la progresión** (2,5 por defecto) y **peso corporal** opcional.
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
- `prefillFromHistory(plannedSets, history)` / `suggestFromHistory`: emparejamiento **serie i ↔ serie i**
  con la regla de la sugerencia (§4.2).
- Catálogo (`services/catalog.ts`): `findExercise` (nombre normalizado),
  `pickOrCreateExercise` (nunca duplica), `seedCatalogFromRoutines` y
  `linkRoutinesToCatalog` (vinculado automático de datos antiguos).
- `cloneRoutine(routine)`, `suggestNextDay(routine, history)`, `volumeOf(session)`,
  `streak(sessions)`.
- Fase 6 (§9.2): `services/load.ts` (perfil de carga: sentido, carga efectiva, formato
  PC±), `suggestExercise` (progresión doble), `sessionRecords` (récords) y
  `weeklySetsByGroup` (series semanales por grupo).

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
    load.ts                # tipo de carga: normal, peso corporal, asistido; por lado
    doubleProgression.ts   # progresión doble de las series con rango
    records.ts             # récords de una sesión frente al historial
    weeklyVolume.ts        # series semanales por grupo muscular
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
tests/                     # vitest (250): comparación por id, catálogo, prefill, clonado, stats, Drive
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
| **6. Entrenamiento guiado** (v0.9.0) | Lastrados, asistidos y unilaterales; progresión doble; récords al finalizar; series semanales por grupo muscular | La app propone qué levantar y celebra los récords |
| **7. Superseries** (siguiente versión) | Agrupar ejercicios que se alternan en la sesión | Pendiente de diseñar |

### 9.1 Fase 2 — Copia en Google Drive (v0.7.0)

Implementada como **copia de seguridad** (manual o automática), no como sincronización.

- **Qué se sube**: el mismo `BackupFile` del export/import (rutinas, catálogo, todas
  las sesiones —incluida la que está en curso— y ajustes). Nada más.
- **Cuándo se sube**: al pulsar *Subir ahora* y, si se activa la copia automática en
  Ajustes, al **terminar una sesión** (5 s de retardo) y al **editar** una sesión, una
  rutina o un ejercicio (20–30 s sin tocar nada, para que una ráfaga de cambios acabe en
  una sola subida). Una subida a la vez (cola). Sin token vigente no se pide en segundo
  plano (Google lo pide con una ventana emergente que el navegador bloquea sin un toque):
  se avisa con un botón *☁️ Subir ahora* que autoriza y sube en un toque. Las ediciones solo actualizan
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
  solo en memoria; renovarlo abre la ventana de Google (incluso con `prompt: 'none'`,
  comprobado), así que solo se pide desde un toque: *Subir ahora*, *Restaurar* o el botón
  del aviso de la copia automática.
- **Restaurar**: descarga, valida con `parseBackup` (una copia dañada se rechaza sin tocar
  los datos) y pide confirmación mostrando fecha y recuentos. Disponible también sin
  conexión previa (busca la copia por nombre), que es como se migra a un móvil nuevo.
- **Primera subida desde un dispositivo**: si Drive ya tiene una copia, no se sobrescribe;
  se avisa con su fecha y solo se sustituye si el usuario lo confirma (`replaceExisting`).
  Sin `folderId` guardado se reutiliza la carpeta de la app (la que contiene la copia, o
  cualquier `Segim`/`GymRutinas`) antes de crear otra.
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

### 9.2 Fase 6 — Entrenamiento guiado (v0.9.0)

**Tipo de carga y unilaterales** (por ejercicio, en el catálogo; las rutinas y el historial lo
leen por `exerciseId`, así que cambiarlo reinterpreta también el historial):

- `Exercise.load`: `external` (por defecto: barra, mancuernas, máquina), `bodyweight` (peso
  corporal; el peso de la serie es el **lastre**, 0 = sin lastre) o `assisted` (el peso de la
  serie es la **asistencia**: **menos es mejor**). Se muestra `60`, `PC`, `PC+10` y `PC−20`.
- `Exercise.unilateral`: la serie se registra una vez «por lado» (mismo peso y reps en los dos
  lados). Cuenta **doble en el volumen en kg** y **una vez** en las series semanales.
- **Peso corporal** opcional en Ajustes (`Settings.bodyweight`, un único valor actual). Con él,
  la carga efectiva de un lastrado es peso corporal + lastre y la de un asistido, peso corporal −
  asistencia; es la que usan el 1RM y el volumen en kg. Sin él, esos ejercicios no tienen 1RM
  ni volumen en kg.
- La comparación «más exigente» (mejores, sugerencia, progresión, récords) respeta el sentido:
  en asistidos gana la menor asistencia.

**Progresión doble** (solo series con rango, p. ej. 8-12):

- Si en la **última sesión** con el ejercicio **todas** sus series con rango llegaron al tope
  del rango con al menos el peso sugerido, la siguiente sugerencia sube **todas** esas series
  el incremento y vuelve al mínimo del rango. Si no, se mantiene el peso (sin descarga
  automática).
- Incremento: `Settings.progressionIncrement` (2,5 kg por defecto, editable en Ajustes) o
  `Exercise.increment` si el ejercicio tiene uno propio. En asistidos, el incremento **resta**
  asistencia (mínimo 0).
- Las series de reps fijas y las cronometradas no cambian de comportamiento. Un rango ya no
  se convierte en reps fijas cuando el mejor resultado lo supera: para eso está la subida.
- La sesión marca la serie con `↑ +2,5` cuando su peso es más exigente que el de la sesión
  anterior. *Actualizar plan* aplica la misma regla.

**Récords al finalizar** (contra todo el historial completado anterior, sin la propia sesión;
la primera vez que se hace un ejercicio no hay récord):

- **Peso máximo** (en asistidos, la menor asistencia), **1RM estimado** (carga efectiva),
  **más reps** con ese peso o uno más exigente, y **volumen del ejercicio** en la sesión
  (carga efectiva × reps, doble si es unilateral).
- Se calculan al vuelo (no se guardan): aviso al finalizar y tarjeta 🏆 en el detalle.

**Series semanales por grupo muscular** (pestaña Historial):

- Series hechas de sesiones completadas por grupo muscular (el del catálogo; sin grupo →
  «Sin grupo»), semana de lunes a domingo, con navegación entre semanas y comparación con
  la anterior.

**Datos existentes al actualizar a v0.9.0**:

- No hay migración: todos los ejercicios ya creados quedan como **Normal** y no unilaterales,
  y rutinas e historial se ven igual que antes.
- El tipo se cambia en Ejercicios → ✎ y se aplica a **todas** las rutinas y a **todo** el
  historial de ese ejercicio (solo cambia cómo se interpreta; volver a Normal lo deshace).
- Pasar a *Peso corporal* lee el peso guardado como **lastre**: correcto si se apuntaba 0;
  si se apuntaba el propio peso corporal, saldría como lastre y habría que corregir esas
  series a mano.
- Con el peso corporal en Ajustes, esos ejercicios empiezan a sumar 1RM y volumen en kg: el
  volumen de 30 días sube aunque no se haya entrenado más.
- *Por lado* duplica el volumen en kg también en el historial (las series semanales no
  cambian). Si se apuntaba cada lado como una serie aparte, ese volumen sale doble.
- Asistidas y lastradas del mismo movimiento van en **dos ejercicios distintos**: en uno
  menos peso es mejor y en el otro más, así que no pueden compartir progresión ni récords.

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
  gesto del usuario. La copia automática sube sola durante la hora que dura el token;
  después avisa con un botón para autorizar y subir en un toque, en lugar de abrir una
  ventana sin gesto previo.
- **Modo Testing de Google**: 100 usuarios y consentimiento cada 7 días hasta publicar y
  verificar la marca (con `drive.file` no hay auditoría de seguridad).
- **Multi-dispositivo**: sin merge; dos dispositivos comparten un único fichero y la
  última subida gana.
- **Datos fuera del dispositivo**: solo si el usuario conecta Drive; el token no se
  persiste y se puede revocar en cualquier momento.
- **Service worker**: no se cachean respuestas de Google; solo se precachean los
  estáticos del build.
- **Tipo de carga por ejercicio, no por sesión**: más simple y sin migración, a cambio de
  que cambiarlo reinterprete todo el historial del ejercicio.
- **Peso corporal único**: se usa el valor actual también para sesiones antiguas (no hay
  registro histórico del peso corporal).
- **Progresión doble**: solo series con rango, todas a la vez, desde la última sesión de las
  últimas 8 semanas y sin descarga automática si no se llega al tope.
- **Récords al vuelo**: se recalculan contra el historial (no se guardan), así que editar o
  borrar una sesión antigua puede cambiar los récords de las posteriores.

---

## 11. Estado del repositorio y pendientes

- **Versión**: `v0.9.0` — fase 6 (§9.2): ejercicios de peso corporal con lastre, asistidos
  y por lado, con peso corporal opcional en Ajustes; progresión doble en las series con
  rango (incremento general o por ejercicio); récords al finalizar (peso, 1RM, reps y
  volumen); series semanales por grupo muscular en Historial. Siguiente: superseries.
  El despliegue va por etiqueta: publicar `v0.9.0` actualiza GitHub Pages.
- **v0.8.5** — "Borrar todo" ya no sube una copia vacía a Drive; conectar un
  dispositivo nuevo no pisa la copia existente (Restaurar siempre visible, carpeta reutilizada);
  cambiar un ejercicio en el editor no lo renombra en toda la app; la sugerencia no mezcla
  peso y reps de días distintos y solo mira 8 semanas; la copia automática ofrece reautorizar
  con un toque; avisos al fallar un guardado; importación sin estado vacío; confirmación al
  finalizar sin series; Vite 8, Vitest 5, TypeScript 7, Preact 11 y Node 24 en CI.
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
- **Ideas propuestas y no elegidas (por ahora)**: RIR/RPE por serie, calculadora de discos,
  registro de peso corporal y medidas, descarga automática tras varias sesiones sin
  progresar, progresión en series de reps fijas y cronometradas, récords de tiempo, y avisos
  de fin de descanso en iPhone (iOS no vibra y el sonido necesita un toque previo).
- **Siguiente versión (después de v0.9.0)**: **superseries** (agrupar ejercicios que se
  alternan en la sesión).

---

**Modo de trabajo**: este `PLAN.md` se actualiza con cada cambio acordado; el desarrollo avanza fase a fase cuando tú lo indiques.
