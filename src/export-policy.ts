export interface ExportPolicy {
  highFidelity: boolean;
  redact: boolean;
}

export const DEFAULT_EXPORT_POLICY: Readonly<ExportPolicy> = Object.freeze({
  highFidelity: false,
  redact: true,
});

export interface ContentLocation {
  sourceId: string;
  requestId?: string;
  recordId?: string;
  toolCallId?: string;
  field: string;
}

export interface ExportDiagnostic {
  category: 'omission' | 'redaction' | 'unsupported' | 'source-unavailable';
  kind: string;
  description: string;
  location: ContentLocation;
  count: number;
}

export type CompanionKind = 'tool-input' | 'tool-result' | 'metadata' | 'image';

/** An artifact still to be persisted; a planned link is not evidence of a successful write. */
export interface CompanionArtifact {
  id: string;
  kind: CompanionKind;
  relativePath: string;
  mediaType: string;
  bytes: Uint8Array;
  location: ContentLocation;
}

export interface PlannedArchive {
  markdown: string;
  companions: CompanionArtifact[];
  diagnostics: ExportDiagnostic[];
  policy: ExportPolicy;
}

export interface TextPresentation {
  lineCount: number;
  collapsed: boolean;
  preview: string;
  /** Complete text to save in a companion, or null when all text stays in Markdown. */
  companionText: string | null;
}

/** A terminating newline ends the last line; it does not create an extra empty line. */
export function recordedLineCount (text: string): number {
  if (!text)
    return 0;
  const lines = text.split(/\r\n|\n|\r/);
  return lines.length - (lines.at(-1) === '' ? 1 : 0);
}

function firstLines (text: string, limit: number): string {
  const endings = text.matchAll(/\r\n|\n|\r/g);
  let count = 0;
  for (const ending of endings) {
    count += 1;
    if (count === limit)
      return text.slice(0, ending.index);
  }
  return text;
}

/** Text goes to a companion only when it is long in lines AND large in bytes, so many short file views stay inline. */
export const COMPANION_MIN_LINES = 300;
export const COMPANION_MIN_BYTES = 15 * 1024;

/** Tool text follows the same policy in ordinary and high-fidelity exports. */
export function planToolText (text: string): TextPresentation {
  const lineCount = recordedLineCount(text);
  const companionText = lineCount > COMPANION_MIN_LINES && Buffer.byteLength(text, 'utf8') > COMPANION_MIN_BYTES ? text : null;
  return {
    lineCount,
    collapsed: lineCount > 10,
    preview: companionText === null ? text : firstLines(text, 10),
    companionText,
  };
}

/** Callers apply the export's redaction/exclusion policy before presenting extra JSON. */
export function planMetadataText (text: string): TextPresentation {
  return { ...planToolText(text), collapsed: true };
}
