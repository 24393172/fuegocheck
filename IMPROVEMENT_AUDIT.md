# IMPROVEMENT AUDIT — Fuego & Seguridad

> Auditoría técnica honesta basada en el código real (post-refactor a Excel +
> mail composer). Cada punto indica: **qué es**, **dónde**, **por qué es un
> problema** y **cómo resolverlo**. Sin relleno genérico.
>
> Nota de contexto: este proyecto **no tiene backend ni base de datos remota**.
> Es una app offline con SQLite local. Las secciones "Backend" y "Base de datos"
> se refieren a la **capa de repositorios y al SQLite local**, no a un servidor.

---

## FRONTEND

### Performance

**1. La barra de progreso recalcula sobre ~90 campos en cada pulsación de tecla**
- **Dónde:** `app/inspection/[id]/fill.tsx` — `useWatch({ control })` (~línea 80) + `computeProgress()` (~línea 270, en el render).
- **Por qué:** `useWatch` re-renderiza el contenedor `FillScreen` en cada cambio de cualquier campo, y `computeProgress` recorre todas las secciones/campos cada vez (O(n) por keystroke). Los hijos están memoizados, así que no re-renderizan, pero el cálculo corre igual. Con 90 campos es tolerable, no gratis.
- **Cómo:** envolver el resultado en `useMemo` dependiente de `watchedValues`, o recalcular solo en `onBlur` de cada campo en vez de en cada tecla.

**2. `getAllInspections()` hace `SELECT *` (incluye el `form_data` completo) en cada focus de pantalla**
- **Dónde:** `lib/repositories/inspections.repo.ts:45-48`; consumido en `app/(tabs)/index.tsx` y `app/(tabs)/history.tsx` dentro de `useFocusEffect`.
- **Por qué:** la lista solo necesita ~6 columnas (cliente, ubicación, fecha, técnico, estado, created_at), pero se trae el JSON `form_data` (que puede ser grande: 90 campos) de **todas** las inspecciones, **cada vez** que entras a la pestaña. Con cientos de registros esto carga MB innecesarios a memoria repetidamente.
- **Cómo:** crear `getInspectionsForList()` que haga `SELECT id, client_name, location, technician_name, status, created_at FROM inspections ORDER BY created_at DESC`. Reservar `SELECT *` para cuando se abre una inspección concreta.

**3. `xlsx` se incluye en el bundle aunque solo se use al exportar/compartir**
- **Dónde:** `import * as XLSX from 'xlsx'` en `lib/excel-generator.ts:1`.
- **Por qué:** SheetJS es una librería pesada (cientos de KB). Se carga al iniciar la app aunque el técnico genere Excel solo al final del flujo.
- **Cómo:** import dinámico — `const XLSX = await import('xlsx')` dentro de las funciones de generación. Reduce el tiempo de arranque.

**4. Las firmas se previsualizan desde un data-URI base64 grande**
- **Dónde:** `components/forms/SignatureField.tsx:95` (`source={{ uri: signature.image_base64 }}`) y `pdf-preview` (email body embebe el base64 completo).
- **Por qué:** decodificar base64 grande en un `<Image>` es más costoso que leer un archivo. Además infla el HTML del correo.
- **Cómo:** guardar la firma como archivo PNG (igual que las fotos) y referenciar por `uri` de archivo; en SQLite guardar solo la ruta. (Ver Base de Datos #3.)

### UX/UI

**5. La inspección creada no permite corregir la ubicación**
- **Dónde:** `app/inspection/new.tsx` captura `location`, pero `schemas/pump-form.schema.ts` (pump_v2) no tiene ningún campo de ubicación.
- **Por qué:** si el técnico se equivoca en la dirección, no hay forma de corregirla en la app. Queda mal en el Excel y el correo para siempre.
- **Cómo:** agregar campo `ubicacion` al schema (que se pre-llene desde `location`) o una pantalla de edición. (Pendiente por decisión del cliente.)

**6. Si el autosave falla, el usuario nunca se entera**
- **Dónde:** `app/inspection/[id]/fill.tsx` llama `setSaveError(...)` en el catch del autosave, pero `saveError` **no se renderiza en ninguna parte**. Solo se muestra el badge `isSaving`.
- **Por qué:** un fallo de guardado (almacenamiento lleno, permiso) es silencioso. El técnico cree que su trabajo se guardó cuando no fue así. En una app que reemplaza papel, perder datos es el peor escenario.
- **Cómo:** renderizar un banner rojo cuando `saveError !== null` (ya está en el store `inspection.store.ts`, solo falta mostrarlo).

**7. El nombre del archivo/ruta `pdf-preview` es engañoso**
- **Dónde:** `app/inspection/[id]/pdf-preview.tsx`.
- **Por qué:** ya no genera PDF; es la pantalla de detalle/compartir. Confunde a quien mantenga el código.
- **Cómo:** renombrar a `share.tsx` o `detail.tsx` y actualizar las 3 referencias en `_layout.tsx`, `index.tsx`, `history.tsx`.

**8. Los Sí/No/N/A se distinguen principalmente por color**
- **Dónde:** `components/forms/YesNoNaField.tsx:10-14` (verde/rojo/gris).
- **Por qué:** accesibilidad — un técnico daltónico (≈8% de hombres) distingue mal verde de rojo. Hay texto "Sí/No", lo que mitiga, pero el estado activo se comunica solo con color de fondo.
- **Cómo:** agregar un ícono o un borde/peso distinto al botón seleccionado además del color.

**9. La fecha no se ve en el formulario**
- **Dónde:** la fecha se genera en `new.tsx` y se quitó del schema; solo aparece en la pantalla de detalle y el Excel.
- **Por qué:** el técnico no ve qué fecha quedó registrada mientras llena la inspección. Si la inspección se llena en varios días, puede no coincidir con su expectativa.
- **Cómo:** mostrar la fecha (solo lectura) en el encabezado del formulario `fill.tsx`.

### Código

**10. Lógica de armado del reporte duplicada entre Excel y correo**
- **Dónde:** `app/inspection/[id]/pdf-preview.tsx` → `buildEmailBody()` y `lib/excel-generator.ts` → `generateInspectionExcel()`. Ambos: iteran secciones, saltan `firmas/firma/evidencia_fotografica`, mapean `si/no/na`, e incluyen comentarios `_comentario`.
- **Por qué:** dos copias de la misma lógica. Si cambias el formato del reporte, tienes que tocar dos lugares y es fácil que diverjan.
- **Cómo:** extraer un helper `buildReportRows(inspection)` en `lib/` que ambos consuman.

**11. El mapeo `si/no/na → etiqueta` está repetido en 3+ lugares**
- **Dónde:** `excel-generator.ts:yesNoNaLabel`, `pdf-preview.tsx` (inline en buildEmailBody), `YesNoNaField.tsx` (OPTIONS).
- **Cómo:** un único `lib/yes-no-na.ts` con el mapeo y reutilizarlo.

**12. Colores hardcodeados en cada StyleSheet; `constants/colors.ts` no existe**
- **Dónde:** `#1e3a5f` aparece repetido en ~10 archivos. `CLAUDE.md` y `ARCHITECTURE.md` mencionan `constants/colors.ts`, pero el archivo **no existe**.
- **Por qué:** cambiar la identidad visual obliga a un find-and-replace frágil; inconsistencias garantizadas con el tiempo.
- **Cómo:** crear `constants/colors.ts` con la paleta (`navy`, `green`, `red`, `gray...`) y reemplazar los literales.

---

## BACKEND (capa de repositorios + SQLite local)

> Recordatorio: no hay servidor. Estos puntos aplican a `lib/repositories/*` y `lib/db.ts`.

### Performance

**13. `updateInspection` construye SQL dinámico desde `Object.keys()`**
- **Dónde:** `lib/repositories/inspections.repo.ts:50-60`.
- **Por qué:** si alguien pasa un `fields` con una key que no es columna real, el SQL revienta en runtime. Las keys hoy vienen de código controlado (no de input de usuario), así que **no es inyección**, pero es frágil y sin validación.
- **Cómo:** o validar las keys contra una lista blanca de columnas, o usar updates explícitos por campo.

**14. `ORDER BY created_at DESC` sin índice**
- **Dónde:** `inspections.repo.ts:47` (`getAllInspections`).
- **Por qué:** SQLite hace scan completo + ordenamiento en memoria cada vez. Irrelevante con 20 filas, costoso con miles (y se llama en cada focus, ver #2).
- **Cómo:** `CREATE INDEX idx_inspections_created ON inspections(created_at DESC)`.

### Seguridad

**15. Correo destinatario hardcodeado (y es un Hotmail personal)**
- **Dónde:** `constants/config.ts` → `recipientEmail: 'hector13-zalo@hotmail.com'`.
- **Por qué:** está en el código fuente (no es secreto crítico, pero queda en el APK). Cambiar de secretaria o usar un correo corporativo obliga a recompilar. Un hotmail personal resta profesionalismo en la entrega.
- **Cómo:** moverlo a Ajustes (configurable por un administrador) o al menos a un correo de empresa. El cliente lo pidió fijo, así que documentado como decisión.

**16. `JSON.parse(form_data)` sin protección en la pantalla de detalle**
- **Dónde:** `pdf-preview.tsx` → `buildEmailBody()` y `inspectionDate()` hacen `JSON.parse(inspection.form_data)` sin try-catch. (En `excel-generator.ts` y `fill.tsx` sí está protegido.)
- **Por qué:** un registro con `form_data` corrupto crashea la pantalla de detalle al abrirla, sin mensaje útil.
- **Cómo:** reutilizar un helper `parseFormData()` defensivo (ya existe uno en `excel-generator.ts`; conviene moverlo a `lib/` y compartirlo).

✅ **Lo que está bien:** todo el SQL usa parámetros `?` (sin inyección de valores). No hay credenciales sensibles tras eliminar EmailJS. No hay datos de terceros expuestos.

### Arquitectura

**17. `APP_VERSION` está duplicado en tres lugares**
- **Dónde:** `constants/config.ts` (`'1.0.0'`), `app.json` (`version`), `package.json` (`version`).
- **Por qué:** se desincronizan; el "Versión" que ve el usuario en Ajustes puede no coincidir con el build.
- **Cómo:** leer la versión de `expo-constants` (`Constants.expoConfig.version`) y eliminar la constante manual.

---

## BASE DE DATOS (SQLite local)

**18. Faltan índices en las foreign keys**
- **Dónde:** `lib/db.ts` — tablas `photos` y `signatures`. Las queries `WHERE inspection_id = ?` (en `photos.repo.ts:34`, `signatures.repo.ts:32`) hacen scan completo.
- **Por qué:** sin índice, cada lectura de fotos/firmas de una inspección escanea toda la tabla. Con pocas filas no se nota; con miles, sí.
- **Cómo:**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_photos_inspection ON photos(inspection_id);
  CREATE INDEX IF NOT EXISTS idx_signatures_inspection ON signatures(inspection_id);
  ```

**19. Las foreign keys son decorativas (`PRAGMA foreign_keys` está OFF)**
- **Dónde:** `lib/db.ts` declara `REFERENCES inspections(id)` pero nunca activa `PRAGMA foreign_keys = ON`.
- **Por qué:** SQLite ignora las FK por defecto. No hay integridad referencial real; si un borrado falla a medias, quedan filas huérfanas. Hoy se compensa con `deleteInspectionCompletely()` manual.
- **Cómo:** `await database.execAsync('PRAGMA foreign_keys = ON;')` al inicializar, e idealmente `ON DELETE CASCADE` en las FK.

**20. Las firmas se guardan como base64 dentro de la tabla**
- **Dónde:** `signatures.image_base64` (`db.ts`, `signatures.repo.ts`).
- **Por qué:** un base64 de firma pesa decenas de KB. `SELECT * FROM signatures` los trae completos. La BD crece rápido y los blobs grandes degradan las lecturas.
- **Cómo:** guardar la firma como archivo PNG en `documentDirectory/inspections/{id}/` y almacenar solo la ruta en SQLite (consistente con cómo ya se manejan las fotos).

**21. Sin `journal_mode = WAL`**
- **Dónde:** `lib/db.ts`.
- **Por qué:** WAL mejora el rendimiento de escritura concurrente (autosave dispara muchos writes). Con el modo por defecto (DELETE) cada commit es más lento.
- **Cómo:** `PRAGMA journal_mode = WAL;` en la inicialización.

---

## CÓDIGO GENERAL

### Deuda técnica
- **`expo-file-system/legacy`** usado en todo el proyecto (`photo-manager.ts`, `excel-generator.ts`, `settings-manager.ts`, `pdf-preview.tsx`). API deprecada en SDK 54; migración futura obligatoria y debe ser total, no parcial.
- **`stubs/react-native-worklets/`**: parche local para reanimated. Frágil ante updates.
- **`ARCHITECTURE.md` desactualizado**: aún describe generación de PDF y EmailJS, que ya no existen. Induce a error a quien lo lea.

### Duplicación
- Ver #10 (Excel vs correo) y #11 (mapeo si/no/na). Son las duplicaciones reales más claras.

### Manejo de errores
- **`saveError` nunca se muestra** (#6) — el más importante.
- **Catches silenciosos:** `FileSystem.deleteAsync(...).catch(() => {})` en `pdf-preview.tsx` (limpieza de temporales). Aceptable para limpieza, pero no deja rastro si el disco se llena de basura.
- **`console.error` como único logging:** correcto para desarrollo; en producción no hay forma de saber qué falló en el teléfono del técnico. Considerar un log local a archivo para soporte.

### Testing
- **Cero tests.** No hay framework configurado (ni Jest, ni `npm test`). Para una app de inspecciones de seguridad, como mínimo deberían existir:
  - Test de `generateInspectionExcel` / `generateMasterExcel` (que el Excel tenga las filas/columnas correctas).
  - Test de la lógica de validación de `fill.tsx` (qué bloquea y qué no).
  - Test de `deleteInspectionCompletely` (que no deje huérfanos).

### Variables de entorno y configuración
- No hay `.env` ni `app.config.js`. La config (`recipientEmail`, versión) está en código fuente. Para un solo cliente es tolerable, pero impide tener entornos (prueba vs producción) sin editar archivos.

---

## ESCALABILIDAD

> "10x usuarios" no aplica: es una app mono-dispositivo, mono-usuario, sin
> servidor. El eje real de escala es **10x inspecciones** y **10x fotos** en un
> mismo teléfono.

**Cuellos de botella actuales:**

1. **`getAllInspections()` en cada focus (#2).** Es el cuello principal. Con
   cientos de inspecciones, cada vez que entras a Inicio o Historial se cargan
   todos los `form_data` JSON a memoria. Con miles, la pestaña se siente lenta.

2. **`generateMasterExcel()` construye todo en memoria.** `lib/excel-generator.ts`
   arma el workbook completo con todas las inspecciones y lo serializa a base64.
   Con miles de filas × 90 columnas, el consumo de RAM puede provocar crashes en
   teléfonos de gama baja.

3. **Crecimiento de almacenamiento.** Cada inspección guarda fotos comprimidas
   (~150-300 KB c/u) en `documentDirectory` + firmas base64 en SQLite. Cientos
   de inspecciones = cientos de MB sin límite ni limpieza automática (solo
   borrado manual). En un teléfono con poco espacio, la app puede dejar de poder
   guardar fotos.

**Qué se rompería con 10x datos:** historial lento, exportación maestra pesada o
con crash, y posible agotamiento de almacenamiento. Mitigaciones: lista con
columnas selectivas (#2), índices (#18), exportación por lotes/rango de fechas en
vez de "todo", y una política de archivado/borrado de inspecciones antiguas.

---

## QUICK WINS (alto impacto, poco esfuerzo)

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|----------|
| QW1 | ✅ HECHO — **Mostrar `saveError`** al usuario (banner rojo). También se agregó flush del autosave pendiente al salir de la pantalla. | `fill.tsx` | S |
| QW2 | ✅ HECHO — **`parseFormData()` defensivo** compartido en `lib/form-data.ts`. | `pdf-preview.tsx` | S |
| QW3 | ✅ HECHO — **Índices** en `photos.inspection_id`, `signatures.inspection_id` y `inspections.created_at`. | `db.ts` | S |
| QW4 | ✅ HECHO — **`PRAGMA foreign_keys = ON` + `journal_mode = WAL`**. | `db.ts` | S |
| QW5 | **`constants/colors.ts`** y reemplazar `#1e3a5f`. | nuevo + varios | S |
| QW6 | ✅ HECHO — **Lista con columnas selectivas** (`getInspectionsForList` + `getInspectionCounts`, tipo `InspectionListItem`). | `inspections.repo.ts` | S |
| QW7 | **Versión desde `expo-constants`** (eliminar duplicado). | `config.ts`, `settings.tsx` | S |
| QW8 | ✅ HECHO — **Lazy import de `xlsx`**. | `excel-generator.ts` | S |
| QW9 | **Renombrar `pdf-preview.tsx` → `share.tsx`** (+3 referencias). | varios | S |
| QW10 | **Mostrar la fecha (solo lectura)** en el encabezado del formulario. | `fill.tsx` | S |
| QW11 | **Helper único `si/no/na`** y reutilizarlo. | nuevo + 3 archivos | S |
| QW12 | **Actualizar `ARCHITECTURE.md`** (quitar PDF/EmailJS). | doc | S |

**Orden recomendado para empezar:** QW1 (evita pérdida de datos silenciosa) →
QW2 (evita crash) → QW3+QW4 (robustez de BD barata) → el resto.
