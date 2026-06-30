# Fuego & Seguridad — Claude Code Context

## What this project is

Mobile Android app for fire suppression system inspection technicians.
Replaces paper forms with digital inspections. When completed, the app generates
an Excel file with all inspection data and opens Gmail with the file already attached
and the recipient pre-filled. The technician just taps Send.

**This is a university social service project. 4 months. 2 developers.**
The goal is a stable, working, maintainable app — not a startup product.

---

## How to work with me (Claude Code rules)

- **Work iteratively. One phase at a time.**
- **Never generate placeholder or TODO code.** If something isn't being built yet, don't create the file.
- **Wait for confirmation before moving to the next phase.**
- **Explain decisions briefly.** I want to understand what I'm building, not just copy-paste.
- **If you see a simpler approach, say so before implementing the complex one.**
- **Keep code junior-readable.** Two developers will maintain this. Avoid clever abstractions.
- **No enterprise patterns unless there is a concrete reason for this specific project.**
  - No: DI containers, factory classes, service locators, abstract repositories with interfaces
  - No: 5-layer clean architecture, domain/application/infrastructure separation
  - Yes: simple functions, simple files, simple folders

---

## Tech Stack (fixed, do not change without asking)

| Need | Solution | Reason |
|------|----------|--------|
| Framework | React Native + Expo SDK 51+ | Single codebase, fast setup |
| Language | TypeScript (strict) | Catch bugs at compile time |
| Local DB | expo-sqlite (no ORM) | Direct SQL, fewer dependencies |
| DB typing | Manual typed repository | Consistent across 2 devs |
| State | Zustand | Simple, no boilerplate |
| Navigation | Expo Router (file-based) | Convention over config |
| Forms | react-hook-form + zod | Validation + typed schemas |
| Excel | xlsx | Inspection data → .xlsx file |
| Signatures | react-native-signature-canvas | Touch canvas → base64 |
| Photos | expo-image-picker + expo-image-manipulator | Camera + compression |
| File system | expo-file-system | Persistent local storage |
| Email | expo-mail-composer | Opens Gmail with file attached |
| UI | NativeWind + react-native-paper | Tailwind in RN |
| Build | EAS Build (Expo) | APK without Play Store |

**No Firebase. No backend server. No authentication system.**

---

## Architecture

```
Offline-first. Data saved locally. Sharing is done manually via the native mail composer.

DEVICE
├── Screens (Expo Router)
│   └── reads/writes via Repository functions
├── Repository layer (typed functions over SQLite)
│   └── inspections.repo.ts
│   └── photos.repo.ts
│   └── signatures.repo.ts
├── SQLite (expo-sqlite)
├── FileSystem (expo-file-system)
│   └── /inspections/{id}/photos/
├── Zustand Store (UI state only, not persisted state)
├── Excel Generator (xlsx → .xlsx file saved to documentDirectory)
└── Mail Composer (expo-mail-composer → opens Gmail with Excel + photos attached)
```

---

## Database Schema

```sql
-- inspections
CREATE TABLE inspections (
  id TEXT PRIMARY KEY,              -- UUID v4
  form_type TEXT NOT NULL,          -- 'site_v1' (site inspection with multiple pumps)
  form_version INTEGER NOT NULL,    -- schema version at time of creation
  technician_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'completed' | 'sent'
  form_data TEXT NOT NULL,          -- JSON blob with all field values
  created_at INTEGER NOT NULL,      -- Unix timestamp ms
  updated_at INTEGER NOT NULL,
  sent_at INTEGER                   -- NULL until sent
);

-- photos
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id),
  field_key TEXT NOT NULL,          -- which form field this photo belongs to
  local_uri TEXT NOT NULL,          -- absolute path in app document directory
  thumbnail_uri TEXT,               -- compressed thumbnail path
  caption TEXT,
  created_at INTEGER NOT NULL
);

-- signatures
CREATE TABLE signatures (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id),
  signer_type TEXT NOT NULL,        -- 'technician' | 'client'
  image_base64 TEXT NOT NULL,
  signed_at INTEGER NOT NULL
);
```

**Why form_data as JSON blob:**
When new form types or versions are added, we don't need to migrate existing records.
Searchable fields (technician, client, status, date) are proper columns.

---

## Inspection Status Flow

```
draft → completed → sent
```

- `draft`: being filled, autosaved. Tapping a draft card goes to fill screen.
- `completed`: form saved, technician has not opened the mail composer yet. Tapping goes to share screen.
- `sent`: mail composer was opened with the Excel attached. Tapping goes to share screen (allows resend).

---

## Form Schema Design (extensible to future form types)

Every form type is a TypeScript config file. The renderer is generic.

```typescript
type FieldType = 'text' | 'number' | 'yes_no_na' | 'photo' | 'signature' | 'select' | 'textarea'

interface FormField {
  key: string           // unique within form, used as JSON key in form_data
  label: string         // display label in Spanish
  type: FieldType
  required: boolean
  section: string       // which section this field belongs to
  options?: string[]    // for 'select' type
}

interface FormSection {
  id: string
  title: string
  fields: FormField[]
}

interface FormSchema {
  id: string            // e.g. 'jockey'
  name: string          // e.g. 'Reporte de Inspección ... Bomba'
  version: number       // increment when form structure changes
  sections: FormSection[]
}
```

An inspection is a **site visit** (`form_type 'site_v1'`) that can hold up to
three pump schemas: `jockey`, `electrica`, `diesel` (registered in
`schemas/index.ts` as `PUMP_SCHEMAS`). Each pump's answers live under
`form_data.pumps.<bomba>`; shared data (cliente, área, fecha, técnico) under
`form_data.site`. Checklist questions are `required: false`; the hard requirement
(signature + at least one pump with data) is enforced in `inspection/[id]/index.tsx`.
The date is NOT a form field — it is set automatically at creation.

Field extras for the Excel: `parametro` (fixed reference text, e.g. "NFPA 20") and
`readingKeys` (the number fields that are a question's readings).

**Adding a new pump type in the future:**
1. Create `schemas/<name>-form.schema.ts` with the same structure
2. Add it to `PUMP_SCHEMAS` in `schemas/index.ts`
3. Done — index screen, renderer, DB and Excel pick it up automatically.

**Why versioning matters:**
If a physical paper form changes, bump that pump schema's `version` and add a new
schema. Inspections store the version they were created with, so old records keep
rendering.

---

## Photo Handling

```
Max stored size: 800px wide, JPEG 70% quality (~150-300KB per photo)
Thumbnails: 200px wide for list views
Storage path: {documentDirectory}/inspections/{inspectionId}/photos/
Never store photos in cache directory (gets cleared by OS)
Delete photos when inspection is deleted
```

---

## Excel Output (lib/excel-generator.ts)

`xlsx` is imported from its prebuilt bundle (`xlsx/dist/xlsx.full.min.js`); the
package entry pulls Node modules Metro can't resolve in Expo Go.

Two functions:
- `generateInspectionExcel(id)` — one inspection, **one sheet per pump that has
  data**, in columns like the paper sheet (Pregunta · S · N/A · N · Parámetros ·
  Lecturas · Comentarios) with an "X" under the chosen answer. Named
  `inspeccion_{client}_{uuid8}.xlsx`.
- `generateMasterExcel()` — ALL inspections, one sheet per pump type, one row per
  inspection. Used by "Exportar todo" in Settings (shared via expo-sharing).

Shared rules:
- Photos and signatures are NOT in the Excel (sent as separate attachments).
- form_data is parsed defensively — a corrupted record becomes {} instead of crashing.
- Cell borders/bold are NOT written (SheetJS community limitation); columns + X only.

---

## Email (expo-mail-composer)

The share screen (`inspection/[id]/pdf-preview.tsx`) is the inspection detail
screen. It does NOT auto-open the mail composer — the technician taps
"Compartir por correo" and confirms first. From here they can also re-send or
delete the inspection.

- Opens the device's default mail app (Gmail) with everything pre-filled
- Attachments: Excel file + all inspection photos + signature PNG files
- Recipient: secretary email (hardcoded in constants/config.ts → EMAIL_CONFIG.recipientEmail)
- Subject: `[Inspección] {clientName} - {date} - {technicianName}`
- Body: HTML table with all form fields
- Marked `sent` right before the composer opens (Android doesn't report send status).
  If the user cancels, they can re-send from the same screen.
- Generated files (Excel + signature PNGs) PERSIST after the composer opens — Gmail
  re-reads them in the background when actually sending; deleting them early strands
  the email in drafts. They are removed on inspection delete and pruned at app
  startup after 3 days (lib/attachment-files.ts).
- No offline queue — sharing is manual, the technician taps Send.
- Deleting an inspection uses `deleteInspectionCompletely()` — removes photo rows,
  signature rows, the inspection row, and the physical photo files.

---

## Error Handling (required, not optional)

Every critical operation must handle failure explicitly:

- Excel generation failure → show error screen, keep status as 'completed', allow retry from history
- Mail composer unavailable → show error with instructions to install a mail app
- Photo save failure → show error, don't silently lose photo
- Storage permission denied → show explanation screen
- Interrupted inspection (app killed) → autosave every field change
- Corrupted SQLite record → log error, mark inspection as needs_review

---

## Folder Structure

```
/app
  /(tabs)/
    index.tsx              # Dashboard: recent inspections + quick start
    history.tsx            # Full inspection history with filters
    settings.tsx           # Tech name, email config, app version
  /inspection/
    new.tsx                # Create site inspection (client + area + attention)
    [id]/
      index.tsx            # Pump list + signature + complete/send
      fill.tsx             # Fill ONE pump (?pump=)
      pdf-preview.tsx      # Share screen: generates Excel, opens Gmail (legacy name)
  _layout.tsx
/components
  /forms/
    FormField.tsx          # Renders any FieldType dynamically
    YesNoNaField.tsx
    PhotoField.tsx
    SignatureField.tsx
  /ui/
    InspectionCard.tsx
    StatusBadge.tsx
    SectionHeader.tsx
/lib
  db.ts                    # SQLite connection + table creation
  /repositories/
    inspections.repo.ts
    photos.repo.ts
    signatures.repo.ts
  excel-generator.ts       # inspection data → .xlsx file
  photo-manager.ts         # compress, save, delete photos
  uuid.ts
/schemas
  jockey-form.schema.ts
  electrica-form.schema.ts
  diesel-form.schema.ts
  index.ts                 # PUMP_SCHEMAS registry + getSchema()
/store
  inspection.store.ts      # Active inspection being filled
/types
  inspection.types.ts
  form.types.ts
/constants
  config.ts                # Email recipient, app version, etc.
  colors.ts
```

---

## What NOT to build (scope boundaries)

- No user authentication / login system (PIN in settings is enough if needed)
- No cloud database or Firebase
- No web dashboard
- No push notifications
- No multi-company / multi-tenant support
- No real-time collaboration
- No Play Store publishing
- No backend API of any kind

---

## Distribution

APK via EAS Build → share via Google Drive or WhatsApp.
Technicians enable "install from unknown sources" on their Android.
Updates: replace APK file on Drive, notify via WhatsApp.

---

## Language conventions

- UI text and labels: Spanish
- Code, variable names, comments explaining logic: English
- Error messages shown to user: Spanish
- Git commit messages: English

---

## Development phases (do not skip ahead)

**Phase 1 — Foundation**
- Expo project + TypeScript + NativeWind setup
- SQLite db.ts with all tables
- Repository functions for inspections
- Basic navigation structure

**Phase 2 — Core Form**
- Pump form schema definition
- FormField dynamic renderer
- Fill inspection screen
- Autosave on every change

**Phase 3 — Media**
- Photo capture + compression + storage
- Signature capture + storage
- Photo/signature display in form

**Phase 4 — Excel + Share**
- Excel generator (xlsx library)
- Share screen: generates Excel, opens Gmail with attachments
- Status flow: draft → completed → sent

**Phase 5 — Polish**
- Progress bar in fill screen
- History filters
- Dashboard stats
- Settings screen

**Phase 6 — History + Polish**
- History screen with filters
- Dashboard with stats
- Settings screen
- Error handling review
- UI polish

**Phase 7 — Build + Delivery**
- EAS Build configuration
- APK generation
- Testing on real devices
- Bug fixes
