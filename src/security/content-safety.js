const PATTERNS = Object.freeze([
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['phone', /(?<!\d)(?:\+?\d[\d .()\-]{6,}\d)(?!\d)/g],
  ['credential', /\b(?:sk|pk|AIza|ghp|glpat|xoxb)[A-Z0-9_\-]{8,}\b/gi],
  ['authorization', /\bBearer\s+[A-Z0-9._\-]{8,}\b/gi],
  ['url_query_secret', /https?:\/\/[^\s?#]+\?[^\s#]*(?:token|key|secret|password|signature)=[^\s&#]+[^\s]*/gi],
  ['card_like_number', /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g]
]);

export function detectSensitiveCandidates(text) {
  if (typeof text !== 'string') return Object.freeze([]);
  const findings = [];
  for (const [kind, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push(Object.freeze({ kind, start: match.index, end: match.index + match[0].length }));
    }
  }
  findings.sort((a, b) => a.start - b.start || b.end - a.end);
  return Object.freeze(removeOverlaps(findings));
}

export function redactSensitiveText(text) {
  if (typeof text !== 'string') return Object.freeze({ text: '', findings: Object.freeze([]) });
  const findings = detectSensitiveCandidates(text);
  let offset = 0;
  let redacted = '';
  for (const finding of findings) {
    redacted += text.slice(offset, finding.start);
    redacted += `[REDACTED_${finding.kind.toUpperCase()}]`;
    offset = finding.end;
  }
  redacted += text.slice(offset);
  return Object.freeze({ text: redacted, findings });
}

function removeOverlaps(findings) {
  const retained = [];
  for (const finding of findings) {
    const previous = retained.at(-1);
    if (!previous || finding.start >= previous.end) retained.push(finding);
  }
  return retained;
}
