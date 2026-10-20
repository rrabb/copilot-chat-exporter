import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi;
const SYNTHETIC = /(?:([a-f0-9])\1{11}$|^(?:abcdef12|fedcba98)-(?:0000|1000)-4000-8000-00000000000[123]$|^abcdef12-3456-4789-a012-b3456789cdef$)/i;

function privacyProblems (text: string): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(UUID))
    !SYNTHETIC.test(match[0]) && problems.push('non-synthetic UUID');
  for (const match of text.matchAll(/[a-z]:[\\/]+Users[\\/]+([^\\/\s"'`]+)/gi))
    !/^(?:you|<you>|user|test|tester|alice|bob)$/i.test(match[1]) && problems.push('personal Windows user path');
  return problems;
}

test('privacy guard recognizes synthetic examples and rejects identifying literals', () => {
  assert.deepEqual(privacyProblems('11111111-1111-4111-8111-111111111111 C:\\Users\\<you>\\Code'), []);
  assert.deepEqual(privacyProblems(['ab29ce71', '7293', '4328', 'a71e', '12cf8476ea90'].join('-')), ['non-synthetic UUID']);
  assert.deepEqual(privacyProblems(['C:', 'Users', 'private-name', 'Code'].join('\\')), ['personal Windows user path']);
});

test('public docs and tests contain no real session UUIDs or Windows user paths', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z',
    'README.md', 'docs', 'test', 'work-log.md', 'work-log-archive.md'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const failures: string[] = [];
  for (const file of new Set(files)) {
    if (!/\.(?:md|ts|json|jsonl)$/.test(file) || file === 'docs/user-notes.md')
      continue;
    const problems = privacyProblems(readFileSync(path.join(ROOT, file), 'utf8'));
    problems.length && failures.push(`${file}: ${[...new Set(problems)].join(', ')}`);
  }
  assert.deepEqual(failures, [], 'Use synthetic identifiers and generic user paths; never print offending content.');
});
