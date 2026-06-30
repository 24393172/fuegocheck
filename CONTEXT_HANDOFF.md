# CONTEXT HANDOFF — Fuego & Seguridad

> Documento de traspaso para que una IA (o un desarrollador nuevo) continúe el
> proyecto desde cero sin contexto previo. Refleja el estado **real** del código
> a la fecha de la última sesión. Si editas el proyecto, actualiza este archivo.

---

## 1. Qué es el proyecto

App móvil **Android** para técnicos de inspección de sistemas contra incendio de
la empresa **Fuego y Seguridad**. Reemplaza los formularios de papel por
inspecciones digitales.

**Flujo del técnico:**
1. Crea una inspección del **sitio** (cliente + área + atención; el técnico y la
   fecha se toman solos).
2. En la pantalla índice elige qué **bomba** llenar: Jockey, Diésel o Eléctrica.
   Puede llenar varias, salir a medias y volver — cada bomba se guarda sola.
3. Toma una foto por bomba (opcional) y captura **una firma** para toda la visita.
4. Toca "Completar y Enviar" → valida firma + al menos una bomba con datos (avisa
   si alguna bomba quedó incompleta).
5. Llega a la pantalla de detalle → "Compartir por correo" → confirma (o "Editar").
6. Se abre Gmail con el **Excel (una hoja por bomba) + fotos + firma adjuntos** y
   el destinatario ya puesto. El técnico solo toca Enviar.

**Importante:** Es un proyecto de servicio social universitario. 4 meses, 2
desarrolladores junior. La meta es una app **estable y mantenible**, no un
producto de startup. Evitar patrones enterprise. Código simple y legible.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | React Native | 0.81.5 |
| Plataforma | Expo SDK | ~54.0.33 |
| Lenguaje | TypeScript (strict) | ~5.9.2 |
| Navegación | Expo Router (file-based) | ~6.0.23 |
| Estado UI | Zustand | ^5.0.13 |
| Formularios | react-hook-form | ^7.76.0 |
| Validación | Zod (instalado, **poco usado**) | ^4.4.3 |
| Base de datos | expo-sqlite (sin ORM) | ~16.0.10 |
| Archivos | expo-file-system (**API legacy**) | ~19.0.22 |
| Cámara | expo-image-picker | ~17.0.11 |
| Compresión foto | expo-image-manipulator | ~14.0.8 |
| Firma | react-native-signature-canvas | ^5.0.2 |
| Excel | xlsx (SheetJS) | ^0.18.5 |
| Correo | expo-mail-composer | ~15.0.8 |
| Compartir archivo | expo-sharing | ~14.0.8 |
| UI | react-native-paper + NativeWind | ^5.15.2 / ^4.2.4 |
| IDs | react-native-uuid | ^2.0.4 |

**No hay:** backend, servidor, API REST, autenticación, Firebase, base de datos
remota. Todo es local en el dispositivo. La sincronización ES el correo.

---

## 3. Estado actual

### ✅ Funciona (verificado: type check limpio + bundle de producción OK)
- Crear / editar / autosave de inspecciones de sitio (SQLite local).
- Inspección de **sitio con 3 bombas** (Jockey, Diésel, Eléctrica): pantalla
  índice + un formulario dinámico por bomba con barra de progreso.
- Captura de fotos por bomba (comprimidas a 800px/70%) y una firma por inspección.
- Validación: firma + al menos una bomba con datos; aviso suave si hay bombas
  incompletas.
- Excel individual con **una hoja por bomba**, en columnas como la hoja física
  (Pregunta · S · N/A · N · Parámetros · Lecturas · Comentarios). Maestro: una
  hoja por tipo de bomba.
- Pantalla de detalle: ver datos, compartir por correo (con confirmación),
  reenviar y eliminar inspección (con limpieza de archivos en disco).
- Exportar todas las inspecciones a un Excel desde Ajustes (expo-sharing).
- Dashboard con estadísticas e historial con filtros por estado.

### 🚧 Pendiente / no construido
- **Tests**: cero. No hay un solo test en el proyecto.
- **Logo de empresa**: el header es solo texto "Fuego & Seguridad".
- **Búsqueda por texto** en el historial (solo hay filtros por estado).
- **Edición de ubicación** tras crear la inspección (ver limitaciones abajo).
- **Date-picker**: no se construyó; la fecha es 100% automática (decisión del cliente).

### ⚠️ Limitaciones conocidas (por decisión, no bugs)
- **Datos del sitio no editables** después de crear la inspección. Cliente, área
  y atención se capturan en `new.tsx` y se guardan en `form_data.site`; no hay
  pantalla para corregirlos luego. El cliente eligió no agregar edición.
- **Correo destinatario configurable en Ajustes** (desde 2026-06-12). El valor
  de `constants/config.ts` es solo el default inicial; el vigente vive en
  `settings.json` (`lib/settings-manager.ts`) y se edita en la pestaña Ajustes.
- **Status `sent` optimista**: se marca como enviada *antes* de abrir el
  composer, porque Android no reporta si el correo se envió de verdad. Si el
  técnico cancela, puede reenviar desde la pantalla de detalle.

---

## 4. Estructura de archivos

> Raíz del repo: `FuegoSeg/` (docs). Raíz de la app: `FuegoSeg/fuego-seguridad/`.

### Documentación (raíz del repo)
| Archivo | Contenido |
|---------|-----------|
| `CLAUDE.md` | Contexto y reglas para Claude Code. **Léelo primero.** |
| `CONTEXT_HANDOFF.md` | Este archivo. |
| `IMPROVEMENT_AUDIT.md` | Auditoría de mejoras pendientes. |
| `PRD.md` | Requisitos de producto. |
| `ARCHITECTURE.md` | Decisiones técnicas (ADR-001 a ADR-008). Parcialmente desactualizado: ya no se usa PDF ni EmailJS. |

### App (`fuego-seguridad/`)
```
app/                              # Rutas (Expo Router, file-based)
  _layout.tsx                     # Root: inicializa DB, define el Stack
  (tabs)/
    _layout.tsx                   # Tabs: Inicio / Historial / Ajustes
    index.tsx                     # Dashboard: stats + recientes
    history.tsx                   # Historial con filtros por estado
    settings.tsx                  # Nombre técnico + "Exportar todo a Excel"
  inspection/
    new.tsx                       # Crear inspección del sitio (cliente + área + atención)
    [id]/
      index.tsx                   # ⭐ Índice: las 3 bombas + firma + completar/enviar
      fill.tsx                    # ⭐ Llenar UNA bomba (?pump=): autosave, progreso
      pdf-preview.tsx             # ⭐ Detalle/compartir + "Editar" (NOMBRE OBSOLETO)

components/
  forms/
    FormField.tsx                 # Renderiza text/number/textarea/yes_no_na + comentario
    YesNoNaField.tsx              # Botonera Sí/No/N/A
    PhotoField.tsx                # Captura de foto con cámara
    SignatureField.tsx            # Modal de firma táctil (WebView)
  ui/
    InspectionCard.tsx            # Tarjeta de inspección (memoizada)
    StatusBadge.tsx               # Badge: Borrador / Por enviar / Enviada
    SectionHeader.tsx             # Título de sección

lib/
  db.ts                           # Conexión SQLite + creación de tablas + migración
  excel-generator.ts             # ⭐ generateInspectionExcel + generateMasterExcel
  photo-manager.ts               # Compresión, guardado y borrado de fotos
  settings-manager.ts            # Persistencia de Ajustes (settings.json)
  uuid.ts                        # generateId() (UUID v4)
  repositories/
    inspections.repo.ts          # ⭐ CRUD + deleteInspectionCompletely (cascada)
    photos.repo.ts               # CRUD de fotos
    signatures.repo.ts           # CRUD de firmas

schemas/
  jockey-form.schema.ts          # ⭐ Bomba Jockey
  electrica-form.schema.ts       # ⭐ Bomba Eléctrica
  diesel-form.schema.ts          # ⭐ Bomba de Combustión Interna Diésel
  index.ts                       # Registro (PUMP_SCHEMAS) + getSchema()

store/
  inspection.store.ts            # Zustand: estado de guardado (isSaving, saveError)

types/
  inspection.types.ts            # Inspection, Photo, Signature, InspectionStatus
  form.types.ts                  # FormField, FormSection, FormSchema, FieldType

constants/
  config.ts                      # EMAIL_CONFIG.recipientEmail (default) + APP_VERSION
```

⭐ = archivos centrales que tocarás con más frecuencia.

---

## 5. Modelo de datos (SQLite local)

Tres tablas en `fuego_seguridad.db` (ver `lib/db.ts`):

```sql
inspections(
  id TEXT PK,              -- UUID v4
  form_type TEXT,          -- 'site_v1' (inspección de sitio con varias bombas)
  form_version INTEGER,    -- 1
  technician_name TEXT,
  client_name TEXT,
  location TEXT,
  status TEXT,             -- 'draft' | 'completed' | 'sent'
  form_data TEXT,          -- JSON blob con TODOS los valores del formulario
  created_at INTEGER,
  updated_at INTEGER,
  sent_at INTEGER          -- NULL hasta enviar
)

photos(id PK, inspection_id, field_key, local_uri, thumbnail_uri, caption, created_at)
signatures(id PK, inspection_id, signer_type, image_base64, signed_at)
```

**Forma del `form_data`** (inspección de sitio):
`{ "site": { cliente, atencion, area, fecha, tecnico }, "pumps": { "jockey": {…}, "diesel": {…}, "electrica": {…} } }`
Cada bomba guarda sus respuestas bajo su id. Las fotos usan `field_key` prefijado
por bomba (ej. `diesel:photo_general`); la firma es única por inspección
(`signer_type = 'technician'`). Tipos en `types/inspection.types.ts` (`SiteFormData`).

**Por qué `form_data` es un JSON blob:** evita migraciones de BD cada vez que
cambia el formulario. Los campos buscables (cliente, técnico, estado, fecha) son
columnas reales. Las inspecciones viejas siguen legibles tras cambiar el schema.

**Flujo de estado:** `draft → completed → sent`

---

## 6. Decisiones técnicas tomadas (y por qué)

| Decisión | Razón |
|----------|-------|
| **Excel en lugar de PDF** | La secretaria trabaja en Excel; un PDF la obligaría a reescribir. Se eliminó toda la generación de PDF (`pdf-generator.ts` borrado). |
| **expo-mail-composer en lugar de EmailJS** | Abre Gmail nativo con adjuntos; no requiere credenciales en el código ni backend. Se eliminó `email-sender.ts` y `sync-queue.ts`. |
| **Marcar `sent` antes de abrir el composer** | Android no reporta si el correo se envió. Se marca optimista; el técnico puede reenviar. |
| **El correo NO se dispara solo** | Antes `pdf-preview` abría el composer en un `useEffect` y reenviaba al ver una inspección. Ahora hay botón explícito + confirmación. |
| **Eliminación de V1** | No había inspecciones reales con `pump_v1`. Se borró el schema y la lógica de compatibilidad para simplificar. |
| **Fecha automática** | El cliente la quiere sin intervención; se genera en `new.tsx` y no es un campo del formulario. |
| **Números como número en Excel** | Para que la secretaria pueda sumar/promediar voltajes y amperajes. |
| **Validación con `required: true`** | `cliente`, `tecnico` y `firma_tecnico` son bloqueantes; el resto es warning suave. |
| **Sin ORM** | SQL directo con repositorios tipados. Menos dependencias, más legible para juniors. |
| **form_data como JSON** | Evita migraciones. Ver sección 5. |
| **Inspección = sitio con 3 bombas** | Un técnico revisa Jockey/Diésel/Eléctrica en la misma visita; antes era 1 bomba = 1 inspección. `form_data` lleva `site` + `pumps`. |
| **Firma única por inspección** | Las 3 bombas están en el mismo cuarto de máquinas; firmar 3 veces es incómodo. Se captura una vez en el índice. |
| **Excel en columnas, 1 hoja por bomba** | Réplica de la hoja física; cada bomba llenada es una hoja del mismo archivo. |
| **xlsx desde `dist/xlsx.full.min.js`** | El entry normal hace `require('fs'/'crypto'/'stream')` y Metro/Expo Go no lo resuelve. El dist es autocontenido. NO volver a `import 'xlsx'` ni a `await import`. |

---

## 7. Errores conocidos y qué se intentó

| Problema | Estado / intento |
|----------|------------------|
| **El correo no llega en iPhone** | `expo-mail-composer` en iOS abre Apple Mail; si no hay cuenta configurada, el correo queda en el outbox local y nunca sale. **La app es para Android (Gmail).** En iOS solo sirve para pruebas visuales. No es un bug a resolver. |
| **El correo se quedaba en borradores sin Excel/firma** | Segunda causa (2026-06-12): la app borraba el Excel y la firma en cuanto el composer cerraba, pero Gmail los relee en segundo plano al ENVIAR — si ya no existen, el envío falla y el borrador conserva solo la foto (único archivo no borrado). Fix: los archivos generados persisten (nombres deterministas, se sobreescriben al re-compartir); se limpian al borrar la inspección y al arrancar la app si tienen +3 días (`lib/attachment-files.ts`). |
| **Adjuntos fallaban SIEMPRE ("Couldn't attach file")** | Causa real (diagnóstico 2026-06-12, tras descartar la teoría de rutas de Expo Go): **bug de `expo-mail-composer@15.0.8` en Android** — agrega `FLAG_GRANT_READ_URI_PERMISSION` al chooser pero no al intent interno, y sin ClipData Android no propaga el permiso; Gmail recibe URIs `content://` que no puede leer. Corregido con **`patches/expo-mail-composer+15.0.8.patch`** (patch-package, hook `postinstall`): agrega ClipData + flag al intent del correo en `MailIntentBuilder.kt`. Solo aplica a builds nativos (APK); **en Expo Go los adjuntos siguen fallando** porque su binario no se puede parchar. NO borrar la carpeta `patches/` ni el script `postinstall`. |
| **El cuerpo HTML del correo salía como texto revuelto** | Resuelto: Android ignora HTML de intents (`Html.fromHtml` → texto plano). El cuerpo ahora es un resumen corto en texto plano; el reporte completo va solo en el Excel adjunto. |
| **Versiones de paquetes** | RESUELTO 2026-06-12: `npx expo install --fix` aplicado (expo 54.0.35, router 6.0.24, file-system 19.0.23). |
| **`react-native-worklets` era un stub local** | RESUELTO 2026-06-12: el stub (solo JS, sin código nativo) hacía fallar el build de Gradle en EAS. Se eliminó `stubs/` y se instaló el paquete real `react-native-worklets@0.5.1` (la misma versión nativa que trae Expo Go SDK 54). Se quitó `worklets: false` de `babel.config.js` y se activó `newArchEnabled: true` en app.json (reanimated 4 la requiere; Expo Go ya corría así). |
| **`npm install` falla con ERESOLVE** | Conflicto preexistente react 19.1.0 vs react-dom 19.2.x transitivo. Resuelto con `.npmrc` (`legacy-peer-deps=true`) — necesario también para que EAS Build instale en sus servidores. No borrar ese archivo. |
| **"Requiring unknown module 1766" al generar Excel** | El entry de `xlsx` (`xlsx.js`) hace `require` de módulos de Node (fs/crypto/stream) que no existen en Hermes; en Expo Go Metro lo marca como módulo desconocido. Fix: importar `xlsx/dist/xlsx.full.min.js` (autocontenido) + su `.d.ts` en `types/xlsx-dist.d.ts`. |

---

## 8. Próximos pasos (en orden de prioridad)

> **ESTADO VIVO (2026-06-29):** Implementado el cambio a **inspección de sitio
> con 3 bombas** (Jockey/Diésel/Eléctrica) + **Excel en columnas, una hoja por
> bomba**. Probado en Expo Go: crear, llenar varias bombas, firmar y generar el
> Excel funcionan (tras el fix de xlsx → `dist/xlsx.full.min.js`). **Falta:**
> probar el correo con adjuntos en **APK** y hacer push a git. Mejoras de esta
> sesión: botones Sí/No/N/A más grandes, aviso de bombas incompletas al enviar,
> botón "Editar" en la pantalla de envío. Pendientes anotados (no bloqueantes):
> firma como archivo PNG, bordes/cuadrícula en el Excel (requiere otra librería),
> renombrar `pdf-preview`→`share`.
> ⚠️ El parche de adjuntos (`patches/expo-mail-composer`) y el `.npmrc` siguen
> siendo necesarios; no borrarlos.

1. **VERIFICAR el APK `f1111aa6`** (link arriba): instalar, compartir una
   inspección con foto+firma, tocar Enviar en Gmail, confirmar que sale de
   Borradores y llega al destinatario con los 3 adjuntos. Si falla, revisar
   logs nativos del envío. (Los adjuntos NO funcionan en Expo Go por diseño,
   ver sección 7 — probar SIEMPRE en APK.)
2. **Logo/icono de la empresa** + APK de entrega final.
2. **Agregar tests** mínimos: `excel-generator` (que el Excel salga bien) y la
   lógica de validación de `fill.tsx`. Es lo más arriesgado sin cobertura.
3. **Logo de la empresa** en header del Excel y del correo (profesionalismo).
4. **Búsqueda por texto** en el historial.
5. (Opcional) Pantalla de edición de cliente/ubicación post-creación.

> Hecho (2026-06-11): PRAGMA foreign_keys + WAL e índices en `db.ts`; banner de
> `saveError` y flush del autosave al salir de `fill.tsx`; `parseFormData`
> defensivo compartido en `lib/form-data.ts`; cuerpo del correo en texto plano;
> reversión del status `sent` si el composer falla; pantalla de error si la BD
> no inicializa (`_layout.tsx`).
>
> Hecho (2026-06-12): correo destinatario configurable en Ajustes (settings.json);
> onboarding al primer arranque que pide el nombre completo del técnico
> (`app/_layout.tsx`); iconos Ionicons en los tabs (`@expo/vector-icons`, nuevo
> en package.json — instalar con `--legacy-peer-deps`); chip de comentario más
> visible en `FormField.tsx`; `SafeAreaView` migrado a
> `react-native-safe-area-context` en `SignatureField.tsx`. Ver
> `UX_PERFORMANCE_REPORT.md` (raíz del repo) para el backlog de mejoras UX,
> accesibilidad y rendimiento.
>
> Hecho (2026-06-12, 2ª tanda): listas con columnas selectivas — nuevo tipo
> `InspectionListItem` + `getInspectionsForList()` y `getInspectionCounts()`
> en `inspections.repo.ts`; `getAllInspections()` queda solo para el Excel
> maestro. Lazy import de `xlsx` en `excel-generator.ts`. Accesibilidad:
> botones Sí/No/N/A con icono ✓/✗ y borde constante (no solo color) +
> props de accesibilidad; gris `#9ca3af` → `#6b7280` en todos los textos
> (contraste WCAG AA). Verificado con tsc y `expo export` de producción.

Ver `IMPROVEMENT_AUDIT.md` para el detalle completo.

---

## 9. Comandos

```powershell
# Instalar dependencias
cd fuego-seguridad
npm install

# Correr en desarrollo (escanear QR con Expo Go)
npx expo start
npx expo start --tunnel      # si el teléfono y la PC no se ven en la red

# Verificar tipos (NO hay lint ni tests configurados)
npx tsc --noEmit

# Validar que todo el bundle compila (detecta imports rotos)
npx expo export --platform android --output-dir .expo-export-check
# (borrar .expo-export-check después)

# Build del APK de entrega (requiere cuenta Expo / EAS)
npx eas build -p android --profile preview
```

**No hay** scripts de test ni de lint en `package.json`. El único control de
calidad automatizado es `tsc --noEmit`.

---

## 10. Qué NO tocar (y por qué)

- **Los `key` de los campos en los schemas de bomba** (`jockey/electrica/diesel-form.schema.ts`):
  son las claves del JSON `form_data.pumps.<bomba>`. Cambiarlos rompe la lectura de
  inspecciones ya guardadas. Si un formulario cambia, bumpear la `version` de esa
  bomba y agregar un schema nuevo, no editar las keys existentes.
- **`.npmrc`**: contiene `legacy-peer-deps=true`. Borrarlo rompe `npm install`
  local y el build de EAS.
- **El nombre del archivo `pdf-preview.tsx`**: ya no genera PDF (es la pantalla
  de detalle/compartir), pero renombrarlo obliga a actualizar las rutas en
  `_layout.tsx`, `index.tsx` y `history.tsx`. Hazlo solo si actualizas las tres.
- **`expo-file-system/legacy`**: todo el código usa la API legacy. Migrar a la
  nueva API requiere tocar `photo-manager`, `excel-generator`, `settings-manager`
  y `pdf-preview` a la vez; hacerlo con cuidado, no parcialmente.
- **La columna `form_data` y su formato JSON**: es el corazón del modelo. No
  normalizar a columnas sin una razón concreta (rompería la extensibilidad).
