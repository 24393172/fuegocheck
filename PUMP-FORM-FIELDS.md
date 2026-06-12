# Pump Inspection Form — Field Reference

This document maps the digital form fields to the original paper form.
Before changing any field key, check if there are existing inspections that use it.

## How to read this

- **key**: The JSON key stored in `form_data` column in SQLite. Never change a key once used in production.
- **type**: Field input type
- **required**: Whether form can be completed without this field (all v2 fields are `false` — soft warning instead)

---

## Form ID: `pump_v2` (current — used for all new inspections)

Form title: "Reporte de Inspección, Pruebas y Mantenimiento a Bomba de Combustión Interna Contra Incendios"

### Section 0 — Datos Generales

| key | label | type | required | notes |
|-----|-------|------|----------|-------|
| cliente | Cliente | text | no | Pre-filled from new inspection screen |
| atencion | Atención (Ing. responsable) | text | no | |
| area | Área (ej. Cuarto de Máquinas) | text | no | |
| fecha | Fecha | text | no | Auto-filled with today's date |
| tecnico | Técnico Responsable | text | no | Auto-filled from settings |
| potencia | Potencia (HP) | text | no | |
| capacidad | Capacidad (L/SEG) | text | no | |
| voltaje_operacion | Voltaje de Operación (V) | text | no | |

### Section 1 — Succión y Descarga

All `yes_no_na`. Selecting "No" shows a mandatory comment field stored as `key + "_comentario"`.

| key | label | type | required |
|-----|-------|------|----------|
| 1_1 | 1.1 ¿La válvula de succión se encuentra abierta? | yes_no_na | no |
| 1_2 | 1.2 ¿La válvula de succión se encuentra asegurada y/o supervisada? | yes_no_na | no |
| 1_3 | 1.3 ¿La válvula de descarga se encuentra abierta? | yes_no_na | no |
| 1_4 | 1.4 ¿La válvula de descarga se encuentra asegurada y/o supervisada? | yes_no_na | no |
| 1_5 | 1.5 ¿Se encuentra instalada la válvula de alivio? | yes_no_na | no |
| 1_6 | 1.6 ¿Se encuentra en buen estado el acoplamiento mecánico? | yes_no_na | no |
| 1_7 | 1.7 ¿Cuenta con las guardas el acoplamiento mecánico? | yes_no_na | no |
| 1_8 | 1.8 ¿Se encuentra el manómetro de la línea de descarga operando? | yes_no_na | no |

### Section 2 — Tablero de Control

All `yes_no_na`. Selecting "No" shows a comment field (`key + "_comentario"`).

| key | label | type | required |
|-----|-------|------|----------|
| 2_1 | 2.1 ¿Se encontró el selector en modo automático? | yes_no_na | no |
| 2_2 | 2.2 ¿Funcionan los focos pilotos del tablero? | yes_no_na | no |
| 2_3 | 2.3 ¿Opera correctamente el interruptor principal? | yes_no_na | no |
| 2_4 | 2.4 ¿El tablero y/o sus componentes son aprobados? (NFPA 20) | yes_no_na | no |
| 2_5 | 2.5 ¿La línea piloto se encuentra instalada correctamente? | yes_no_na | no |

### Section 3 — Pruebas

Mix of `yes_no_na` and numeric reading fields. `yes_no_na` rows trigger comment field on "No".

| key | label | type | required | notes |
|-----|-------|------|----------|-------|
| 3_1 | 3.1 ¿Opera el equipo de modo manual? | yes_no_na | no | |
| 3_2 | 3.2 ¿Opera el equipo en automático? | yes_no_na | no | |
| 3_2_presion_arranque | Presión de Arranque (PSI) | number | no | Sub-reading for 3.2 |
| 3_2_presion_paro | Presión de Paro (PSI) | number | no | Sub-reading for 3.2 |
| 3_3 | 3.3 ¿El tiempo de retardo de paro es correcto? | yes_no_na | no | |
| 3_3_segundos | Tiempo de retardo (segundos) | text | no | Sub-reading for 3.3 |
| 3_4 | 3.4 ¿Se verificó el voltaje de entrada en el interruptor principal? | yes_no_na | no | |
| 3_4_v_entrada_f1 | Voltaje entrada Fase 1 (V) | number | no | Sub-reading for 3.4 |
| 3_4_v_entrada_f2 | Voltaje entrada Fase 2 (V) | number | no | Sub-reading for 3.4 |
| 3_4_v_entrada_f3 | Voltaje entrada Fase 3 (V) | number | no | Sub-reading for 3.4 |
| 3_5 | 3.5 ¿Se verificó el voltaje de salida en el contactor de arranque? | yes_no_na | no | |
| 3_5_v_salida_f1 | Voltaje salida Fase 1 (V) | number | no | Sub-reading for 3.5 |
| 3_5_v_salida_f2 | Voltaje salida Fase 2 (V) | number | no | Sub-reading for 3.5 |
| 3_5_v_salida_f3 | Voltaje salida Fase 3 (V) | number | no | Sub-reading for 3.5 |
| 3_6 | 3.6 ¿Se verificó la corriente de trabajo del motor? | yes_no_na | no | |
| 3_6_amp_f1 | Amperes Fase 1 (A) | number | no | Sub-reading for 3.6 |
| 3_6_amp_f2 | Amperes Fase 2 (A) | number | no | Sub-reading for 3.6 |
| 3_6_amp_f3 | Amperes Fase 3 (A) | number | no | Sub-reading for 3.6 |
| 3_7 | 3.7 ¿El motor cuenta con las RPM adecuadas? | yes_no_na | no | |
| 3_8 | 3.8 ¿Los empaques de la bomba sellan correctamente? | yes_no_na | no | |
| 3_9 | 3.9 ¿Existen ruidos o vibraciones anormales? | yes_no_na | no | |
| 3_10 | 3.10 ¿Existe sobre calentamiento en carcaza de la bomba? | yes_no_na | no | |
| 3_11 | 3.11 ¿Existe sobre calentamiento en carcaza del motor? | yes_no_na | no | |
| 3_12 | 3.12 ¿Los estoperos se encuentran lubricados? | yes_no_na | no | |
| 3_13 | 3.13 ¿La válvula de alivio se encuentra calibrada? | yes_no_na | no | |
| 3_14 | 3.14 ¿El equipo queda en modo automático? | yes_no_na | no | |

### Section 4 — Evidencia Fotográfica

| key | label | type | required |
|-----|-------|------|----------|
| photo_general | Foto general del equipo | photo | no |
| photo_panel | Foto del tablero de control | photo | no |
| photo_extra | Foto adicional (opcional) | photo | no |

### Section 5 — Observaciones

| key | label | type | required |
|-----|-------|------|----------|
| observaciones | Observaciones generales | textarea | no |

### Section 6 — Firma

Only the technician signs. No client signature in this form.

| key | label | type | required |
|-----|-------|------|----------|
| firma_tecnico | Firma del técnico inspector | signature | no |

---

## Form ID: `pump_v1` (legacy — do not use for new inspections)

Kept in the registry so old saved inspections still render. Do not modify.
See git history for original field list.

---

## Versioning policy

If fields are added, removed, or renamed:
1. Create `pump_v3` export in `pump-form.schema.ts` (new export, same file)
2. Increment `version` to `3`
3. Keep `pump_v2` export — old inspections still reference it for rendering
4. Update `schemas/index.ts` to register the new version
5. New inspections will use `pump_v3`
6. Old inspections stored as `pump_v2` will still render correctly

**Never rename a field key in an existing version.**
**Never delete a field key from an existing version.**
**Never change `required` behavior for an existing version.**
