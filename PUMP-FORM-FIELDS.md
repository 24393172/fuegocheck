# Pump Inspection Forms — Field Reference

An inspection is a **site visit** (`form_type = 'site_v1'`) that can contain up
to three pumps. Each pump is its own schema. **The source of truth for the exact
fields is the schema files** — keep those authoritative, not this doc:

- `schemas/jockey-form.schema.ts` — Bomba Jockey
- `schemas/electrica-form.schema.ts` — Bomba Eléctrica
- `schemas/diesel-form.schema.ts` — Bomba de Combustión Interna Diésel
- `schemas/index.ts` — `PUMP_SCHEMAS` registry + `getSchema()`

---

## How form_data is shaped

```json
{
  "site":  { "cliente": "...", "atencion": "...", "area": "...", "fecha": "...", "tecnico": "..." },
  "pumps": { "jockey": { "1_1": "si", ... }, "diesel": { ... }, "electrica": { ... } }
}
```

Each pump stores its answers under its id. Types live in
`types/inspection.types.ts` (`SiteFormData`).

---

## Field conventions

- **key**: JSON key inside that pump's object (`form_data.pumps.<bomba>.<key>`).
  Never rename a key once it has production data.
- **type**: `text` | `number` | `yes_no_na` | `textarea` | `photo`
- **required**: every checklist question is `false` (soft warning). The hard
  requirements are at the inspection level — a signature + at least one pump with
  data — enforced in `app/inspection/[id]/index.tsx`.
- **yes_no_na** values are stored lowercase: `'si' | 'no' | 'na'`. Any answer can
  carry a comment stored as `key + '_comentario'`.
- **parametro?**: fixed reference text printed on the paper sheet (e.g. `NFPA 20`),
  shown in the Excel "Parámetros" column. The technician does not fill it.
- **readingKeys?**: keys of the `number` fields that are this question's "Lecturas"
  (e.g. voltage per phase). Those number fields are listed right after the
  question in the same section.
- **Photos**: stored with `field_key` prefixed by pump id, e.g. `diesel:photo_general`.
- **Signature**: one per inspection (`signer_type = 'technician'`), captured on
  the index screen — it is NOT part of any pump schema.

---

## Per-pump structure (summary)

### Jockey (`jockey`)
Datos de la bomba (potencia / capacidad / voltaje) · Succión y Descarga (1.1–1.8) ·
Tablero de Control (2.1–2.5; 2.5 parámetro `NFPA 20`) · Pruebas (3.1–3.14, con
lecturas: 3.2 presiones arranque/paro, 3.3 segundos, 3.4/3.5 voltajes por fase,
3.6 amperes por fase) · Observaciones · Foto.

### Eléctrica (`electrica`)
Como la jockey **+5 preguntas**: 1.6 válvula eliminadora de aire, 1.10
manovacuómetro de succión, 1.11 nivel de aceite del cabezal, 2.4 palanca de
arranque de emergencia, 3.2 mecanismo de arranque de emergencia. Resulta en
Succión 1.1–1.11 · Tablero 2.1–2.6 (2.6 parámetro `NFPA 20`) · Pruebas 3.1–3.15.

### Diésel (`diesel`)
Estructura distinta: Succión y Descarga (1.1–1.11) · Banco de Baterías (2.1–2.3;
2.2 y 2.3 con lecturas Banco #1 / Banco #2) · Sistema de Enfriamiento (3.1–3.3) ·
Sistema de Lubricación y Combustible (4.1–4.4; 4.3 parámetro `2/3 NFPA 20`) ·
Sistema Motriz (5.1–5.5; 5.5 con lectura Banco #1) · Observaciones · Foto. No
tiene sección de Pruebas eléctricas.

---

## Versioning policy

The schemas were built fresh from the paper sheets; there is **no production data
yet**, so keys could be defined cleanly. From now on:

- If a paper form changes, bump that pump's `version` and add a new schema export.
- Inspections store `form_version`, so old records keep rendering with the schema
  they were created with.

**Never** rename or delete a field key, or change the section structure, of a
version that already has saved inspections.
