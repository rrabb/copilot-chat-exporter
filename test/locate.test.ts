import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { currentSessionFromEnv, looksLikeSessionArgument } from '../src/session/locate.ts';
import { messageText } from '../src/session/journal.ts';

const UUID = '1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d';

test('messageText preserves the legacy string message form', () => {
  assert.equal(messageText('an older saved prompt'), 'an older saved prompt');
});

test('looksLikeSessionArgument separates a session from an output path', () => {
  // Neither recorded check reaches this branch: both pass a .jsonl path, so the `||`
  // short-circuits before the id test is ever evaluated. It broke once, unnoticed.
  assert.equal(looksLikeSessionArgument(UUID), true);
  assert.equal(looksLikeSessionArgument(UUID.toUpperCase()), true);
  assert.equal(looksLikeSessionArgument(`some/dir/${UUID}.jsonl`), true);

  assert.equal(looksLikeSessionArgument('docs/chat-exports/out.md'), false);
  assert.equal(looksLikeSessionArgument('out.md'), false);
  assert.equal(looksLikeSessionArgument('not-a-uuid'), false);
  assert.equal(looksLikeSessionArgument(undefined), false);
  assert.equal(looksLikeSessionArgument(''), false);
});

test('currentSessionFromEnv reads the session VS Code is running', (t) => {
  const original = process.env.VSCODE_TARGET_SESSION_LOG;
  t.after(() => {
    if (original === undefined)
      delete process.env.VSCODE_TARGET_SESSION_LOG;
    else
      process.env.VSCODE_TARGET_SESSION_LOG = original;
  });

  delete process.env.VSCODE_TARGET_SESSION_LOG;
  assert.equal(currentSessionFromEnv(), null);

  // The variable points at a log three levels below the storage hash folder.
  const hashRoot = path.join(path.sep, 'storage', 'hash');
  process.env.VSCODE_TARGET_SESSION_LOG = path.join(hashRoot, 'GitHub.copilot-chat', 'debug-logs', UUID);
  assert.deepEqual(currentSessionFromEnv(), { sessionId: UUID, hashRoot });

  process.env.VSCODE_TARGET_SESSION_LOG = path.join(hashRoot, 'a', 'b', 'not-a-uuid');
  assert.equal(currentSessionFromEnv(), null);
});
