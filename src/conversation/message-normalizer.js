import { FoundationError } from '../core/foundation-error.js';

export function normalizeUserMessage({ message, supportedLanguages, maximumCharacters } = {}) {
  if (typeof message !== 'string') throw new FoundationError('A text message is required.', { code: 'RUNTIME_MESSAGE_INVALID' });
  if (!Array.isArray(supportedLanguages) || supportedLanguages.length === 0) throw new FoundationError('Configured supported languages are required.', { code: 'RUNTIME_LANGUAGE_CONFIGURATION_INVALID' });
  if (!Number.isInteger(maximumCharacters) || maximumCharacters < 1) throw new FoundationError('A positive message limit is required.', { code: 'RUNTIME_MESSAGE_LIMIT_INVALID' });
  const text = message.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (text.length === 0 || text.length > maximumCharacters) {
    throw new FoundationError('Message is empty or exceeds the configured limit.', { code: 'RUNTIME_MESSAGE_LIMIT' });
  }
  return Object.freeze({ text, language: inferMessageLanguage(text, supportedLanguages) });
}

export function inferMessageLanguage(message, supportedLanguages) {
  const original = String(message);
  const normalized = original.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('und');
  const spanish = languageSignal(normalized, SPANISH_SIGNALS) + (/[¿¡]/u.test(original) ? 2 : 0);
  const english = languageSignal(normalized, ENGLISH_SIGNALS);
  if (spanish > english && supportedLanguages.includes('es')) return 'es';
  if (english > spanish && supportedLanguages.includes('en')) return 'en';
  return supportedLanguages[0];
}

// These are intentionally ordinary language markers, not business vocabulary.
// They keep a quoted product, menu, or source term from deciding the user language.
const SPANISH_SIGNALS = /\b(hola|gracias|como|que|necesito|puedo|ayuda|sistema|factura|configurar|favor|explic[a-z]*|quiero|quien|prefiero|documentacion|entendido|ahora|antes|terminar|queda|fuera|dentro|sobre|puede|pueden|fuentes|revisar|aprobada|conocimiento|despliegue|fase|hechos|tengo|tienes|tenemos|para|con|por|donde|cuando|cual|cuales|tambien|solo|muchas|hasta|luego|adios|buenos|dias|puedes|podrias|debo|deberia|quieres|quiere|hablo|hablar|elegir|precio|pedido|disponible|ahora)\b/gu;
const ENGLISH_SIGNALS = /\b(hello|hi|good morning|good afternoon|good evening|thanks|thank|please|help|system|invoice|configure|how|what|who|why|where|when|which|approved|knowledge|deployment|runtime|before|finish|outside|inside|prefer|simple|explain|the|and|with|for|from|this|that|these|those|my|your|can|could|would|should|does|is|are|was|were|have|has|will|need|want|tell|says|message|user|invalid|capitalization|matter|change|bill|already|accepted|pending|electronic|documents|send|alert|reset|password|safe|information|give|support|remember|trying|issue|related|accounting|period|year|without|close|detail|screen|guide|precisely|summarize|steps|anything|avoid|clear|goodbye)\b/gu;

function languageSignal(text, expression) {
  return [...text.matchAll(expression)].length;
}
