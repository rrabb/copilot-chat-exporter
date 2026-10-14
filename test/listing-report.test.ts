import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultListingHtmlPath, writeListingHtml } from '../src/session/listing-report.ts';

test('default listing report name is timestamped in the invoking directory', () => {
  const date = new Date(2026, 9, 8, 13, 50, 7);
  assert.equal(
    defaultListingHtmlPath('C:\\reports', date),
    path.resolve('C:\\reports', 'copilot-chat-sessions-listing-261008_135007.html'),
  );
  assert.throws(() => defaultListingHtmlPath('.', new Date(NaN)), /valid timestamp/);
  assert.equal(defaultListingHtmlPath('C:\\reports', date, true),
    path.resolve('C:\\reports', 'copilot-chat-sessions-detailed-listing-261008_135007.html'));
});

test('HTML publication refuses existing files unless overwrite is explicit', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-listing-report-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'report.html');
  assert.equal(await writeListingHtml(output, '<h1>first</h1>'), output);
  await assert.rejects(writeListingHtml(output, '<h1>second</h1>'), /already exists.*--overwrite/);
  assert.equal(await fs.readFile(output, 'utf8'), '<h1>first</h1>');
  assert.equal(await writeListingHtml(output, '<h1>second</h1>', true), output);
  assert.equal(await fs.readFile(output, 'utf8'), '<h1>second</h1>');
  assert.deepEqual((await fs.readdir(directory)).sort(), ['report.html']);
});

test('failed overwrite removes only its staging file and preserves the destination', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-listing-report-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'report.html');
  await fs.mkdir(destination);
  await assert.rejects(writeListingHtml(destination, '<h1>replacement</h1>', true));
  assert.deepEqual(await fs.readdir(directory), ['report.html']);
  assert.deepEqual(await fs.readdir(destination), []);
});
