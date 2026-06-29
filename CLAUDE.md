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
  form_type TEXT NOT NULL,          -- 'pump_v2' | future form types
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
  id: string            // e.g. 'pump_v2'
  name: string          // e.g. 'Reporte de Inspección ... Bomba'
  version: number       // increment when form structure changes
  sections: FormSection[]
}
```

The only form currently shipped is `pump_v2`. The old `pump_v1` schema was
removed (no real inspections existed). `required: true` fields are blocking —
the user cannot complete the inspection until they are filled (see fill.tsx).
The date (`fecha`) is NOT a form field — it is set automatically at creation.

**Adding a new form type in the future:**
1. Create `schemas/extinguisher-form.schema.ts` with same structure
2. Register it in `schemas/index.ts`
3. Done. Zero changes to renderer or database.

**Why versioning matters:**
If the physical paper form changes, bump to `pump_v3`. Inspections saved with
`pump_v2` keep rendering because `form_version` is stored with each record.

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

Two functions:
- `generateInspectionExcel(id)` — single inspection, vertical layout (label | value).
  Attached to the email. Named `inspeccion_{client}_{uuid8}.xlsx`.
- `generateMasterExcel()` — ALL inspections, one row per inspection, one column
  per field. Used by the "Exportar todo" button in Settings (shared via
  expo-sharing). Named `inspecciones_{YYYY-MM-DD}.xlsx`.

Shared rules:
- `number` fields are written as real numbers (so the secretary can sum/average).
- yes_no_na values: "Sí" / "No" / "N/A".
- Photos and signatures are NOT in the Excel (sent as separate attachments).
- form_data is parsed defensively — a corrupted record becomes {} instead of crashing.

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
    new.tsx                # Choose form type
    [id]/
      fill.tsx             # Fill out the form
      preview.tsx          # Review before completing
      pdf-preview.tsx      # Share screen: generates Excel, opens Gmail
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
  pump-form.schema.ts
  index.ts                 # Registry of all form schemas
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
