export type CopilotModelId =
  | 'gpt-5.3-codex'
  | 'gpt-5.4-nano'
  | 'gpt-5.6-luna'
  | 'gpt-5.6-sol'
  | 'gpt-6-astra'
  | 'gpt-6-luna'
  | 'gpt-6-sol'
  | 'gpt-6.1-sol'
  | 'gpt-6.1-terra'
  | 'gpt-6.2-astra'
  | 'gpt-6.2-sol'
  | 'claude-fable-5'
  | 'claude-fable-5.1'
  | 'claude-fable-5.2'
  | 'claude-haiku-4.5'
  | 'claude-haiku-5.5'
  | 'claude-opus-4.8'
  | 'claude-opus-4.8-fast'
  | 'claude-opus-5.5'
  | 'claude-sonnet-4.6'
  | 'claude-sonnet-5'
  | 'claude-sonnet-5.5'
  | 'gemini-3.8-flash'
  | 'gemini-4-argon'
  | 'gemini-4-carbon'
  | 'gemini-4-hydrogen'
  | 'gemini-4-neon'
  | 'mai-code-1.1-flash'
  | 'mai-code-2'
  | 'mai-code-2-flash'
  | 'grok-4.5'
  | 'grok-4.6'
  | 'grok-4.7'
  | 'kimi-k3';

export type CopilotModelSelector = CopilotModelId | (string & {});

export interface CopilotTokenPricing {
  input: number;
  cachedInput: number;
  cacheWrite: number | null;
  output: number;
}

export interface CopilotLongContextPricing {
  startsAboveInputTokens: number;
  pricing: CopilotTokenPricing;
}

export interface CopilotPricingPromotion {
  endsOn: string;
  next: CopilotTokenPricing | null;
}

export interface CopilotModel {
  id: CopilotModelId;
  name: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google' | 'Microsoft' | 'xAI' | 'Moonshot AI';
  category: 'lightweight' | 'versatile' | 'powerful';
  releaseStatus: 'ga' | 'preview';
  aliases: readonly string[];
  pricingUsdPerMillionTokens: {
    default: CopilotTokenPricing;
    longContext: CopilotLongContextPricing | null;
  };
  pricingPromotion: Readonly<CopilotPricingPromotion> | null;
  /** Only applies to the legacy request-based annual billing table. Null does not mean the model is free. */
  legacyPremiumMultiplier: number | null;
}

export interface CopilotModelCatalogSource {
  snapshotDate: string;
  supportedModelsUrl: string;
  pricingUrl: string;
  legacyPricingUrl: string;
}

export const COPILOT_MODEL_CATALOG_SOURCE: Readonly<CopilotModelCatalogSource>;
export const COPILOT_MODEL_CATALOG: readonly Readonly<CopilotModel>[];
export function findCopilotModel(selector: CopilotModelSelector): Readonly<CopilotModel> | undefined;
export function selectCopilotModel(selector: CopilotModelSelector): CopilotModelSelection;
export function resolveCopilotModelId(selector: CopilotModelSelector): string;

export interface CopilotModelSelection {
  model: Readonly<CopilotModel> | null;
  matches: readonly Readonly<CopilotModel>[];
  kind: 'exact' | 'partial' | 'cheapest' | 'unknown';
}

export interface ProseOptions {
  all: boolean;
  fail: boolean;
  maxWords: number;
  ai: boolean;
  model: CopilotModelSelector;
  requestedModel: string;
  modelSelection: {
    kind: 'cheapest';
    message: string;
  } | null;
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
    requestedModel: string;
    modelSelection: {
      kind: 'cheapest';
      message: string;
    } | null;
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
