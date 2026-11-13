import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');
const read = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
const findings = read('findings.json');
const census = read('census.json');
const results = read('export-results.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const labels = new Set(census.sources.map(source => source.label));

assert.equal(census.sources.length, 32);
assert.equal(census.sources.filter(source => source.family === 'local').length, 16);
assert.equal(census.sources.filter(source => source.family === 'sdk').length, 16);
assert.equal(labels.size, 32);
assert.equal(results.length, 6);
assert.equal(results.filter(result => result.export.exitCode === 0).length, 5);
assert.equal(results.filter(result => result.savedFileVerify.exitCode === 0).length, 5);
assert.equal(results.find(result => result.label === 'S017').export.exitCode, 2);
assert.equal(results.find(result => result.label === 'S017').savedFileVerify.exitCode, 2);
assert.equal(findings.totals.sourceHashesUnchangedThroughEnd, true);
assert.equal(findings.totals.parseErrors, 0);
assert.equal(findings.totals.replayErrors, 0);
assert.equal(findings.totals.localResponseKindValuesIncludingAbsentKindMarkdown, 14);
assert.equal(findings.totals.sdkEventTypeValues, 52);
assert.equal(findings.totals.actualToolNameUnion, 101);
assert.equal(findings.localQuestionStressPresence.recordedNonemptyAnswerStrings, 5);
assert.equal(findings.localQuestionStressPresence.presentNormalizedWhitespaceInSavedMarkdown, 4);

for (const source of census.sources) {
  assert.notEqual(source.id, 'private-id-0054');
  assert.equal(hash(path.join(output, source.frozen)), source.frozenSha256);
  assert.equal(hash(source.path), source.frozenSha256);
  assert.equal(source.raw.parseErrors.length, 0);
  assert.equal(source.raw.replayErrors.length, 0);
}
for (const result of results) {
  assert.equal(result.verificationReport.layerD.target, 'file');
  assert.equal(result.sourceMatchesSurveyBeforeExport, true);
  assert.equal(result.sourceMatchesSurveyAfterExport, true);
  assert.equal(result.sourceChangedDuringExport, false);
  assert.equal(result.artifacts.length, 1);
  assert.ok(fs.existsSync(path.join(output, result.export.stdout)));
  assert.ok(fs.existsSync(path.join(output, result.export.stderr)));
  assert.ok(fs.existsSync(path.join(output, result.savedFileVerify.stdout)));
  assert.ok(fs.existsSync(path.join(output, result.savedFileVerify.stderr)));
  assert.equal(hash(path.join(output, result.artifacts[0].path)), result.artifacts[0].sha256);
  assert.ok(findings.manifests.normalCaptureJsonlFiles.some(capture => capture.matchingSurveyLabels.includes(result.label)));
  const rawCount = census.sources.find(source => source.label === result.label)?.final?.requests;
  if (rawCount !== undefined)
    assert.equal(result.verificationReport.layerB.rawRequests, rawCount);
}
for (const artifact of findings.markdownArtifactMetrics) {
  for (const companion of artifact.companionManifest)
    assert.equal(hash(path.join(output, companion.path)), companion.sha256);
}
for (const [bucket, entries] of Object.entries(census.inventories)) {
  for (const [key, entry] of Object.entries(entries)) {
    const sourceSum = Object.values(entry.sources).reduce((sum, count) => sum + count, 0);
    assert.equal(sourceSum, entry.occurrences, `${bucket}: ${key}`);
    assert.ok(Object.keys(entry.sources).every(label => labels.has(label)));
    assert.ok(entry.examples.length > 0);
  }
}
assert.ok(Object.values(findings.labelledResponseKinds).every(entry => entry.label !== 'Unhandled research label.'));
console.log(JSON.stringify({
  result: 'pass',
  frozenSourcesAndLiveSourceHashes: census.sources.length,
  exportedArchivesAndSavedFileChecks: results.length,
  companionsHashChecked: findings.markdownArtifactMetrics.reduce((sum, artifact) => sum + artifact.companionFiles, 0),
  inventoryGroupsReconciled: Object.keys(census.inventories).length,
  note: 'This validates research artifacts and count reconciliation, not production behavior beyond the recorded CLI export/verification runs.',
}));
