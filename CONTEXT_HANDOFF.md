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
1. Crea una inspección (cliente + ubicación; el técnico se toma de Ajustes).
2. Llena el formulario de bomba contra incendio (~90 campos en 6 secciones).
3. Toma fotos de evidencia y captura su firma.
4. Toca "Completar y Enviar" → validación de campos obligatorios.
5. Llega a la pantalla de detalle → toca "Compartir por correo" → confirma.
6. Se abre Gmail con el **Excel + fotos + firma adjuntos** y el destinatario
   ya puesto. El técnico solo toca Enviar.

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
- Crear / editar / autosave de inspecciones (SQLite local).
- Formulario dinámico `pump_v2` con barra de progreso en tiempo real.
- Captura de fotos (comprimidas a 800px/70%) y firma táctil.
- Validación bloqueante de campos obligatorios (cliente, técnico, firma).
- Generación de Excel individual (vertical) y maestro (una fila por inspección).
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
- **Ubicación no editable** después de crear la inspección. El formulario
  `pump_v2` no tiene campo de ubicación; vive solo en la columna `location`
  poblada en `new.tsx`. El cliente eligió no agregar pantalla de edición.
- **Correo destinatario hardcodeado** (`hector13-zalo@hotmail.com` en
  `constants/config.ts`). El cliente lo quiere fijo. Para cambiarlo hay que
  editar el archivo y recompilar.
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
    new.tsx                       # Crear inspección (cliente + ubicación)
    [id]/
      fill.tsx                    # ⭐ Formulario: autosave, progreso, validación
      pdf-preview.tsx             # ⭐ Pantalla de detalle/compartir (NOMBRE OBSOLETO)

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
  pump-form.schema.ts            # ⭐ Definición del formulario pump_v2 (única fuente)
  index.ts                       # Registro de schemas + getSchema()

store/
  inspection.store.ts            # Zustand: estado de guardado (isSaving, saveError)

types/
  inspection.types.ts            # Inspection, Photo, Signature, InspectionStatus
  form.types.ts                  # FormField, FormSection, FormSchema, FieldType

constants/
  config.ts                      # EMAIL_CONFIG.recipientEmail + APP_VERSION

stubs/
  react-native-worklets/         # Stub local para que reanimated compile (NO TOCAR)
```

⭐ = archivos centrales que tocarás con más frecuencia.

---

## 5. Modelo de datos (SQLite local)

Tres tablas en `fuego_seguridad.db` (ver `lib/db.ts`):

```sql
inspections(
  id TEXT PK,              -- UUID v4
  form_type TEXT,          -- siempre 'pump_v2' por ahora
  form_version INTEGER,    -- 2
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

---

## 7. Errores conocidos y qué se intentó

| Problema | Estado / intento |
|----------|------------------|
| **El correo no llega en iPhone** | `expo-mail-composer` en iOS abre Apple Mail; si no hay cuenta configurada, el correo queda en el outbox local y nunca sale. **La app es para Android (Gmail).** En iOS solo sirve para pruebas visuales. No es un bug a resolver. |
| **Foreign keys no se aplican** | SQLite tiene `PRAGMA foreign_keys` OFF por defecto y nunca se activa. Las `REFERENCES` en `db.ts` son decorativas. El borrado en cascada se hace manualmente en `deleteInspectionCompletely()`. |
| **Versiones de paquetes con parche pendiente** | `expo start` avisa que expo (54.0.34→35), expo-file-system y expo-router tienen parches. No bloquea. Correr `npx expo install --fix` cuando se quiera alinear. |
| **`react-native-worklets` es un stub local** | Parche para que reanimated compile en este setup. Frágil ante updates de reanimated. No se ha resuelto la dependencia real. |

---

## 8. Próximos pasos (en orden de prioridad)

1. **Generar el APK de entrega** con EAS Build y probarlo en un Android real con
   Gmail. Es el entregable final. (Ver comandos abajo.)
2. **Agregar tests** mínimos: `excel-generator` (que el Excel salga bien) y la
   lógica de validación de `fill.tsx`. Es lo más arriesgado sin cobertura.
3. **Activar `PRAGMA foreign_keys = ON`** en `db.ts` o documentar que el borrado
   se maneja en código.
4. **Índices en SQLite** para `photos.inspection_id` y `signatures.inspection_id`
   (mejora lecturas cuando crezcan los datos).
5. **Logo de la empresa** en header del Excel y del correo (profesionalismo).
6. **Búsqueda por texto** en el historial.
7. (Opcional) Pantalla de edición de cliente/ubicación post-creación.

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

- **Los `key` de los campos en `pump-form.schema.ts`**: son las claves del JSON
  `form_data`. Cambiarlos rompe la lectura de inspecciones ya guardadas. Si el
  formulario cambia de estructura, crear `pump_v3`, no editar `pump_v2`.
- **`stubs/react-native-worklets/`**: parche de build. Borrarlo rompe la
  compilación de reanimated.
- **El nombre del archivo `pdf-preview.tsx`**: ya no genera PDF (es la pantalla
  de detalle/compartir), pero renombrarlo obliga a actualizar las rutas en
  `_layout.tsx`, `index.tsx` y `history.tsx`. Hazlo solo si actualizas las tres.
- **`expo-file-system/legacy`**: todo el código usa la API legacy. Migrar a la
  nueva API requiere tocar `photo-manager`, `excel-generator`, `settings-manager`
  y `pdf-preview` a la vez; hacerlo con cuidado, no parcialmente.
- **La columna `form_data` y su formato JSON**: es el corazón del modelo. No
  normalizar a columnas sin una razón concreta (rompería la extensibilidad).
