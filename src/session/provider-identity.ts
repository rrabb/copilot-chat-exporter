export interface AgentHostIdentity {
  session: string;
  id: string;
  chat: string;
  toolCallId?: string;
}

export function validStorageId (id: string) {
  return /^[a-zA-Z0-9_-]+$/u.test(id);
}

export function defaultChat (session: string) {
  return `ahp-chat://default/${Buffer.from(session).toString('base64url')}`;
}

/** Decode exactly one provider session/chat; reject remote, traversal and conflicting selectors. */
export function parseAgentHostIdentity (key: string): AgentHostIdentity {
  const uri = new URL(key);
  if (uri.protocol !== 'agent-host-copilotcli:' || uri.host)
    throw new Error('Unsupported provider or remote Agent Host identity.');
  const id = decodeURIComponent(uri.pathname.slice(1));
  if (!validStorageId(id))
    throw new Error('Unsupported provider session ID.');
  const session = `copilotcli:/${id}`;
  const fragment = decodeURIComponent(uri.hash.slice(1));
  const query = new URLSearchParams(decodeURIComponent(uri.search.slice(1)));
  if ([...query.keys()].some((name) => name !== 'subagentChatResource')
    || query.getAll('subagentChatResource').length > 1)
    throw new Error('Unsupported or duplicate Agent Host query identity.');
  const encoded = Buffer.from(session).toString('base64url');
  const chat = query.get('subagentChatResource') ?? (fragment.startsWith('subagent/')
    ? `ahp-chat://subagent/${encoded}/${encodeURIComponent(fragment.slice(9))}`
    : `ahp-chat://${fragment || 'default'}/${encoded}`);
  const parsed = new URL(chat);
  const segments = parsed.pathname.slice(1).split('/');
  if (parsed.protocol !== 'ahp-chat:' || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.port
    || segments[0] !== encoded)
    throw new Error('Chat resource does not belong to the indexed provider session.');
  if (parsed.hostname === 'subagent') {
    const toolCallId = decodeURIComponent(segments.slice(1).join('/'));
    if (!toolCallId || (fragment && fragment !== `subagent/${toolCallId}`))
      throw new Error('Conflicting subagent identity.');
    return { session, id, chat: defaultChat(session), toolCallId };
  }
  if (segments.length !== 1 || !validStorageId(parsed.hostname) || (fragment && fragment !== parsed.hostname))
    throw new Error('Unsupported or conflicting peer-chat identity.');
  return { session, id, chat };
}

export function chatDataKey (chat: string) {
  const uri = new URL(chat);
  return `${uri.host}-${decodeURIComponent(uri.pathname.slice(1))}`.replace(/[^a-zA-Z0-9_.-]/gu, '-');
}
