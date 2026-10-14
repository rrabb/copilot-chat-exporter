import type { ConversationGroup } from './listing-model.ts';
import type { ListingEvidence } from './listing-evidence-types.ts';

export interface ListingRelationship {
  from: string;
  to: string | null;
  targetLabel: string;
  kind: 'parent' | 'fork' | 'likely-fork' | 'likely-copy' | 'peer';
  evidence: string;
}

export function listingRelationships (
  groups: readonly ConversationGroup[],
  evidence: ReadonlyMap<string, ListingEvidence>,
): ListingRelationship[] {
  const result: ListingRelationship[] = [];
  const byOccurrence = new Map(groups.flatMap((group) => group.occurrences.map((item) => [item.occurrenceId, group.key] as const)));
  for (const group of groups) {
    const row = group.representative;
    for (const item of group.occurrences) {
      if (item.parentOccurrenceId) {
        const target = byOccurrence.get(item.parentOccurrenceId) ?? null;
        const edge: ListingRelationship = {
          from: group.key, to: target, targetLabel: item.parentOccurrenceId,
          kind: 'parent', evidence: 'Unique persisted parent tool-call and agent binding from verified inventory.',
        };
        if (!result.some((other) => other.from === edge.from && other.to === edge.to && other.kind === edge.kind))
          result.push(edge);
      }
    }
    const metadata = evidence.get(row.occurrenceId);
    if (metadata?.fork) {
      const parent = groups.filter((candidate) => candidate.representative.backing.status === 'verified'
        && candidate.representative.backing.source.kind === 'sdk-events'
        && candidate.representative.backing.source.scope.kind === 'main'
        && candidate.representative.backing.source.sessionId === metadata.fork?.parentSessionId);
      result.push({
        from: group.key, to: parent.length === 1 ? parent[0].key : null,
        targetLabel: metadata.fork.parentSessionId, kind: 'fork', evidence: metadata.fork.source,
      });
    }
    if (row.backing.status === 'verified' && row.backing.source.kind === 'sdk-events'
      && row.backing.source.scope.kind === 'main' && row.provider === 'agent-host') {
      const host = row.sessionId.split('#')[0];
      for (const peer of groups) {
        if (peer.key === group.key || peer.representative.provider !== 'agent-host'
          || peer.representative.backing.status !== 'verified' || peer.representative.backing.source.kind !== 'sdk-events'
          || peer.representative.backing.source.scope.kind !== 'main')
          continue;
        if (peer.representative.sessionId.split('#')[0] === host)
          result.push({ from: group.key, to: peer.key, targetLabel: peer.representative.title, kind: 'peer', evidence: 'Distinct verified main-chat identities under the same exact Agent Host session key; not a fork or delegation.' });
      }
    }
  }
  const compact = (value: string) => value.replace(/\s+/gu, ' ').trim().toLowerCase();
  const buckets = new Map<string, ConversationGroup[]>();
  for (const group of groups) {
    const data = evidence.get(group.representative.occurrenceId);
    if (!data || data.state !== 'read' || !data.turns.length || data.fork
      || group.representative.backing.status !== 'verified'
      || (group.representative.backing.source.kind === 'sdk-events' && group.representative.backing.source.scope.kind === 'subagent')
      || data.flags.includes('redacted-text'))
      continue;
    const key = compact(data.turns[0].prompt);
    const bucket = buckets.get(key) ?? [];
    bucket.push(group);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    for (const group of bucket) {
      const data = evidence.get(group.representative.occurrenceId)!;
      const copies = bucket.filter((other) => {
        const otherData = evidence.get(other.representative.occurrenceId)!;
        return other.key !== group.key && compact(other.representative.title) === compact(group.representative.title)
          && otherData.bytes !== null && otherData.bytes === data.bytes && otherData.turns.length === data.turns.length
          && data.turns.every((turn, index) => compact(turn.prompt) === compact(otherData.turns[index].prompt));
      });
      for (const copy of copies)
        result.push({ from: group.key, to: copy.key, targetLabel: copy.representative.title, kind: 'likely-copy',
          evidence: 'BEST-EFFORT: matching title, every recorded prompt, prompt count and scoped payload bytes. This is not identity evidence.' });
      if (!/^forked:/iu.test(group.representative.title))
        continue;
      const candidates = bucket.filter((other) => {
        const otherData = evidence.get(other.representative.occurrenceId)!;
        return other.key !== group.key && otherData.turns.length > data.turns.length
          && data.turns.every((turn, index) => compact(turn.prompt) === compact(otherData.turns[index].prompt));
      }).sort((a, b) => evidence.get(a.representative.occurrenceId)!.turns.length - evidence.get(b.representative.occurrenceId)!.turns.length);
      if (candidates.length && (candidates.length === 1
        || evidence.get(candidates[0].representative.occurrenceId)!.turns.length !== evidence.get(candidates[1].representative.occurrenceId)!.turns.length))
        result.push({ from: group.key, to: candidates[0].key, targetLabel: candidates[0].representative.title, kind: 'likely-fork',
          evidence: `BEST-EFFORT: title starts with Forked: and all ${data.turns.length} prompts match a strict prefix of the unique shortest longer chat. Direction remains unproven; nothing is grouped by this hint.` });
    }
  }
  return result;
}
