import { redactText } from '../redaction.ts';
import { escapeHtml } from './listing-html.ts';

/** Compare content, not viewport-dependent clipping; explanations remain tooltips. */
export function detailedTitleAttribute (label: string, title = ''): string {
  const normalized = (text: string) => redactText(text).text.trim().replace(/\s+/gu, ' ');
  if (!title || normalized(label) === normalized(title))
    return '';
  return ` title="${escapeHtml(redactText(title).text)}"`;
}

/** Supplemental values are exact identifiers absent from the rendered label. */
export function detailedSearchAttribute (values: readonly string[], visible: string): string {
  const normalize = (text: string) => redactText(text).text.toLowerCase().replace(/\s+/gu, ' ').trim();
  const content = normalize(visible);
  const missing = [...new Set(values.map(normalize).filter((text) => text && !content.includes(text)))];
  return missing.length ? ` data-search="${escapeHtml(missing.join(' '))}"` : '';
}
