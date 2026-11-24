import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectRecordedImages, saveImageCompanion } from '../src/images.ts';
import { buildDocument } from '../src/markdown.ts';
import { parseChatSession } from '../src/session/journal.ts';
import { readLinkedImageCompanions, sdkImageLocators, verifyLocalImages, verifySdkImages } from '../src/verify/images.ts';
import type { CompanionArtifact } from '../src/export-policy.ts';
import { buildParserCheck, loadMarkdownParser } from '../src/verify/parser-check.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const encoded = bytes.toString('base64');
const hash = createHash('sha256').update(bytes).digest('hex');
const image = { kind: 'image', mimeType: 'image/png', value: { $base64: encoded } };
const fixture = () => ({
  message: { text: 'Look at the recorded image' }, requestId: 'request-one',
  variableData: { variables: [image] },
  response: [
    { value: 'Before the tool' },
    { kind: 'toolInvocationSerialized', toolId: 'view_image', toolCallId: 'tool-one', invocationMessage: 'View image', isComplete: true,
      resultDetails: { output: [{ type: 'embed', mimeType: 'image/png', value: encoded }] } },
    { value: 'After the tool' },
  ],
  result: { metadata: { toolCallResults: { 'tool-one': { content: [{ mimeType: 'image/png', data: encoded }] } } } },
});

test('recorded images decode every observed format without reading external locations', () => {
  for (const value of [encoded, { $base64: encoded }, [...bytes], Object.fromEntries([...bytes].map((value, index) => [index, value]))]) {
    const images = collectRecordedImages({ kind: 'image', mimeType: 'image/png', value, path: 'missing-file.png' });
    assert.equal(images.length, 1);
    assert.deepEqual(Buffer.from(images[0]!.bytes!), bytes);
  }
  assert.equal(collectRecordedImages({ type: 'file', mimeType: 'application/zip', data: encoded }).length, 0);
});

test('image companions deduplicate decoded bytes, use MIME extensions and report missing MIME', () => {
  const companions: CompanionArtifact[] = [];
  const first = collectRecordedImages(image)[0]!;
  const saved = saveImageCompanion(first, { assetsDirectory: 'assets', companions });
  const again = saveImageCompanion({ ...first, alt: 'Another position' }, { assetsDirectory: 'assets', companions });
  assert.equal(saved.href, again.href);
  assert.equal(companions.length, 1);
  assert.deepEqual(Buffer.from(companions[0]!.bytes), bytes);
  assert.match(saved.href!, /\.png$/u);
  assert.equal(saved.sha256, hash);
  const unknown = saveImageCompanion({ ...first, mimeType: '' }, { assetsDirectory: 'assets-other', companions: [] });
  assert.match(unknown.href!, /\.bin$/u);
  assert.match(unknown.representationChange!, /MIME/u);
  const named: CompanionArtifact[] = [];
  const original = saveImageCompanion(first, { assetsDirectory: 'assets', companions: named }, 'asset-one');
  assert.equal(saveImageCompanion(first, { assetsDirectory: 'assets', companions: named }, 'asset-two').href, original.href);
  const distinct = saveImageCompanion({ ...first, bytes: Buffer.from('different bytes') }, { assetsDirectory: 'assets', companions: named }, 'asset-one');
  assert.notEqual(distinct.href, original.href, 'reused SDK asset names cannot overwrite different image bytes');
  assert.equal(named.length, 2);
});

test('Local prompt and tool images keep their positions and replace raw Base64 text', async () => {
  const request = fixture();
  const raw = JSON.stringify({ kind: 0, v: { requests: [request], inputState: { attachments: [
    { kind: 'image', value: Object.fromEntries([...bytes].map((value, index) => [index, value])) },
  ] } } });
  const session = parseChatSession('synthetic.jsonl', raw);
  const companions: CompanionArtifact[] = [];
  const markdown = buildDocument(session, {
    location: { sessionId: 'synthetic', sessionPath: 'synthetic.jsonl', hashRoot: '' },
    resources: { resources: [], byCall: new Map(), resourceRoot: '' },
    versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
    memory: { session: [], repo: [], user: [] }, outputPath: '', gitStatus: '', generatedAt: '2026-10-20T00:00:00Z',
    overflow: { assetsDirectory: 'assets', companions },
  });
  assert.equal(companions.length, 1);
  assert.doesNotMatch(markdown, new RegExp(encoded));
  assert.match(markdown, /Images bypass text redaction and may contain private information/u);
  const links = [...markdown.matchAll(/!\[[^\]]*\]\([^)]+\.png\)/gu)];
  assert.equal(links.length, 2, 'one prompt position and one tool position, not metadata duplicates');
  assert.ok(links[0]!.index! < markdown.indexOf('Before the tool'));
  assert.ok(links[1]!.index! > markdown.indexOf('Before the tool'));
  assert.ok(links[1]!.index! < markdown.indexOf('After the tool'));
  assert.match(markdown, new RegExp(hash.slice(0, 12)));
  assert.match(markdown, /11 bytes/u);
  const account = verifyLocalImages(session.rawRequests ?? [], raw, markdown, companions);
  assert.equal(account.found, 1);
  assert.equal(account.missing, 0);
  assert.equal(account.excludedNotSubmitted, 1);
  assert.equal(account.failed, false);
  assert.equal(buildParserCheck(markdown, await loadMarkdownParser(), { turns: 1, strict: true }).failed, false);
});

test('detached image inventory includes nested conversations and replaces Base64 in persisted output', () => {
  for (const nested of [false, true]) {
    const parsed = parseChatSession('synthetic.jsonl', JSON.stringify({ kind: 0, v: { requests: [fixture()] } }));
    const childTool = testTool({ subagent: {
      agentId: 'nested-image-agent', name: 'Nested', displayName: 'Nested', description: 'Nested image task',
      agentType: 'task', model: 'test-model', durationMs: null, totalToolCalls: null, totalTokens: null,
      cancelled: false, turns: parsed.turns,
    } });
    const session = testSession({ detachedSubagents: [{
      agentId: 'detached-image-agent', parentToolCallId: 'missing-image-call', title: 'Detached images',
      turns: nested ? [testTurn({ body: [childTool], toolNodes: [childTool] })] : parsed.turns,
    }] });
    const companions: CompanionArtifact[] = [];
    const resource = { toolCallId: 'tool-one', filePath: 'image-resource.json', relative: 'image-resource.json', bytes: encoded.length, content: JSON.stringify(image) };
    const markdown = buildDocument(session, {
      location: { sessionId: 'synthetic', sessionPath: 'synthetic.jsonl', hashRoot: '' },
      resources: { resources: [resource], byCall: new Map([['tool-one', [resource]]]), resourceRoot: '' },
      versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
      memory: { session: [], repo: [], user: [] }, outputPath: '', gitStatus: '', generatedAt: '2026-10-20T00:00:00Z',
      overflow: { assetsDirectory: 'assets', companions },
    });
    assert.equal(companions.filter((item) => item.kind === 'image').length, 1);
    assert.match(markdown, /Images bypass text redaction and may contain private information/u);
    assert.match(markdown, /recorded image saved separately; SHA-256/u);
    assert.ok(!markdown.includes(encoded));
  }
});

test('image-only prompts, orphan tool metadata and unresolved images remain visible', () => {
  const session = parseChatSession('synthetic.jsonl', JSON.stringify({ kind: 0, v: { requests: [{
    message: { text: '' }, variableData: { variables: [image] },
    result: { metadata: { toolCallResults: { orphan: { content: [{ mimeType: 'image/png', data: encoded }] } } } },
    response: [],
  }] } }));
  assert.equal(session.turns.length, 1);
  assert.equal(session.turns[0]!.promptImages?.length, 1);
  assert.equal(session.turns[0]!.body[0]?.type, 'note');
  assert.equal(session.turns[0]!.toolNodes.length, 0, 'image recovery does not invent a tool call');
  const numeric = Object.fromEntries([...bytes].map((value, index) => [index, value]));
  const account = verifyLocalImages([{ variableData: { variables: [{ kind: 'image', value: numeric }] } }], '', '', []);
  assert.equal(account.missing, 1, 'the independent verifier decodes numeric-keyed values');
});

test('independent image verification fails missing, unlinked and corrupted companions', () => {
  const request = fixture();
  const companion: CompanionArtifact = { id: 'image', kind: 'image', relativePath: 'assets/image.png', mediaType: 'image/png',
    bytes, location: { sourceId: 'fixture', field: 'image' } };
  for (const [markdown, companions] of [
    ['![image](assets/image.png)', []],
    ['no link', [companion]],
    ['![image](assets/image.png)', [{ ...companion, bytes: Buffer.from('wrong') }]],
    ['```text\n![image](assets/image.png)\n```', [companion]],
    ['`![image](assets/image.png)`', [companion]],
  ] as const) {
    const account = verifyLocalImages([request], '', markdown, [...companions]);
    assert.equal(account.missing, 1);
    assert.equal(account.failed, true);
  }
  const unknown = verifyLocalImages([{ message: 'Question', variableData: { variables: [{ kind: 'image', value: null }] } }], '', '', []);
  assert.equal(unknown.unresolved, 1);
  const reference = verifyLocalImages([{ variableData: { variables: [{ kind: 'image', path: 'file:///recorded.png' }] } }], '', '', []);
  assert.equal(reference.referenceOnly, 1);
});

test('SDK image hash verification resolves asset descriptors without counting them as missing images', () => {
  const events = [
    { type: 'session.binary_asset', data: { assetId: 'asset-one', type: 'image', mimeType: 'image/png', data: encoded } },
    { type: 'tool.execution_complete', data: { result: { binaryResultsForLlm: [{ type: 'image', assetId: 'asset-one', mimeType: 'image/png' }] } } },
  ];
  const companions: CompanionArtifact[] = [{ id: 'image', kind: 'image', relativePath: 'assets/image.png', mediaType: 'image/png',
    bytes, location: { sourceId: 'fixture', field: 'image' } }];
  const account = verifySdkImages(events, '![image](assets/image.png)', companions);
  assert.equal(account.found, 1);
  assert.equal(account.unresolved, 0);
});

test('SDK image targets keep fence positions aligned with CRLF Markdown', () => {
  const event = { type: 'session.binary_asset', data: {
    assetId: 'asset-one', type: 'image', mimeType: 'image/png', data: encoded,
  } };
  const companion: CompanionArtifact = {
    id: 'image', kind: 'image', relativePath: 'assets/image.png', mediaType: 'image/png',
    bytes, location: { sourceId: 'fixture', field: 'image' },
  };
  const before = Array.from({ length: 80 }, (_, index) => `before ${index}`).join('\r\n');
  const after = ['```text', ...Array.from({ length: 120 }, (_, index) => `fenced ${index}`), '```'].join('\r\n');
  const account = verifySdkImages([event], `${before}\r\n![image](assets/image.png)\r\n${after}`, [companion]);
  assert.equal(account.found, 1);
  assert.equal(account.missing, 0);
});

test('SDK image locators resolve asset hashes to the event line and JSON path that referenced them', () => {
  const locators = sdkImageLocators([
    { type: 'session.binary_asset', line: 3, data: { assetId: 'asset-one', type: 'image', mimeType: 'image/png', data: encoded } },
    { type: 'tool.execution_complete', line: 8, data: { result: { binaryResultsForLlm: [{ type: 'image', assetId: 'asset-one', mimeType: 'image/png' }] } } },
    { type: 'user.message', line: 9, data: { attachments: [{ type: 'image', mimeType: 'image/png' }] } },
  ]);
  assert.deepEqual(locators, [
    { hash: createHash('sha256').update(bytes).digest('hex'), line: 8, locator: 'line 8 tool.execution_complete data.result.binaryResultsForLlm[0]',
      mimeType: 'image/png', assetId: 'asset-one', bytes: bytes.length },
    { hash: null, line: 9, locator: 'line 9 user.message data.attachments[0]', mimeType: 'image/png' },
  ]);
});

test('existing-export image verification reads linked archive bytes and detects deletion or corruption', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'image-companion-test-'));
  const output = path.join(directory, 'export.md');
  const folder = 'export_assets_261020_000000';
  const file = path.join(directory, folder, 'image.png');
  const markdown = `![recorded image](${folder}/image.png)`;
  try {
    await fs.mkdir(path.dirname(file));
    await fs.writeFile(file, bytes);
    const check = async () => verifyLocalImages([fixture()], '', markdown, await readLinkedImageCompanions(markdown, output));
    assert.equal((await check()).found, 1);
    await fs.writeFile(file, 'corrupted');
    assert.equal((await check()).missing, 1);
    await fs.unlink(file);
    assert.equal((await check()).missing, 1);
    assert.deepEqual(await readLinkedImageCompanions('![not an archive companion](file:///missing.png)', output), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
