import assert from 'node:assert/strict';
import test from 'node:test';

import { ProviderTransportError, createDeterministicProseAdapter, generateGoogleGeminiProse, generateOllamaCloudProse, generateOpenRouterProse } from '../../src/ai/provider-adapters.js';

const request = Object.freeze({ messages: [{ role: 'system', content: 'Be helpful.' }, { role: 'user', content: 'Hola.' }], generation: { temperature: 0.2, maxOutputCharacters: 600 } });
const lane = Object.freeze({ model: 'test-model', timeoutMs: 30000 });

function jsonResponse(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); }

test('OpenRouter adapter requests and returns normal prose without a response-format constraint', async () => {
  let captured;
  const result = await generateOpenRouterProse({ request, lane, secret: 'secret', fetchImpl: async (_url, options) => { captured = options; return jsonResponse({ choices: [{ message: { content: '¡Hola! ¿Cómo puedo ayudarte?' }, finish_reason: 'stop' }] }); } });
  assert.equal(result.text, '¡Hola! ¿Cómo puedo ayudarte?');
  const body = JSON.parse(captured.body);
  assert.deepEqual(body.messages, request.messages);
  assert.equal(body.response_format, undefined);
  assert.equal(body.stream, false);
});

test('Ollama Cloud adapter uses the normal chat response content', async () => {
  const result = await generateOllamaCloudProse({ request, lane, secret: 'secret', fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); assert.equal(body.stream, false); assert.equal(body.format, undefined); return jsonResponse({ message: { content: 'Normal prose.' }, done_reason: 'stop', prompt_eval_count: 2, eval_count: 3 }); } });
  assert.equal(result.text, 'Normal prose.');
  assert.deepEqual(result.usage, { inputTokens: 2, outputTokens: 3, totalTokens: null });
});

test('Gemini adapter maps system instructions separately and preserves prose output', async () => {
  const result = await generateGoogleGeminiProse({ request, lane, secret: 'secret', fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); assert.equal(body.systemInstruction.parts[0].text, 'Be helpful.'); assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'Hola.' }] }]); return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Respuesta natural.' }] }, finishReason: 'STOP' }] }); } });
  assert.equal(result.text, 'Respuesta natural.');
});
test('provider transport maps a rate limit to a typed technical failure without exposing its body', async () => {
  await assert.rejects(
    generateOpenRouterProse({ request, lane, secret: 'secret', fetchImpl: async () => jsonResponse({ error: { message: 'sensitive upstream detail' } }, 429) }),
    (error) => error instanceof ProviderTransportError && error.code === 'PROVIDER_RATE_LIMITED' && error.category === 'rate_limit' && error.retryable === true && !error.message.includes('sensitive')
  );
});
test('deterministic adapter provides repeatable offline prose without provider transport', async () => {
  const adapter = createDeterministicProseAdapter({ text: 'Respuesta repetible.' });
  assert.deepEqual(await adapter(), { text: 'Respuesta repetible.', finishReason: 'stop', usage: null });
});
test('Gemini lane profile can reserve a low thinking level while retaining normal prose output', async () => {
  await generateGoogleGeminiProse({ request, lane: { ...lane, geminiThinkingLevel: 'low' }, secret: 'secret', fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low'); assert.ok(body.generationConfig.maxOutputTokens >= 256); return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Natural response.' }] }, finishReason: 'STOP' }] }); } });
});
