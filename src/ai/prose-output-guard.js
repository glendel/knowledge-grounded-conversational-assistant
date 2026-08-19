const INTERNAL_REASONING_PATTERNS = Object.freeze([
  /^(?:okay[,.!\s]+)?(?:the user|el usuario)\s+(?:is asking|asks|wants|needs|est[aá]\s+preguntando|pregunta|quiere|necesita)\b/iu,
  /^(?:let me|i need to|i should|we need to|voy a|necesito|debo|deber[ií]a)\s+(?:check|look|verify|review|analyze|answer|respond|list|structure|buscar|revisar|verificar|analizar|responder|enumerar|estructurar)\b/iu,
  /^(?:looking at|reviewing|analyzing|revisando|analizando)\s+(?:the\s+)?(?:provided|approved|available|supplied|registros|evidencia|informaci[oó]n|datos)\b/iu,
  /(?:^|\n)\s*(?:analysis|reasoning|plan|an[aá]lisis|razonamiento|plan)\s*:/iu
]);

export function isInternalReasoning(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 && INTERNAL_REASONING_PATTERNS.some((pattern) => pattern.test(text));
}
