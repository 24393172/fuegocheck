# Architecture Decisions — Fuego & Seguridad

This document explains *why* specific technical choices were made.
Before changing any of these, read the reasoning first.

> **Update note:** The project originally generated a **PDF** and emailed it
> automatically via **EmailJS**. Both were dropped. The app now generates an
> **Excel** file and shares it through the **native mail composer**
> (`expo-mail-composer`). See ADR-006 (superseded) and ADR-009 (current) for the
> reasoning. ADRs kept for history are marked accordingly.

---

## ADR-001: React Native + Expo over native Android (Kotlin)

**Decision:** React Native with Expo SDK 51+

**Reasoning:**
- 4 months, 2 junior developers → single codebase is the only realistic option
- Expo managed workflow eliminates Android Studio configuration for ~90% of the project
- Expo ecosystem covers all required functionality (camera, file system, SQLite, Excel, mail composer)
- TypeScript support is first-class

**Trade-offs accepted:**
- Slightly larger APK size than native (~50MB vs ~15MB)
- Some advanced Android features unavailable (acceptable for this use case)
- Performance is sufficient for form-based data entry

---

## ADR-002: No ORM — expo-sqlite with typed repository functions

**Decision:** Direct SQL via expo-sqlite, typed repository functions, no Drizzle/TypeORM

**Reasoning:**
- 3 tables, ~15 queries total — ORM migration system adds complexity for no benefit
- Two developers writing raw SQL is more readable and debuggable than ORM-generated queries
- Repository pattern (functions that return typed objects) gives type safety without ORM overhead
- Drizzle is excellent but introduces: migration files, schema definition duplication, config overhead

**Implementation:**
```typescript
// lib/repositories/inspections.repo.ts (actual function names)
export async function getInspection(id: string): Promise<Inspection | null> { ... }
export async function createInspection(input: CreateInspectionInput): Promise<Inspection> { ... }
export async function getAllInspections(): Promise<Inspection[]> { ... }
export async function deleteInspectionCompletely(id: string): Promise<void> { ... }
```

**Trade-offs accepted:**
- SQL strings are not compile-time checked (mitigated by TypeScript return types)
- Requires discipline to keep repository functions consistent between two devs

---

## ADR-003: No backend server, no Firebase

**Decision:** Fully local app, email is the sync mechanism

**Reasoning:**
- Backend adds: deployment, hosting costs, auth system, API maintenance, network dependency
- Firebase adds: Firestore rules, auth, quotas, vendor lock-in, learning curve
- For 2-3 technicians emailing to 1 secretary, a backend is pure overhead
- The email (with the Excel attached) IS the synchronization — simple, reliable, zero infrastructure

**Trade-offs accepted:**
- No real-time updates or central dashboard (not a requirement)
- Secretary manages received emails manually (current workflow, no change)
- If company grows to 20 technicians, this architecture needs revisiting (acceptable for 4-month scope)

---

## ADR-004: form_data stored as JSON blob in SQLite

**Decision:** All form field values stored as a single JSON TEXT column

**Reasoning:**
- Form schemas will change (new versions, new fields, new form types)
- Normalizing every field into its own column requires migrations every time a form changes
- Old inspections must remain readable even after form schema updates
- Searchable fields (technician, client, status, date) are proper columns

**Implementation:**
```typescript
// form_data shape for a site inspection (form_type 'site_v1'); yes_no_na lowercase:
{
  "site": { "cliente": "Hotel Caribe", "fecha": "08/06/2026", "tecnico": "Juan Pérez",
            "area": "Cuarto de Máquinas", "atencion": "Ing. Luis" },
  "pumps": {
    "jockey": { "1_1": "si", "3_2_presion_arranque": 145, "3_9": "no",
                "3_9_comentario": "Vibración leve", "observaciones": "Equipo operativo" },
    "diesel": { "2_3_banco_1": 14, "2_3_banco_2": 13 }
  }
}
```

**Trade-offs accepted:**
- Cannot query individual field values with SQL (acceptable — no requirement for field-level querying)
- JSON must be parsed in application code

---

## ADR-005: Form schemas as TypeScript config files

**Decision:** Each form type is a `.schema.ts` file, not a database-stored config

**Reasoning:**
- Form schemas are developer-managed, not end-user-managed
- TypeScript gives compile-time validation of the schema structure
- No UI needed for form management
- Dead simple: add a new file = add a new form type

**Adding a new form type:**
1. Create `schemas/extinguisher-form.schema.ts`
2. Add to `schemas/index.ts` registry
3. Done. Renderer, DB, and Excel generator all work automatically.

**Current forms:** an inspection is a site visit (`form_type 'site_v1'`) holding
up to three pump schemas — `jockey`, `electrica`, `diesel` (in `schemas/`,
registered as `PUMP_SCHEMAS`). The legacy single-pump `pump_v2`/`pump_v1` schemas
were removed (no real inspections existed). If a paper form changes, bump that
pump's `version` and add a new schema — never edit the `key`s of a schema that has
saved data (they are the JSON keys in `form_data.pumps.<bomba>`).

---

## ADR-006: EmailJS for automated email sending — ⚠️ SUPERSEDED by ADR-009

**Original decision (no longer in effect):** EmailJS instead of expo-mail-composer

**Original reasoning:**
- expo-mail-composer opens the native email client → requires manual technician action
- Automation requirement: PDF must be sent without technician interaction
- EmailJS provides API-based email sending from client-side code, no backend needed

**Why it was reverted:**
- The deliverable changed from PDF to Excel (ADR-009), and the secretary needs
  to open/forward the email manually anyway — full automation added no value.
- EmailJS credentials (service ID, template ID, public **and private** key) ended
  up hardcoded in `constants/config.ts`, shipped inside the APK. That is a real
  exposure: anyone decompiling the APK could send email as the company.
- It depended on a third-party service and an internet connection at send time.

All EmailJS code was removed (`lib/email-sender.ts`, `lib/sync-queue.ts` deleted,
credentials purged from `constants/config.ts`).

---

## ADR-009: expo-mail-composer + Excel (current sending mechanism)

**Decision:** Generate an Excel file and open the native mail composer with it
attached, instead of auto-sending via EmailJS.

**Reasoning:**
- The secretary works in **Excel**; a PDF would force her to retype everything.
- `expo-mail-composer` opens Gmail with recipient, subject, body and attachments
  pre-filled — the technician just taps Send. No credentials, no backend, no
  third-party service.
- Attachments are the Excel + inspection photos + signature PNGs.

**Key behaviors:**
- The inspection is marked `sent` **right before** the composer opens, because
  Android mail apps don't report back whether the email was actually sent. If the
  technician cancels, they can re-send from the detail screen.
- The mail composer is **not** opened automatically — there is an explicit
  "Compartir por correo" button plus a confirmation dialog (avoids accidental
  sends when only viewing an inspection).
- Generated files (Excel + signature PNGs) **persist** after the composer opens —
  Gmail re-reads them in the background when actually sending; deleting them early
  strands the email in drafts. They are removed on inspection delete and pruned at
  startup after 3 days (`lib/attachment-files.ts`).
- The Excel has **one sheet per pump** that has data, laid out in columns like the
  paper sheet. `xlsx` is imported from its prebuilt bundle
  (`xlsx/dist/xlsx.full.min.js`); the package entry pulls Node modules Metro can't
  resolve in Expo Go.

**Trade-offs accepted:**
- Sending is manual (one extra tap). Acceptable — it also prevents accidental sends.
- On **iOS** the composer opens Apple Mail; if no account is configured the mail
  never leaves the device. The app targets **Android (Gmail)**; iOS is for visual
  testing only.

---

## ADR-007: APK sideload distribution (no Play Store)

**Decision:** EAS Build → APK → Google Drive → WhatsApp

**Reasoning:**
- Play Store requires: $25 developer account, review process (days to weeks), compliance
- This app is for 2-3 internal users of one company — Play Store is unnecessary
- EAS Build is free for basic builds
- Technicians can update by downloading new APK link

**Update process:**
1. Run `eas build --platform android --profile production`
2. Upload APK to shared Google Drive folder
3. Notify technicians via WhatsApp
4. Technicians download and install (replaces previous version)

---

## ADR-008: Photos stored in documentDirectory, not cache

**Decision:** `expo-file-system documentDirectory` for photo storage

**Reasoning:**
- `cacheDirectory` is cleared by the OS when storage is low — photos would be silently lost
- `documentDirectory` persists until app is uninstalled
- Photos are linked to inspections in the `photos` table — must persist as long as the inspection does

**Photo lifecycle:**
- Captured → compressed to 800px JPEG 70% → saved to `{documentDirectory}/inspections/{id}/photos/`
- Thumbnail generated at 200px for list views
- Deleted when parent inspection is deleted

---

## Patterns used (and why these specifically)

### Repository pattern (not service layer)
Simple exported functions over SQLite. Not classes. Not interfaces.
Two files: `inspections.repo.ts`, `photos.repo.ts`, `signatures.repo.ts`.
Each exports typed async functions. That's it.

### Zustand for UI state only
The store (`store/inspection.store.ts`) holds only `isSaving` and `saveError`
flags for the fill screen. It does NOT replace SQLite — SQLite is the source of
truth. `saveError` is rendered as a red banner in `fill.tsx` on autosave failure.

### Expo Router file-based navigation
Convention > configuration. File path = route. No route registry to maintain.

### Form validation is manual (Zod is installed but not used for the form)
`zod` is a dependency but the forms are **not** validated with it. Validation
lives in `app/inspection/[id]/index.tsx`: sending requires a signature plus at
least one pump with data, and warns (soft, "send anyway") if a started pump has
unanswered questions. Each pump's checklist questions are `required: false`.
react-hook-form manages field state and autosave per pump in `fill.tsx`.
