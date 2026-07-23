import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ansulProgress,
  ansulToFlatValues,
  buildAnsulData,
  normalizeAnsulData,
  wrapAnsulObservations,
} from '../../lib/ansul.js';
import { ansulR102Form } from '../../schemas/additional-form.schema.js';

test('normalizeAnsulData migrates the legacy flat slice without duplicating answers', () => {
  const legacy = {
    pumps: {
      ansul_r102: {
        sistema: 'Cocina principal',
        capacidad_galones: '3',
        '1': 'si',
        '1_cantidad': '2',
        '1_modelo': 'R-102-A',
        '1_comentario': 'Correcto',
        observaciones: 'Inspección anterior',
      },
    },
  };
  const normalized = normalizeAnsulData(legacy, ansulR102Form, 123);
  assert.equal(normalized.data.systemName, 'Cocina principal');
  assert.equal(normalized.data.capacityGallons, '3');
  assert.deepEqual(normalized.data.answers['1'], {
    questionId: '1',
    answer: 'si',
    quantity: '2',
    model: 'R-102-A',
    comment: 'Correcto',
  });
  assert.equal(Object.keys(normalized.data.answers).length, 1);
  assert.equal(normalized.data.observations, 'Inspección anterior');
});

test('normalizeAnsulData records duplicate and unverifiable legacy question IDs', () => {
  const normalized = normalizeAnsulData({
    ansul: {
      answers: [
        { questionId: '1', answer: 'si' },
        { questionId: '1', answer: 'no' },
        { questionId: '99', answer: 'na' },
      ],
    },
  }, ansulR102Form, 123);
  assert.equal(normalized.data.answers['1'].answer, 'si');
  assert.equal(normalized.data.normalizationIssues.length, 2);
  assert.equal(normalized.data.answers['99'], undefined);
});

test('Ansul round trip keeps quantity/model and requires the 17 answers only', () => {
  const values: Record<string, unknown> = {
    systemName: 'Sistema A',
    capacidad_galones: '3',
    observaciones: 'Sin novedades',
  };
  for (let index = 1; index <= 17; index += 1) values[String(index)] = 'si';
  values['1_quantity'] = '2';
  values['1_model'] = 'R-102-A';
  const built = buildAnsulData(ansulR102Form, values);
  const progress = ansulProgress(ansulR102Form, built);
  assert.equal(progress.complete, true);
  assert.equal(progress.answered, 17);
  assert.equal(built.answers['1'].quantity, '2');
  assert.equal(built.answers['1'].model, 'R-102-A');
  assert.equal(ansulToFlatValues(built)['1_model'], 'R-102-A');
});

test('Ansul observations preserve explicit lines and reject a ninth rendered line', () => {
  assert.deepEqual(wrapAnsulObservations('Línea 1\nLínea 2').lines, ['Línea 1', 'Línea 2']);
  const invalid = wrapAnsulObservations(Array.from({ length: 9 }, (_, index) => `Línea ${index + 1}`).join('\n'));
  assert.equal(invalid.valid, false);
  assert.match(invalid.message ?? '', /9 líneas/);
});
