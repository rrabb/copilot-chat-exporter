import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { formatSessionListing, formatSessionListingHtml } from '../src/session/listing.ts';
import { dateCell } from '../src/session/listing-model.ts';
import type { SessionOccurrence } from '../src/session/sources.ts';

function localOccurrence (
  id: string,
  overrides: Partial<SessionOccurrence> = {},
): SessionOccurrence {
  const provenance = { userDataRoot: 'C:\\Code', workspaceStoragePath: `C:\\Code\\User\\workspaceStorage\\${id}` };
  return {
    occurrenceId: id,
    provider: 'local',
    sessionId: id,
    title: `Session ${id}`,
    titleSource: 'journal',
    activityTimestamp: Date.UTC(2026, 9, 8),
    activitySource: 'journal',
    createdTimestamp: Date.UTC(2026, 9, 1),
    promptCount: 4,
    provenance,
    backing: {
      status: 'verified',
      source: {
        kind: 'local-journal', sessionId: id, path: `${provenance.workspaceStoragePath}\\chatSessions\\${id}.jsonl`,
        schemaVersion: 3, sha256: id, provenance,
      },
    },
    visibility: { status: 'included' },
    diagnostics: [],
    ...overrides,
  };
}

test('listing filters ignored entries, groups exact duplicate journals, and summarizes counts', () => {
  const first = localOccurrence('duplicate', {
    occurrenceId: 'duplicate-a',
    title: 'Safe title\nInjected console row',
  });
  const duplicate = localOccurrence('duplicate', {
    occurrenceId: 'duplicate-b',
    provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\User\\workspaceStorage\\other' },
    backing: {
      status: 'verified',
      source: {
        kind: 'local-journal', sessionId: 'duplicate', path: 'C:\\Code\\other.jsonl',
        schemaVersion: 3, sha256: 'duplicate',
        provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\User\\workspaceStorage\\other' },
      },
    },
  });
  const fix = localOccurrence('fix', {
    title: '/fix improve the test',
    visibility: { status: 'hidden', reason: 'fix' },
  });
  const ambiguous = localOccurrence('ambiguous', {
    provider: 'agent-host',
    backing: { status: 'unresolved', reason: 'ambiguous identity' },
    visibility: { status: 'hidden', reason: 'ambiguous' },
    diagnostics: [{ path: 'private-storage-path', category: 'ambiguous', description: 'ambiguous identity' }],
  });
  const ambiguousChild = localOccurrence('parent#subagent/task', {
    provider: 'agent-host',
    backing: { status: 'unresolved', reason: 'ambiguous child scope' },
    visibility: { status: 'hidden', reason: 'ambiguous' },
  });
  const unavailable = localOccurrence('unavailable', {
    provider: 'copilot-cli',
    backing: { status: 'unresolved', reason: 'events are missing' },
  });
  const occurrences = [first, duplicate, fix, ambiguous, ambiguousChild, unavailable];
  const listing = formatSessionListing(occurrences, { terminalWidth: 150 });

  assert.match(listing, /Showing 2 of 2 eligible conversations/);
  assert.match(listing, /6 source occurrences across 5 conversations; 1 duplicate occurrence merged/);
  assert.match(listing, /1 chat with a title starting with \/fix/);
  assert.match(listing, /1 entry with unresolved identity or scope/);
  assert.match(listing, /1 ambiguous child scope/);
  assert.match(listing, /\d{6}-\d{2}:\d{2} \(UTC[+-]\d+(?:h|:\d{2})\)\s+\|\s+\d{6}-\d{2}:\d{2} \(UTC[+-]\d+(?:h|:\d{2})\)\s+\|\s+4/);
  assert.match(listing, /Safe title Injected console row/);
  assert.doesNotMatch(listing, /Injected console row\s+\n/);
  assert.doesNotMatch(listing, /private-storage-path/);
  assert.match(listing, /events are missing|unresolved/);
  assert.match(listing, /CREATED \(LOCAL\)/);
  assert.match(listing, /Dates use this machine.s local time; each timestamp includes its UTC offset/);

  const all = formatSessionListing(occurrences, { showIgnored: true });
  assert.match(all, /Showing 5 of 5 total conversations \(2 eligible before ignored filters\)/);
  assert.match(all, /🟠 ❓ ambiguous/);
  assert.match(all, /1 ambiguous child scope/);
});

test('console listing explains external provider references', () => {
  const external = localOccurrence('external', {
    provider: 'external',
    backing: { status: 'unsupported', reason: 'external provider' },
  });
  const listing = formatSessionListing([external]);

  assert.match(listing, /external = provider reference outside Local, Agent Host and CLI sources\. External references are unsupported for export/);
});

test('console dates use local time and include the timestamp UTC offset', () => {
  const timestamp = Date.UTC(2026, 10, 4, 1, 2);
  const date = new Date(timestamp);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  const offset = offsetRemainder === '00' ? `${offsetHours}h` : `${offsetHours}:${offsetRemainder}`;
  const localDate = [
    String(date.getFullYear() % 100).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  const localTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  assert.equal(dateCell(timestamp), `${localDate}-${localTime} (UTC${sign}${offset})`);
  assert.equal(dateCell(timestamp, date.getFullYear()), `${localDate.slice(2)}-${localTime} (UTC${sign}${offset})`);
  assert.equal(dateCell(null), 'unknown');
  assert.throws(() => dateCell(Number.MAX_VALUE), /outside the supported date range/u);
});

test('console dates keep other years and use the supplied local reference year', () => {
  for (const year of [2025, 2026, 2027]) {
    const timestamp = new Date(year, 10, 2, 16, 48).getTime();
    const expectedDate = year === 2026 ? '1102' : `${String(year).slice(2)}1102`;
    assert.ok(dateCell(timestamp, 2026).startsWith(`${expectedDate}-16:48 `));
    assert.ok(dateCell(timestamp).startsWith(`${String(year).slice(2)}1102-16:48 `));
  }
});

test('console dates handle daylight saving, fractional offsets and local year boundaries', () => {
  const cases = [
    { zone: 'UTC', timestamp: '2026-11-02T16:48:00Z', expected: '1102-16:48 (UTC+0h)' },
    { zone: 'America/New_York', timestamp: '2026-07-02T20:48:00Z', expected: '0702-16:48 (UTC-4h)' },
    { zone: 'America/New_York', timestamp: '2026-11-02T21:48:00Z', expected: '1102-16:48 (UTC-5h)' },
    { zone: 'America/New_York', timestamp: '2026-01-01T00:30:00Z', expected: '251231-19:30 (UTC-5h)' },
    { zone: 'Asia/Kolkata', timestamp: '2026-11-02T16:48:00Z', expected: '1102-22:18 (UTC+5:30)' },
    { zone: 'Asia/Kathmandu', timestamp: '2026-11-02T16:48:00Z', expected: '1102-22:33 (UTC+5:45)' },
    { zone: 'America/St_Johns', timestamp: '2026-11-02T16:48:00Z', expected: '1102-13:18 (UTC-3:30)' },
  ];
  const moduleUrl = new URL('../src/session/listing-model.ts', import.meta.url).href;
  for (const { zone, timestamp, expected } of cases) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { dateCell } from ${JSON.stringify(moduleUrl)}; console.log(dateCell(Date.parse(${JSON.stringify(timestamp)}), 2026));`,
    ], { env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected, `${zone}, ${timestamp}`);
  }
});

test('compact console dates reclaim column space without clipping dates or short titles', () => {
  const timestamp = new Date(2026, 10, 2, 16, 48).getTime();
  const title = 'A readable thirty-letter title';
  const listing = formatSessionListing([localOccurrence('compact', {
    title, createdTimestamp: timestamp, activityTimestamp: timestamp,
  })], { referenceYear: 2026, terminalWidth: 140 });
  const lines = listing.split('\n');
  const header = lines.findIndex((line) => line.startsWith('CREATED (LOCAL)'));
  assert.ok(header >= 0);
  const rows = lines.slice(header, header + 3);
  assert.equal(rows.length, 3);
  for (const row of rows)
    assert.equal(Array.from(row).length, 140);
  const cells = rows[2]!.split(' | ');
  assert.equal(cells[0]!.trim(), dateCell(timestamp, 2026));
  assert.equal(cells[1]!.trim(), dateCell(timestamp, 2026));
  assert.equal(cells[5]!.trim(), title);
  assert.match(listing, /Year 2026 is omitted/);
  assert.doesNotMatch(formatSessionListing([]), /Year \d+ is omitted/);
});

test('--show-ignored restores New Chat rows hidden for unknown creation and prompts', () => {
  const placeholder = localOccurrence('placeholder', {
    title: 'New Chat',
    createdTimestamp: null,
    promptCount: null,
    visibility: { status: 'hidden', reason: 'new-chat-unknown' },
  });
  const listing = formatSessionListing([placeholder], { showIgnored: true });

  assert.match(listing, /New Chat/);
  assert.match(listing, /ignored:new-chat\?/);
  assert.match(listing, /Showing 1 of 1 total conversations/);
});

test('--last25 limits the newest conversations after grouping and filtering', () => {
  const sessions = Array.from({ length: 30 }, (_, index) => localOccurrence(`session-${index}`, {
    activityTimestamp: Date.UTC(2026, 9, index + 1),
  }));
  const listing = formatSessionListing(sessions, { last25: true });

  assert.match(listing, /Showing 25 of 30 eligible conversations \(newest 25\)/);
  assert.match(listing, /session-29/);
  assert.doesNotMatch(listing, /session-0\s/);
});

test('--full-ids prints complete IDs while compact output shows a unique UUID prefix', () => {
  const id = 'abcdef12-0000-4000-8000-000000000001';
  const session = localOccurrence(id);
  const compact = formatSessionListing([session]);
  const full = formatSessionListing([session], { fullIds: true });

  assert.match(compact, /abcdef12\s+\|/);
  assert.doesNotMatch(compact, new RegExp(id));
  assert.ok(full.includes(id));
});

test('compact UUID prefixes lengthen with hex characters only when IDs collide', () => {
  const sessions = [
    localOccurrence('abcdef12-0000-4000-8000-000000000001'),
    localOccurrence('abcdef12-1000-4000-8000-000000000002'),
  ];
  const output = formatSessionListing(sessions);

  assert.match(output, /abcdef120\s+\|/);
  assert.match(output, /abcdef121\s+\|/);
  assert.match(output, /ID\/PREFIX/);
});

test('HTML uses local compact datetimes, bold prompts and complete linked workspace details', () => {
  const date = new Date(2026, 9, 8, 17, 58);
  const id = 'abcdef12-0000-4000-8000-000000000001';
  const session = localOccurrence(id);
  session.provenance.workspaceIdentity = { kind: 'folder', uri: 'file:///C:/Projects/My%20Project' };
  const html = formatSessionListingHtml([{ ...session, createdTimestamp: date.getTime() }], {}, date.toISOString());
  assert.match(html, /class="datetime" data-timestamp="\d+">261008_17:58<\/td>/);
  assert.match(html, /<strong>1<\/strong><span>conversations after merging duplicates<\/span>/);
  assert.match(html, /class="numeric"><strong>4<\/strong>/);
  assert.match(html, /font-family:"Arial Narrow",Arial,sans-serif;font-size:\.8rem/);
  assert.match(html, /Full session ID<\/dt><dd><code>abcdef12-0000-4000-8000-000000000001/);
  assert.match(html, /Workspace name \(URI basename\)<\/dt><dd>My Project/);
  assert.match(html, /Project \/ folder name<\/dt><dd>My Project/);
  assert.ok(html.includes(`href="${pathToFileURL(session.provenance.workspaceStoragePath).href}"`));
  assert.match(html, /href="file:\/\/\/C:\/Projects\/My%20Project"/);
  assert.match(html, /Journal JSONL/);
  assert.match(html, /Workspace ID \(storage hash\)/);
  assert.match(html, /Dates use the report generator's local time/);
});

test('HTML retains all ignored sessions in a collapsed bottom table independently of main filters', () => {
  const included = localOccurrence('visible');
  const ignored = localOccurrence('hidden', { title: 'Ignored unique title', visibility: { status: 'hidden', reason: 'fix' } });
  const html = formatSessionListingHtml([included, ignored], { last25: true });
  const main = html.split('<table id="sessions">')[1].split('</table>')[0];
  const bottom = html.split('<details class="guide" id="ignored-sessions">')[1];
  assert.doesNotMatch(main, /Ignored unique title/);
  assert.match(bottom, /Ignored unique title/);
  assert.match(bottom, /ignored: fix/);
  assert.match(bottom, /Full session ID/);
  assert.match(html, /href="#ignored-sessions"/);
  const all = formatSessionListingHtml([included, ignored], { showIgnored: true });
  assert.match(all.split('<table id="sessions">')[1].split('</table>')[0], /Ignored unique title/);
});

test('HTML controller is valid JavaScript and source text cannot terminate its script', () => {
  const html = formatSessionListingHtml([localOccurrence('test', { title: '</script><script>alert(1)</script>' })]);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0][1]));
  assert.doesNotMatch(scripts[0][1], /alert\(1\)/);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;alert\(1\)/);
});

test('source panels span all table columns, provide grouped cards and unique accessible toggles', () => {
  const html = formatSessionListingHtml([
    localOccurrence('visible'),
    localOccurrence('ignored', { visibility: { status: 'hidden', reason: 'fix' } }),
  ], { showIgnored: true });
  const ids = [...html.matchAll(/<tr class="source-detail-row" id="([^"]+)"><td colspan="7">/gu)].map((match) => match[1]);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids)
    assert.ok(html.includes(`aria-controls="${id}" hidden>Why / source</button>`));
  assert.match(html, /<h4>Conversation identity<\/h4>/);
  assert.match(html, /<h4>Workspace \/ project<\/h4>/);
  assert.match(html, /<h4>Files \/ locations<\/h4>/);
  assert.match(html, /<details class="row-details"><summary>Why \/ source:/);
  assert.match(html, /source-detail-row \.row-details\{max-width:none/);
});

test('listing exposes chat type, explains status and marks duplicate Local IDs as path-required', () => {
  const id = 'abcdef12-0000-4000-8000-000000000001';
  const first = localOccurrence(id, {
    occurrenceId: 'first-copy',
    provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\workspace-one' },
  });

  test('offline HTML links to an escaped collapsible storage/status guide and provides filters and charts', () => {
    const session = localOccurrence('abcdef12-0000-4000-8000-000000000001', {
      title: '<img src=x onerror=alert(1)>',
    });
    const html = formatSessionListingHtml([session], {}, '2026-10-08T20:00:00.000Z');

    assert.match(html, /href="#storage-guide"/);
    assert.match(html, /<details class="guide" id="storage-guide">/);
    assert.match(html, /workspaceStorage\/&lt;workspace-hash&gt;\//);
    assert.match(html, /state\.vscdb/);
    assert.match(html, /chatSessions\/&lt;session-id&gt;\.jsonl/);
    assert.match(html, /Unknown is not zero/);
    assert.match(html, /path required/);
    assert.match(html, /ambiguous · 🟠 ❓/);
    assert.match(html, /id="search"/);
    assert.match(html, /data-sort="created"/);
    assert.match(html, /class="bar"/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
    assert.doesNotMatch(html, /https?:\/\//);
  });
  const second = localOccurrence(id, {
    occurrenceId: 'second-copy',
    provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\workspace-two' },
  });
  const agent = localOccurrence('agent-host-copilotcli:/agent', {
    provider: 'agent-host',
    backing: { status: 'unresolved', reason: 'missing SDK backing' },
  });
  const subagent = localOccurrence('parent#subagent/child', {
    provider: 'agent-host',
    backing: {
      status: 'verified',
      source: {
        kind: 'sdk-events', provider: 'agent-host', sessionId: 'sdk-child',
        path: 'C:\\Code\\events.jsonl', schemaVersion: 1, producer: null,
        scope: { kind: 'subagent', agentId: 'child', parentToolCallId: 'tool-call', evidenceRecordIds: ['event-1'] },
        chatIdentity: 'agent-host-copilotcli:/agent', provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\workspace' },
        identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'digest',
      },
    },
  });
  const listing = formatSessionListing([first, second, agent, subagent]);

  assert.match(listing, /local\s+\|\s+abcdef12\s+\|\s+Session/);
  assert.match(listing, /agent\s+\|/);
  assert.match(listing, /sub-agent\s+\|/);
  assert.match(listing, /path required/);
  assert.match(listing, /verified = backing identity checked/);
  assert.match(listing, /unresolved = no verified chat backing/);
  assert.match(listing, /ambiguous \(🟠 ❓\)/);
});
