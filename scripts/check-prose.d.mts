export interface ProseOptions {
  all: boolean;
  fail: boolean;
  maxWords: number;
  ai: boolean;
  model: string;
  reasoningEffort: string | null;
  stdin: boolean;
  paths: string[];
}

export interface ProseFinding {
  line: number;
  column: number;
  severity: 'recommend';
  rule: string;
  message: string;
}

export interface ProsePassage {
  id: string;
  source: string;
  startLine: number;
  endLine: number;
  text: string;
  reviewText?: string;
  reviewRanges?: number[][];
  deterministic: Array<{ line: number; rule: string; message: string }>;
}

export interface ReviewSource {
  name: string;
  text: string;
  scope: { name: string; ranges: number[][] };
  findings: ProseFinding[];
  /** Word-list hits held back under --ai. Printed only if the AI review fails. */
  wordFallback?: ProseFinding[];
  passages: ProsePassage[];
}

export interface AiFinding {
  severity: 'blocker' | 'recommend' | 'consider';
  source: string;
  quote: string;
  reason: string;
  suggestion: string;
}

export interface UsageMetrics {
  credits: number | null;
  premium: number | null;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning: number;
  };
  models: string[];
}

export interface AiReviewResult {
  error?: string;
  findings: AiFinding[];
  usage: UsageMetrics;
  metadata: {
    model: string;
    reasoning: string;
    cliVersion: string;
    promptBytes: number;
    responseBytes: number;
    batches: number;
    usageStatus: string;
    wallMs: number;
  };
}

interface ProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface ReviewRuntime {
  cwd?: string;
  copilotCommand?: string;
  temporaryDirectory?: () => string;
  now?: () => number;
  spawnSync?: (command: string, args: string[], options: Record<string, unknown>) => ProcessResult;
}

export function parseArgs(argv: string[]): ProseOptions;
export function checkText(text: string, options: ProseOptions, ranges?: number[][], sourceName?: string): ProseFinding[];
export function parseDiffRanges(diff: string, lineCount: number): number[][];
export function collectReviewSources(options: ProseOptions, runtime?: ReviewRuntime): ReviewSource[];
export function parseAiReview(text: string, passageIds: string[]): AiFinding[];
export function parseUsageReport(text: string): UsageMetrics;
export function reviewWithModel(sources: ReviewSource[], options: ProseOptions, runtime?: ReviewRuntime): AiReviewResult;
export function formatUsageFooter(result: AiReviewResult, sourceCount: number, passageCount: number): string;
export function exitCodeForFindings(
  options: ProseOptions,
  counts: { deterministicRecommend: number; blocker: number },
): number;
