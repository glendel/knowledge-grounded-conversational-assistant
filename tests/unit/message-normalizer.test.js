import assert from 'node:assert/strict';
import test from 'node:test';

import { inferMessageLanguage, normalizeUserMessage } from '../../src/conversation/message-normalizer.js';

test('infers Spanish from ordinary prose without trusting an external language hint', () => {
  assert.equal(inferMessageLanguage('Explícamelo con palabras más simples.', ['en', 'es']), 'es');
  assert.equal(inferMessageLanguage('Me expresé mal: quiero saber quién toma la decisión.', ['en', 'es']), 'es');
  assert.equal(inferMessageLanguage('No, prefiero seguir dentro de la documentación aprobada.', ['en', 'es']), 'es');
  assert.equal(normalizeUserMessage({ message: '¿Qué ocurre con las fuentes sin aprobar?', supportedLanguages: ['en', 'es'], maximumCharacters: 500 }).language, 'es');
});

test('keeps clear English prose in English', () => {
  assert.equal(inferMessageLanguage('Please explain the deployment boundary simply.', ['en', 'es']), 'en');
});
