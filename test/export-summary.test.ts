import assert from 'node:assert/strict';
import test from 'node:test';
import { formatExportSummary, localCompactTimestamp } from '../src/export-summary.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

const SESSION_ID = 'abcdef01-0000-4000-8000-000000000000';

test('completion summary preserves distinct title provenance and suppresses repeated defaults', () => {
  const started = new Date(2026, 7, 19, 18, 8).getTime();
  const ended = new Date(2026, 7, 22, 7, 36).getTime();
  const firstPrompt = 'How do I use DataSourceManager to get a data source in a widget? Show a real example';
  const session = testSession({
    title: 'Building-chat-exporter',
    customTitle: 'Using DataSourceManager in widget',
    defaultTitle: firstPrompt,
    turns: [
      testTurn({
        number: 1,
        ts: started,
        prompt: firstPrompt,
        reasoning: ['one'],
        toolNodes: [testTool()],
      }),
      testTurn({
        number: 2,
        ts: ended - 1000,
        prompt: 'Review the migration plan and identify any remaining risks before implementation.',
        reasoning: ['two', 'three'],
        toolNodes: [testTool({ toolCallId: 'c2' }), testTool({ toolCallId: 'c3' })],
        scalar: { responseTimestamp: ended },
      }),
    ],
  });

  assert.deepEqual(formatExportSummary({
    sessionId: SESSION_ID,
    session,
    resourceCount: 4,
    outputPath: 'docs/chat-exports/Using-DataSourceManager-in-widget.md',
    outputSize: 2372703,
  }), [
    `Exported session ${SESSION_ID}:`,
    'Title: Building-chat-exporter',
    'Custom Title: Using DataSourceManager in widget',
    `First Prompt: ${firstPrompt}`,
    'Last Prompt: Review the migration plan and identify any remaining risks before implementation.',
    `Session from ${localCompactTimestamp(started)} to ${localCompactTimestamp(ended)}`,
    'Turns: 2; tool calls: 3; reasoning thoughts: 3; resources: 4.',
    'Output: docs/chat-exports/Using-DataSourceManager-in-widget.md (2,372,703 bytes)',
  ]);
});

test('completion summary omits title variants that add no value and always prints prompts', () => {
  const session = testSession({
    title: 'Same title',
    customTitle: 'Same title',
    defaultTitle: 'First prompt',
    creationDate: null,
    turns: [testTurn({ prompt: 'First prompt' })],
  });

  const lines = formatExportSummary({
    sessionId: SESSION_ID,
    session,
    resourceCount: 0,
    outputPath: 'out.md',
    outputSize: 12,
  });

  assert.equal(lines.some((line) => line.startsWith('Custom Title:')), false);
  assert.equal(lines.some((line) => line.startsWith('Default Title:')), false);
  assert.equal(lines.includes('First Prompt: First prompt'), true);
  assert.equal(lines.includes('Last Prompt: First prompt'), true);
});

test('prompt previews are clipped to 100 characters and empty sessions remain readable', () => {
  const longPrompt = 'x'.repeat(120);
  const clipped = formatExportSummary({
    sessionId: SESSION_ID,
    session: testSession({
      title: '',
      customTitle: '',
      defaultTitle: '',
      turns: [testTurn({ prompt: longPrompt })],
    }),
    resourceCount: 0,
    outputPath: 'out.md',
    outputSize: 0,
  });
  assert.equal(clipped.find((line) => line.startsWith('First Prompt: '))?.length, 'First Prompt: '.length + 100);

  const empty = formatExportSummary({
    sessionId: SESSION_ID,
    session: testSession({ title: '', customTitle: '', defaultTitle: '', turns: [] }),
    resourceCount: 0,
    outputPath: 'out.md',
    outputSize: 0,
  });
  assert.equal(empty.includes('Title: (untitled)'), true);
  assert.equal(empty.includes('First Prompt: (none)'), true);
  assert.equal(empty.includes('Last Prompt: (none)'), true);
  assert.equal(empty.includes('Session from unavailable to unavailable'), true);
});