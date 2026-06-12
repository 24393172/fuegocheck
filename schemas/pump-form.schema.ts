import { FormSchema } from '../types/form.types';

// ─── Pump form — "Reporte de Inspección, Pruebas y Mantenimiento a Bomba de
//     Combustión Interna Contra Incendios" ──────────────────────────────────
//
// The `fecha` (date) is NOT a field here — it is set automatically when the
// inspection is created (see new.tsx) and shown in the Excel/email header.
// All checklist fields are required:false — completion is enforced with a soft
// warning, except the critical fields validated in fill.tsx (client, technician,
// signature).

export const pumpFormV2: FormSchema = {
  id: 'pump_v2',
  name: 'Reporte de Inspección, Pruebas y Mantenimiento a Bomba de Combustión Interna Contra Incendios',
  version: 2,
  sections: [
    // ── Datos Generales ──────────────────────────────────────────────────────
    {
      id: 'datos_generales',
      title: 'Datos Generales',
      fields: [
        { key: 'cliente',           label: 'Cliente',                          type: 'text', required: true,  section: 'datos_generales' },
        { key: 'atencion',          label: 'Atención (Ing. responsable)',       type: 'text', required: false, section: 'datos_generales' },
        { key: 'area',              label: 'Área (ej. Cuarto de Máquinas)',     type: 'text', required: false, section: 'datos_generales' },
        { key: 'tecnico',           label: 'Técnico Responsable',              type: 'text', required: true,  section: 'datos_generales' },
        { key: 'potencia',          label: 'Potencia (HP)',                    type: 'number', required: false, section: 'datos_generales' },
        { key: 'capacidad',         label: 'Capacidad (L/SEG)',                type: 'number', required: false, section: 'datos_generales' },
        { key: 'voltaje_operacion', label: 'Voltaje de Operación (V)',         type: 'number', required: false, section: 'datos_generales' },
      ],
    },

    // ── Sección 1 — Succión y Descarga ───────────────────────────────────────
    {
      id: 'succion_descarga',
      title: 'Succión y Descarga',
      fields: [
        { key: '1_1', label: '1.1 ¿La válvula de succión se encuentra abierta?',                     type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_2', label: '1.2 ¿La válvula de succión se encuentra asegurada y/o supervisada?',   type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_3', label: '1.3 ¿La válvula de descarga se encuentra abierta?',                    type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_4', label: '1.4 ¿La válvula de descarga se encuentra asegurada y/o supervisada?',  type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_5', label: '1.5 ¿Se encuentra instalada la válvula de alivio?',                    type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_6', label: '1.6 ¿Se encuentra en buen estado el acoplamiento mecánico?',           type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_7', label: '1.7 ¿Cuenta con las guardas el acoplamiento mecánico?',                type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_8', label: '1.8 ¿Se encuentra el manómetro de la línea de descarga operando?',    type: 'yes_no_na', required: false, section: 'succion_descarga' },
      ],
    },

    // ── Sección 2 — Tablero de Control ──────────────────────────────────────
    {
      id: 'tablero_control',
      title: 'Tablero de Control',
      fields: [
        { key: '2_1', label: '2.1 ¿Se encontró el selector en modo automático?',                    type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_2', label: '2.2 ¿Funcionan los focos pilotos del tablero?',                       type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_3', label: '2.3 ¿Opera correctamente el interruptor principal?',                  type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_4', label: '2.4 ¿El tablero y/o sus componentes son aprobados? (NFPA 20)',        type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_5', label: '2.5 ¿La línea piloto se encuentra instalada correctamente?',          type: 'yes_no_na', required: false, section: 'tablero_control' },
      ],
    },

    // ── Sección 3 — Pruebas ──────────────────────────────────────────────────
    {
      id: 'pruebas',
      title: 'Pruebas',
      fields: [
        // 3.1 — Operación manual
        { key: '3_1', label: '3.1 ¿Opera el equipo de modo manual?',                                            type: 'yes_no_na', required: false, section: 'pruebas' },

        // 3.2 — Operación automática + lecturas de presión
        { key: '3_2',                label: '3.2 ¿Opera el equipo en automático?',                              type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_2_presion_arranque', label: 'Presión de Arranque (PSI)',                                      type: 'number',    required: false, section: 'pruebas' },
        { key: '3_2_presion_paro',     label: 'Presión de Paro (PSI)',                                          type: 'number',    required: false, section: 'pruebas' },

        // 3.3 — Retardo de paro + tiempo
        { key: '3_3',          label: '3.3 ¿El tiempo de retardo de paro es correcto?',                         type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_3_segundos', label: 'Tiempo de retardo (segundos)',                                           type: 'number',    required: false, section: 'pruebas' },

        // 3.4 — Voltaje de entrada + lecturas por fase
        { key: '3_4',              label: '3.4 ¿Se verificó el voltaje de entrada en el interruptor principal?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_4_v_entrada_f1', label: 'Voltaje entrada Fase 1 (V)',                                         type: 'number',    required: false, section: 'pruebas' },
        { key: '3_4_v_entrada_f2', label: 'Voltaje entrada Fase 2 (V)',                                         type: 'number',    required: false, section: 'pruebas' },
        { key: '3_4_v_entrada_f3', label: 'Voltaje entrada Fase 3 (V)',                                         type: 'number',    required: false, section: 'pruebas' },

        // 3.5 — Voltaje de salida + lecturas por fase
        { key: '3_5',            label: '3.5 ¿Se verificó el voltaje de salida en el contactor de arranque?',   type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_5_v_salida_f1', label: 'Voltaje salida Fase 1 (V)',                                           type: 'number',    required: false, section: 'pruebas' },
        { key: '3_5_v_salida_f2', label: 'Voltaje salida Fase 2 (V)',                                           type: 'number',    required: false, section: 'pruebas' },
        { key: '3_5_v_salida_f3', label: 'Voltaje salida Fase 3 (V)',                                           type: 'number',    required: false, section: 'pruebas' },

        // 3.6 — Corriente de trabajo + amperes por fase
        { key: '3_6',         label: '3.6 ¿Se verificó la corriente de trabajo del motor?',                     type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_6_amp_f1',  label: 'Amperes Fase 1 (A)',                                                      type: 'number',    required: false, section: 'pruebas' },
        { key: '3_6_amp_f2',  label: 'Amperes Fase 2 (A)',                                                      type: 'number',    required: false, section: 'pruebas' },
        { key: '3_6_amp_f3',  label: 'Amperes Fase 3 (A)',                                                      type: 'number',    required: false, section: 'pruebas' },

        // 3.7 – 3.14 — Revisiones adicionales
        { key: '3_7',  label: '3.7 ¿El motor cuenta con las RPM adecuadas?',                  type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_8',  label: '3.8 ¿Los empaques de la bomba sellan correctamente?',          type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_9',  label: '3.9 ¿Existen ruidos o vibraciones anormales?',                 type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_10', label: '3.10 ¿Existe sobre calentamiento en carcaza de la bomba?',     type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_11', label: '3.11 ¿Existe sobre calentamiento en carcaza del motor?',       type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_12', label: '3.12 ¿Los estoperos se encuentran lubricados?',                type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_13', label: '3.13 ¿La válvula de alivio se encuentra calibrada?',           type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_14', label: '3.14 ¿El equipo queda en modo automático?',                    type: 'yes_no_na', required: false, section: 'pruebas' },
      ],
    },

    // ── Sección 4 — Evidencia Fotográfica ───────────────────────────────────
    {
      id: 'evidencia_fotografica',
      title: 'Evidencia Fotográfica',
      fields: [
        { key: 'photo_general', label: 'Foto del equipo', type: 'photo', required: false, section: 'evidencia_fotografica' },
      ],
    },

    // ── Sección 5 — Observaciones ────────────────────────────────────────────
    {
      id: 'observaciones',
      title: 'Observaciones',
      fields: [
        { key: 'observaciones', label: 'Observaciones generales', type: 'textarea', required: false, section: 'observaciones' },
      ],
    },

    // ── Sección 6 — Firma ────────────────────────────────────────────────────
    // Only technician signs. No client signature in this form version.
    {
      id: 'firma',
      title: 'Firma',
      fields: [
        { key: 'firma_tecnico', label: 'Firma del técnico inspector', type: 'signature', required: true, section: 'firma' },
      ],
    },
  ],
};
