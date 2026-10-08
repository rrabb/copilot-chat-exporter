import type { ContentLocation, ExportDiagnostic, ExportPolicy } from './export-policy.ts';

const rules = [
  { kind: 'bearer-credential', pattern: /(authorization\s*[:=]\s*bearer\s+)[^\s"'\\]+/gi },
  {
    kind: 'credential-assignment',
    pattern: /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi,
  },
];

/** Shared detector; intentionally preserves the existing best-effort recognition rules. */
export function redactText (text: string, enabled = true) {
  const counts = new Map<string, number>();
  if (!enabled)
    return { text, counts };
  for (const rule of rules) {
    text = text.replace(rule.pattern, (match: string, prefix: string) => {
      if (match.slice(prefix.length) === '[REDACTED]')
        return match;
      counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
      return `${prefix}[REDACTED]`;
    });
  }
  return { text, counts };
}

/** Apply before preview planning so companions and inline text receive the same policy. */
export function redactContent (text: string, policy: ExportPolicy, location: ContentLocation) {
  const result = redactText(text, policy.redact);
  const diagnostics: ExportDiagnostic[] = [...result.counts].map(([kind, count]) => ({
    category: 'redaction', kind, count, location,
    description: 'Recorded credential-like text replaced by the best-effort exporter detector.',
  }));
  return { text: result.text, diagnostics };
}
