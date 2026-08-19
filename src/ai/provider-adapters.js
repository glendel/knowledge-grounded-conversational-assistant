import { FoundationError } from '../core/foundation-error.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OLLAMA_CLOUD_URL = 'https://ollama.com/api/chat';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ProviderTransportError extends FoundationError {
  constructor(message, { code, category, retryable, status = null, cause = null } = {}) {
    super(message, { code, cause });
    this.category = category;
    this.retryable = retryable;
    this.status = status;
  }
}

function joinText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

function providerFailureFromStatus(status) {
  if (status === 401 || status === 403) return { code: 'PROVIDER_AUTHENTICATION_FAILED', category: 'authentication', retryable: false };
  if (status === 408 || status === 504) return { code: 'PROVIDER_TIMEOUT', category: 'timeout', retryable: true };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', category: 'rate_limit', retryable: true };
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', category: 'unavailable', retryable: true };
  return { code: 'PROVIDER_REQUEST_REJECTED', category: 'request_rejected', retryable: false };
}

async function postJson({ url, headers, body, timeoutMs, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (cause) {
    const timeout = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
    throw new ProviderTransportError(timeout ? 'Provider request timed out.' : 'Provider request could not be completed.', {
      code: timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      category: timeout ? 'timeout' : 'unavailable',
      retryable: true,
      cause
    });
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ProviderTransportError('Provider returned a non-JSON transport response.', {
      code: 'PROVIDER_INVALID_RESPONSE', category: 'invalid_response', retryable: false, status: response.status, cause
    });
  }
  if (!response.ok) {
    const failure = providerFailureFromStatus(response.status);
    throw new ProviderTransportError('Provider rejected or could not complete the request.', { ...failure, status: response.status });
  }
  return payload;
}

const REASONING_RATIOS = Object.freeze({ minimal: 0.1, low: 0.2, medium: 0.5, high: 0.8, xhigh: 0.95, max: 0.95 });

function generationOptions(request, provider, lane = {}) {
  const options = {};
  if (request.generation.temperature !== null) options.temperature = request.generation.temperature;
  if (provider === 'openrouter') {
    const finalOutputTokens = Math.ceil(request.generation.maxOutputCharacters / 4);
    const effort = lane.reasoning?.effort;
    const ratio = REASONING_RATIOS[effort] ?? 0;
    options.max_tokens = ratio > 0 ? Math.max(finalOutputTokens + 1024, Math.ceil(finalOutputTokens / (1 - ratio))) : finalOutputTokens;
    if (lane.reasoning !== null && lane.reasoning !== undefined) options.reasoning = lane.reasoning;
  }
  if (provider === 'ollama') options.num_predict = Math.ceil(request.generation.maxOutputCharacters / 4);
  if (provider === 'gemini') options.maxOutputTokens = Math.min(8192, Math.max(256, Math.ceil(request.generation.maxOutputCharacters / 4) + 256));
  return options;
}

export async function generateOpenRouterProse({ request, lane, secret, fetchImpl = globalThis.fetch }) {
  const payload = await postJson({
    url: OPENROUTER_URL,
    headers: { authorization: `Bearer ${secret}` },
    body: { model: lane.model, messages: request.messages, stream: false, ...generationOptions(request, 'openrouter', lane) },
    timeoutMs: lane.timeoutMs,
    fetchImpl
  });
  const text = joinText(payload?.choices?.[0]?.message?.content);
  if (!text) throw new ProviderTransportError('Provider response did not contain normal prose.', { code: 'PROVIDER_INVALID_RESPONSE', category: 'invalid_response', retryable: false });
  return { text, finishReason: payload.choices?.[0]?.finish_reason ?? null, usage: payload.usage ? { inputTokens: payload.usage.prompt_tokens ?? null, outputTokens: payload.usage.completion_tokens ?? null, totalTokens: payload.usage.total_tokens ?? null } : null };
}

export async function generateOllamaCloudProse({ request, lane, secret, fetchImpl = globalThis.fetch }) {
  const payload = await postJson({
    url: OLLAMA_CLOUD_URL,
    headers: { authorization: `Bearer ${secret}` },
    body: { model: lane.model, messages: request.messages, stream: false, options: generationOptions(request, 'ollama') },
    timeoutMs: lane.timeoutMs,
    fetchImpl
  });
  const text = joinText(payload?.message?.content);
  if (!text) throw new ProviderTransportError('Provider response did not contain normal prose.', { code: 'PROVIDER_INVALID_RESPONSE', category: 'invalid_response', retryable: false });
  return { text, finishReason: payload.done_reason ?? null, usage: { inputTokens: payload.prompt_eval_count ?? null, outputTokens: payload.eval_count ?? null, totalTokens: null } };
}

export async function generateGoogleGeminiProse({ request, lane, secret, fetchImpl = globalThis.fetch }) {
  const systemText = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const contents = request.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const payload = await postJson({
    url: `${GEMINI_BASE_URL}/${encodeURIComponent(lane.model)}:generateContent`,
    headers: { 'x-goog-api-key': secret },
    body: { ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}), contents, generationConfig: { ...generationOptions(request, 'gemini'), ...(lane.geminiThinkingLevel ? { thinkingConfig: { thinkingLevel: lane.geminiThinkingLevel } } : {}) } },
    timeoutMs: lane.timeoutMs,
    fetchImpl
  });
  const text = joinText(payload?.candidates?.[0]?.content?.parts);
  if (!text) throw new ProviderTransportError('Provider response did not contain normal prose.', { code: 'PROVIDER_INVALID_RESPONSE', category: 'invalid_response', retryable: false });
  return { text, finishReason: payload.candidates?.[0]?.finishReason ?? null, usage: payload.usageMetadata ? { inputTokens: payload.usageMetadata.promptTokenCount ?? null, outputTokens: payload.usageMetadata.candidatesTokenCount ?? null, totalTokens: payload.usageMetadata.totalTokenCount ?? null } : null };
}

export function createDeterministicProseAdapter({ text = 'Offline provider probe response.' } = {}) {
  return async () => ({ text, finishReason: 'stop', usage: null });
}

export const builtInProviderAdapters = Object.freeze({
  openrouter: generateOpenRouterProse,
  ollama_cloud: generateOllamaCloudProse,
  google_gemini: generateGoogleGeminiProse
});
