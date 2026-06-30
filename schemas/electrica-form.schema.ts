import { FormSchema } from '../types/form.types';

// ─── Bomba Eléctrica ────────────────────────────────────────────────────────
// One of the three pump forms that make up a site inspection. Same conventions
// as jockey-form.schema.ts (site data + signature live at the inspection level;
// `readingKeys` ties number readings to their question; `parametro` is fixed
// reference text).
//
// vs. the jockey form, the electric pump adds 5 questions: 1.6 (air release
// valve), 1.10 (suction manovacuometer), 1.11 (gear head oil level), 2.4
// (emergency start lever) and 3.2 (emergency start mechanism).

export const electricaForm: FormSchema = {
  id: 'electrica',
  name: 'Bomba Eléctrica',
  version: 1,
  sections: [
    // ── Datos de la bomba ──────────────────────────────────────────────────────
    {
      id: 'datos_bomba',
      title: 'Datos de la bomba',
      fields: [
        { key: 'potencia',  label: 'Potencia (HP)',        type: 'number', required: false, section: 'datos_bomba' },
        { key: 'capacidad', label: 'Capacidad',            type: 'text',   required: false, section: 'datos_bomba' },
        { key: 'voltaje',   label: 'Voltaje de operación', type: 'text',   required: false, section: 'datos_bomba' },
      ],
    },

    // ── Sección 1 — Succión y Descarga ───────────────────────────────────────
    {
      id: 'succion_descarga',
      title: 'Succión y Descarga',
      fields: [
        { key: '1_1',  label: '1.1 ¿La válvula de succión se encuentra abierta?',                     type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_2',  label: '1.2 ¿La válvula de succión se encuentra asegurada y/o supervisada?',   type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_3',  label: '1.3 ¿La válvula de descarga se encuentra abierta?',                    type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_4',  label: '1.4 ¿La válvula de descarga se encuentra asegurada y/o supervisada?',  type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_5',  label: '1.5 ¿Se encuentra instalada la válvula de alivio?',                    type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_6',  label: '1.6 ¿Se encuentra instalada la válvula eliminadora de aire?',          type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_7',  label: '1.7 ¿Se encuentra en buen estado el acoplamiento mecánico?',           type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_8',  label: '1.8 ¿Cuenta con las guardas el acoplamiento mecánico?',                type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_9',  label: '1.9 ¿Se encuentra el manómetro de la línea de descarga operando?',     type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_10', label: '1.10 ¿Se encuentra el manovacuómetro de la línea de succión operando?', type: 'yes_no_na', required: false, section: 'succion_descarga' },
        { key: '1_11', label: '1.11 ¿El nivel de aceite del cabezal de engranes es correcto?',        type: 'yes_no_na', required: false, section: 'succion_descarga' },
      ],
    },

    // ── Sección 2 — Tablero de Control ──────────────────────────────────────
    {
      id: 'tablero_control',
      title: 'Tablero de Control',
      fields: [
        { key: '2_1', label: '2.1 ¿Se encontró el selector en modo automático?',           type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_2', label: '2.2 ¿Funcionan los focos pilotos del tablero?',               type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_3', label: '2.3 ¿Opera correctamente el interruptor principal?',          type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_4', label: '2.4 ¿Se cuenta con palanca de arranque de emergencia?',       type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_5', label: '2.5 ¿El tablero y/o sus componentes son aprobados?',          type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '2_6', label: '2.6 ¿La línea piloto se encuentra instalada correctamente?',  type: 'yes_no_na', required: false, section: 'tablero_control', parametro: 'NFPA 20' },
      ],
    },

    // ── Sección 3 — Pruebas ──────────────────────────────────────────────────
    {
      id: 'pruebas',
      title: 'Pruebas',
      fields: [
        { key: '3_1', label: '3.1 ¿Opera el equipo de modo manual?',                  type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_2', label: '3.2 ¿Opera el mecanismo de arranque de emergencia?',     type: 'yes_no_na', required: false, section: 'pruebas' },

        // 3.3 — Operación automática + lecturas de presión
        { key: '3_3', label: '3.3 ¿Opera el equipo en automático?', type: 'yes_no_na', required: false, section: 'pruebas', readingKeys: ['3_3_presion_arranque', '3_3_presion_paro'] },
        { key: '3_3_presion_arranque', label: 'Presión de Arranque (PSI)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_3_presion_paro',     label: 'Presión de Paro (PSI)',     type: 'number', required: false, section: 'pruebas' },

        // 3.4 — Retardo de paro + tiempo
        { key: '3_4', label: '3.4 ¿El tiempo de retardo de paro es correcto?', type: 'yes_no_na', required: false, section: 'pruebas', readingKeys: ['3_4_segundos'] },
        { key: '3_4_segundos', label: 'Tiempo de retardo (segundos)', type: 'number', required: false, section: 'pruebas' },

        // 3.5 — Voltaje de entrada + lecturas por fase
        { key: '3_5', label: '3.5 ¿Se verificó el voltaje de entrada en el interruptor principal?', type: 'yes_no_na', required: false, section: 'pruebas', readingKeys: ['3_5_v_entrada_f1', '3_5_v_entrada_f2', '3_5_v_entrada_f3'] },
        { key: '3_5_v_entrada_f1', label: 'Voltaje entrada Fase 1 (V)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_5_v_entrada_f2', label: 'Voltaje entrada Fase 2 (V)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_5_v_entrada_f3', label: 'Voltaje entrada Fase 3 (V)', type: 'number', required: false, section: 'pruebas' },

        // 3.6 — Voltaje de salida + lecturas por fase
        { key: '3_6', label: '3.6 ¿Se verificó el voltaje de salida en el contactor de arranque?', type: 'yes_no_na', required: false, section: 'pruebas', readingKeys: ['3_6_v_salida_f1', '3_6_v_salida_f2', '3_6_v_salida_f3'] },
        { key: '3_6_v_salida_f1', label: 'Voltaje salida Fase 1 (V)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_6_v_salida_f2', label: 'Voltaje salida Fase 2 (V)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_6_v_salida_f3', label: 'Voltaje salida Fase 3 (V)', type: 'number', required: false, section: 'pruebas' },

        // 3.7 — Corriente de trabajo + amperes por fase
        { key: '3_7', label: '3.7 ¿Se verificó la corriente de trabajo del motor?', type: 'yes_no_na', required: false, section: 'pruebas', readingKeys: ['3_7_amp_f1', '3_7_amp_f2', '3_7_amp_f3'] },
        { key: '3_7_amp_f1', label: 'Amperes Fase 1 (A)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_7_amp_f2', label: 'Amperes Fase 2 (A)', type: 'number', required: false, section: 'pruebas' },
        { key: '3_7_amp_f3', label: 'Amperes Fase 3 (A)', type: 'number', required: false, section: 'pruebas' },

        // 3.8 – 3.15 — Revisiones adicionales
        { key: '3_8',  label: '3.8 ¿El motor cuenta con las RPM adecuadas?',              type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_9',  label: '3.9 ¿Los empaques de la bomba sellan correctamente?',      type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_10', label: '3.10 ¿Existen ruidos o vibraciones anormales?',            type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_11', label: '3.11 ¿Existe sobre calentamiento en carcaza de la bomba?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_12', label: '3.12 ¿Existe sobre calentamiento en carcaza del motor?',   type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_13', label: '3.13 ¿Los estoperos se encuentran lubricados?',            type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_14', label: '3.14 ¿La válvula de alivio se encuentra calibrada?',        type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '3_15', label: '3.15 ¿El equipo queda en modo automático?',                type: 'yes_no_na', required: false, section: 'pruebas' },
      ],
    },

    // ── Observaciones ────────────────────────────────────────────────────────
    {
      id: 'observaciones',
      title: 'Observaciones',
      fields: [
        { key: 'observaciones', label: 'Observaciones generales', type: 'textarea', required: false, section: 'observaciones' },
      ],
    },

    // ── Evidencia Fotográfica ─────────────────────────────────────────────────
    {
      id: 'evidencia_fotografica',
      title: 'Evidencia Fotográfica',
      fields: [
        { key: 'photo_general', label: 'Foto del equipo', type: 'photo', required: false, section: 'evidencia_fotografica' },
      ],
    },
  ],
};
