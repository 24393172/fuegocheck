import { FormSchema } from '../types/form.types';

export const tableroAdForm: FormSchema = {
  id: 'tablero_ad',
  name: 'Tablero de Alarma y Deteccion Direccionado',
  version: 2,
  sections: [
    {
      id: 'condiciones_generales',
      title: 'Condiciones generales',
      fields: [
        { key: '1_1', label: '¿El tablero se encuentra en un lugar accesible?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_2', label: '¿Se encontro cerrado el panel?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_3', label: '¿La temperatura del area es adecuada?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_4', label: '¿El tablero esta en operación?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_5', label: '¿El tablero esta libre de señalizaciones de Alarma?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_6', label: '¿El tablero esta libre de señalizaciones de Problemas?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_7', label: '¿El tablero esta libre de señalizaciones de Supervision?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_8', label: '¿El tablero esta libre de señalizaciones de Seguridad?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_9', label: '¿El tablero esta libre de falla a tierra?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_10', label: '¿Esta habilitada la deteccion de falla a tierra?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
        { key: '1_11', label: '¿Las condiciones internas del tablero son adecuadas?', type: 'yes_no_na', required: true, section: 'condiciones_generales' },
      ],
    },
    {
      id: 'pruebas',
      title: 'Pruebas',
      fields: [
        { key: '2_1', label: '¿El suministro de energia electrica esta regulado?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_2', label: '¿El suministro de energia electrica es correcto?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_3', label: '¿El tablero opera al desconectar la energía de C.A.?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_4', label: '¿EL cargador de baterías funciona correctamente?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_5', label: '¿Operan correctamente las baterias?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_6', label: '¿Las terminales en baterias se encuentran libre de sulfatacion?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_7', label: '¿El sistema opera en condiciones de Alarma?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_8', label: '¿El sistema opera en condiciones de Problema?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_9', label: '¿El sistema opera en condiciones de Supervision?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_10', label: '¿El sistema opera en condiciones de Seguridad?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_11', label: '¿La señal audible del tablero opera?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_12', label: '¿Operan correctamente las luces de señalizacion?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_13', label: '¿Operan correctamente las teclas de panel?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_14', label: '¿La fecha y hora son correctas?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_15', label: '¿La impresora opera correctamente?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_16', label: '¿Se realizo la limpieza y ajuste de terminales?', type: 'yes_no_na', required: true, section: 'pruebas' },
        { key: '2_17', label: '¿El panel remoto opera correctamente?', type: 'yes_no_na', required: true, section: 'pruebas' },
      ],
    },
    {
      id: 'observaciones',
      title: 'Observaciones',
      fields: [
        { key: 'observaciones', label: 'Observaciones generales', type: 'textarea', required: false, section: 'observaciones' },
      ],
    },
  ],
};

function deviceForm(id: string, name: string, firstField: string): FormSchema {
  return {
    id,
    name,
    version: 1,
    sections: [
      {
        id: 'datos_dispositivo',
        title: 'Datos del dispositivo',
        fields: [
          { key: 'identificador', label: firstField, type: 'text', required: false, section: 'datos_dispositivo' },
          { key: 'loop', label: 'Loop', type: 'text', required: false, section: 'datos_dispositivo' },
          { key: 'dispositivo', label: 'Dispositivo', type: 'text', required: false, section: 'datos_dispositivo' },
          { key: 'ubicacion', label: 'Ubicacion', type: 'text', required: false, section: 'datos_dispositivo' },
        ],
      },
      {
        id: 'pruebas',
        title: 'Pruebas',
        fields: [
          { key: 'alarma', label: 'Alarma', type: 'yes_no_na', required: false, section: 'pruebas' },
          { key: 'supervision', label: 'Supervision', type: 'yes_no_na', required: false, section: 'pruebas' },
          { key: 'limpieza', label: 'Limpieza', type: 'yes_no_na', required: false, section: 'pruebas' },
        ],
      },
      {
        id: 'observaciones',
        title: 'Observaciones',
        fields: [
          { key: 'observaciones', label: 'Comentarios / observaciones', type: 'textarea', required: false, section: 'observaciones' },
        ],
      },
    ],
  };
}

export const dispositivosAdForm = deviceForm('dispositivos_ad', 'Dispositivos Direccionados de A&D', 'Direccion');
export const dispositivosConvencionalesForm = deviceForm('dispositivos_convencionales', 'Dispositivos Convencionales de A&D', 'Modulo');
export const dispositivosNotificacionForm = deviceForm('dispositivos_notificacion', 'Dispositivos de Notificacion de A&D', 'Modulo');

export const hidrantesForm: FormSchema = {
  id: 'hidrantes',
  name: 'Hidrantes',
  version: 1,
  sections: [
    {
      id: 'datos_hidrante',
      title: 'Datos del hidrante',
      fields: [
        { key: 'numero', label: 'Numero', type: 'number', required: false, section: 'datos_hidrante' },
        { key: 'ubicacion', label: 'Ubicacion', type: 'text', required: false, section: 'datos_hidrante' },
      ],
    },
    {
      id: 'componentes',
      title: 'Componentes',
      fields: [
        { key: 'gabinete', label: 'Gabinete', type: 'yes_no_na', required: false, section: 'componentes' },
        { key: 'senalamiento', label: 'Senalamiento', type: 'yes_no_na', required: false, section: 'componentes' },
        { key: 'calcomania', label: 'Calcomania', type: 'yes_no_na', required: false, section: 'componentes' },
        { key: 'valvula_angular', label: 'Valvula angular', type: 'yes_no_na', required: false, section: 'componentes' },
        { key: 'manguera', label: 'Manguera', type: 'yes_no_na', required: false, section: 'componentes' },
        { key: 'chiflon', label: 'Chiflon', type: 'yes_no_na', required: false, section: 'componentes' },
        { key: 'llave_acople', label: 'Llave de acople', type: 'yes_no_na', required: false, section: 'componentes' },
      ],
    },
    {
      id: 'observaciones',
      title: 'Observaciones',
      fields: [
        { key: 'observaciones', label: 'Comentarios', type: 'textarea', required: false, section: 'observaciones' },
      ],
    },
  ],
};

export const extintoresForm: FormSchema = {
  id: 'extintores',
  name: 'Extintores',
  version: 1,
  sections: [
    {
      id: 'datos_extintor',
      title: 'Datos del extintor',
      fields: [
        { key: 'numero', label: 'Numero', type: 'number', required: false, section: 'datos_extintor' },
        { key: 'ubicacion', label: 'Ubicacion', type: 'text', required: false, section: 'datos_extintor' },
        { key: 'tipo_extintor', label: 'Tipo de extintor', type: 'text', required: false, section: 'datos_extintor' },
        { key: 'capacidad', label: 'Capacidad', type: 'text', required: false, section: 'datos_extintor' },
        { key: 'proxima_recarga', label: 'Proxima recarga', type: 'text', required: false, section: 'datos_extintor' },
      ],
    },
    {
      id: 'revision',
      title: 'Revision',
      fields: [
        { key: 'presion', label: 'Presion', type: 'yes_no_na', required: false, section: 'revision' },
        { key: 'altura', label: 'Altura', type: 'yes_no_na', required: false, section: 'revision' },
        { key: 'seguro', label: 'Seguro', type: 'yes_no_na', required: false, section: 'revision' },
        { key: 'pintura', label: 'Pintura', type: 'yes_no_na', required: false, section: 'revision' },
        { key: 'manguera', label: 'Manguera', type: 'yes_no_na', required: false, section: 'revision' },
        { key: 'difusor', label: 'Difusor', type: 'yes_no_na', required: false, section: 'revision' },
        { key: 'senalamiento', label: 'Senalamiento', type: 'yes_no_na', required: false, section: 'revision' },
      ],
    },
    {
      id: 'observaciones',
      title: 'Observaciones',
      fields: [
        { key: 'observaciones', label: 'Observaciones', type: 'textarea', required: false, section: 'observaciones' },
      ],
    },
  ],
};

export const ansulR102Form: FormSchema = {
  id: 'ansul_r102',
  name: 'Sistema Ansul R-102',
  version: 2,
  sections: [
    {
      id: 'datos_sistema',
      title: 'Datos del sistema',
      fields: [
        { key: 'systemName', label: 'Nombre o identificación del sistema', type: 'text', required: false, section: 'datos_sistema' },
        { key: 'capacidad_galones', label: 'Capacidad en galones', type: 'text', required: false, section: 'datos_sistema' },
        { key: 'photo_general', label: 'Evidencia general del sistema Ansul', type: 'photo', required: false, section: 'datos_sistema' },
      ],
    },
    {
      id: 'revision',
      title: 'Revision',
      fields: [
        { key: '1', label: '1. ¿Se encuentra el Automan en un lugar accesible?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '2', label: '2. ¿Las condicines del líquido Ansulex son las correctas?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '3', label: '3. ¿Se cuenta con tanques esclavos?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '4', label: '4. ¿Los cilindros contenedores de líquido Ansulex se encuentran libres de daños físicos?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '5', label: '5. ¿El cartucho de nitrógeno (agente de expulsión) es el correcto?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '6', label: '6. ¿Las boquillas en el pleno de la campana son las indicadas?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '7', label: '7. ¿Las boquillas en los ductos son las indicadas?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '8', label: '8. ¿Todos los muebles se encuentran protegidos correctamente?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '9', label: '9. ¿Existen freidoras?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '10', label: '10. ¿Existen estufones?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '11', label: '11. ¿Existen planchas?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '12', label: '12. ¿Existen parrillas?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '13', label: '13. ¿Existen salamandras?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '14', label: '14. ¿La estación manual se encuentra en un lugar accesible?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '15', label: '15. ¿El rango de los fusibles es el indicado de acuerdo al riesgo?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '16', label: '16. ¿La válvula de corte de gas opera correctamente?', type: 'yes_no_na', required: true, section: 'revision' },
        { key: '17', label: '17. ¿Se realizaron pruebas de operación sin descarga de agente Ansulex?', type: 'yes_no_na', required: true, section: 'revision' },
      ],
    },
    {
      id: 'observaciones',
      title: 'Observaciones',
      fields: [
        { key: 'observaciones', label: 'Observaciones', type: 'textarea', required: false, maxLength: 960, section: 'observaciones' },
      ],
    },
  ],
};
