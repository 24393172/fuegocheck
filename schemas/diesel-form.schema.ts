import { FormSchema } from '../types/form.types';

// ─── Bomba de Combustión Interna Diésel ─────────────────────────────────────
// One of the three pump forms that make up a site inspection. Same conventions
// as the other pump schemas (site data + signature live at the inspection level;
// `readingKeys` ties number readings to their question; `parametro` is fixed
// reference text).
//
// The diesel pump form is structurally different from the jockey/electric ones:
// instead of a control panel + electrical tests, it covers battery bank, cooling,
// lubrication/fuel and the drive system. It has no "Pruebas" section.

export const dieselForm: FormSchema = {
  id: 'diesel',
  name: 'Bomba de Combustión Interna Diésel',
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

    // ── Sección 2 — Banco de Baterías ──────────────────────────────────────
    {
      id: 'banco_baterias',
      title: 'Banco de Baterías',
      fields: [
        { key: '2_1', label: '2.1 ¿Los bornes y terminales de los bancos de batería se encuentran sin corrosión?', type: 'yes_no_na', required: false, section: 'banco_baterias' },

        // 2.2 — Cargador + lecturas por banco
        { key: '2_2', label: '2.2 ¿El cargador opera correctamente?', type: 'yes_no_na', required: false, section: 'banco_baterias', readingKeys: ['2_2_banco_1', '2_2_banco_2'] },
        { key: '2_2_banco_1', label: 'Banco #1', type: 'text', required: false, section: 'banco_baterias' },
        { key: '2_2_banco_2', label: 'Banco #2', type: 'text', required: false, section: 'banco_baterias' },

        // 2.3 — Voltaje de baterías + lecturas por banco
        { key: '2_3', label: '2.3 ¿El voltaje de las baterías es el correcto?', type: 'yes_no_na', required: false, section: 'banco_baterias', readingKeys: ['2_3_banco_1', '2_3_banco_2'] },
        { key: '2_3_banco_1', label: 'Banco #1 (V)', type: 'number', required: false, section: 'banco_baterias' },
        { key: '2_3_banco_2', label: 'Banco #2 (V)', type: 'number', required: false, section: 'banco_baterias' },
      ],
    },

    // ── Sección 3 — Sistema de Enfriamiento ──────────────────────────────────
    {
      id: 'sistema_enfriamiento',
      title: 'Sistema de Enfriamiento',
      fields: [
        { key: '3_1', label: '3.1 ¿Es correcto el nivel y estado del líquido anticongelante?', type: 'yes_no_na', required: false, section: 'sistema_enfriamiento' },
        { key: '3_2', label: '3.2 ¿Se encuentra libre de fugas el sistema de enfriamiento?',   type: 'yes_no_na', required: false, section: 'sistema_enfriamiento' },
        { key: '3_3', label: '3.3 ¿Funciona correctamente el precalentador?',                  type: 'yes_no_na', required: false, section: 'sistema_enfriamiento' },
      ],
    },

    // ── Sección 4 — Sistema de Lubricación y Combustible ──────────────────────
    {
      id: 'lubricacion_combustible',
      title: 'Sistema de Lubricación y Combustible',
      fields: [
        { key: '4_1', label: '4.1 ¿El nivel y calidad de aceite es el correcto?',                          type: 'yes_no_na', required: false, section: 'lubricacion_combustible' },
        { key: '4_2', label: '4.2 ¿Se encuentra libre de fugas de aceite el sistema de lubricación?',      type: 'yes_no_na', required: false, section: 'lubricacion_combustible' },
        { key: '4_3', label: '4.3 ¿El nivel del tanque de diésel es el correcto?',                         type: 'yes_no_na', required: false, section: 'lubricacion_combustible', parametro: '2/3 NFPA 20' },
        { key: '4_4', label: '4.4 ¿Existen fugas en las líneas de alimentación y retorno de combustible?', type: 'yes_no_na', required: false, section: 'lubricacion_combustible' },
      ],
    },

    // ── Sección 5 — Sistema Motriz ────────────────────────────────────────────
    {
      id: 'sistema_motriz',
      title: 'Sistema Motriz',
      fields: [
        { key: '5_1', label: '5.1 ¿El estado físico de las bandas es correcto?',              type: 'yes_no_na', required: false, section: 'sistema_motriz' },
        { key: '5_2', label: '5.2 ¿Cuenta con guardas de protección las bandas?',             type: 'yes_no_na', required: false, section: 'sistema_motriz' },
        { key: '5_3', label: '5.3 ¿El estado físico de las mangueras es correcto?',           type: 'yes_no_na', required: false, section: 'sistema_motriz' },
        { key: '5_4', label: '5.4 ¿El estado físico de cables y conectores es correcto?',     type: 'yes_no_na', required: false, section: 'sistema_motriz' },
        // 5.5 — Contactor de arranque manual + lecturas de ambos bancos.
        { key: '5_5', label: '5.5 ¿El motor cuenta con contactor de arranque manual?', type: 'yes_no_na', required: false, section: 'sistema_motriz', readingKeys: ['5_5_banco_1', '5_5_banco_2'] },
        { key: '5_5_banco_1', label: 'Banco #1', type: 'text', required: false, section: 'sistema_motriz' },
        { key: '5_5_banco_2', label: 'Banco #2', type: 'text', required: false, section: 'sistema_motriz' },
      ],
    },

    {
      id: 'tablero_control',
      title: 'Tablero de Control',
      fields: [
        { key: '6_1', label: '6.1 ¿Se encontró el selector en modo automático?', type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '6_2', label: '6.2 ¿Funcionan los focos pilotos del tablero?', type: 'yes_no_na', required: false, section: 'tablero_control' },
        {
          key: '6_3',
          label: '6.3 ¿La alimentación eléctrica de los cargadores es correcta?',
          type: 'yes_no_na',
          required: false,
          section: 'tablero_control',
          readingKeys: ['6_3_banco_1', '6_3_banco_2'],
        },
        { key: '6_3_banco_1', label: 'Banco #1', type: 'text', required: false, section: 'tablero_control' },
        { key: '6_3_banco_2', label: 'Banco #2', type: 'text', required: false, section: 'tablero_control' },
        { key: '6_5', label: '6.5 ¿El tablero y/o sus componentes son aprobados?', type: 'yes_no_na', required: false, section: 'tablero_control' },
        { key: '6_6', label: '6.6 ¿La línea piloto se encuentra instalada correctamente?', type: 'yes_no_na', required: false, section: 'tablero_control', parametro: 'NFPA 20' },
      ],
    },

    {
      id: 'pruebas',
      title: 'Pruebas',
      fields: [
        {
          key: '7_1',
          label: '7.1 ¿Opera el equipo en automático?',
          type: 'yes_no_na',
          required: false,
          section: 'pruebas',
          readingKeys: ['7_1_presion_arranque', '7_1_presion_paro'],
        },
        { key: '7_1_presion_arranque', label: 'Presión de Arranque (PSI)', type: 'number', required: false, section: 'pruebas' },
        { key: '7_1_presion_paro', label: 'Presión de Paro (PSI)', type: 'number', required: false, section: 'pruebas' },
        { key: '7_2', label: '7.2 ¿Opera con el banco de batería #1?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_3', label: '7.3 ¿Opera con el banco de batería #2?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_4', label: '7.4 ¿El motor cuenta con las RPM adecuadas?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_5', label: '7.5 ¿Los empaques de la bomba sellan correctamente?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_6', label: '7.6 ¿Existen ruidos o vibraciones anormales?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_7', label: '7.7 ¿Existe sobrecalentamiento en la carcasa de la bomba?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_8', label: '7.8 ¿Existe sobrecalentamiento en la carcasa del motor?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_9', label: '7.9 ¿Los estoperos se encuentran lubricados?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_10', label: '7.10 ¿La válvula de alivio se encuentra calibrada?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_11', label: '7.11 ¿Existe sobrecalentamiento en el cabezal de engranes?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_12', label: '7.12 ¿La presión de aceite es correcta?', type: 'yes_no_na', required: false, section: 'pruebas', parametro: '30 a 75 Psi' },
        { key: '7_13', label: '7.13 ¿La temperatura del motor es la adecuada?', type: 'yes_no_na', required: false, section: 'pruebas', parametro: '82°C a 93° C' },
        { key: '7_14', label: '7.14 ¿La presión en la línea de enfriamiento es correcta?', type: 'yes_no_na', required: false, section: 'pruebas', parametro: '15 a 30 Psi' },
        { key: '7_17', label: '7.17 ¿Opera la alarma de baja presión de aceite?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_18', label: '7.18 ¿Opera la alarma de alta temperatura?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_19', label: '7.19 ¿Opera la alarma de falla de energía?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_20', label: '7.20 ¿Existe circulación de agua por el By-Pass del sistema de enfriamiento?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_21', label: '7.21 ¿El panel de instrumentación del motor opera correctamente?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_22', label: '7.22 ¿El tablero se encuentra supervisado?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_23', label: '7.23 ¿Los filtros del By-Pass están limpios?', type: 'yes_no_na', required: false, section: 'pruebas' },
        { key: '7_24', label: '7.24 ¿El equipo queda en modo automático?', type: 'yes_no_na', required: false, section: 'pruebas' },
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
