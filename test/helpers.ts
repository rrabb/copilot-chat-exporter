import type { ParsedSession, ToolNode, Turn } from '../src/types.ts';

export function testTool (over: Partial<ToolNode> = {}): ToolNode {
  return {
    type: 'tool',
    toolCallId: 'c1',
    toolId: 'read_file',
    isComplete: true,
    isConfirmed: false,
    invocation: '',
    pastTense: '',
    title: '',
    toolSpecificData: null,
    command: '',
    promptText: '',
    todos: null,
    output: '',
    exitCode: null,
    duration: null,
    resultText: '',
    fileUri: '',
    ...over,
  };
}

export function testTurn (over: Partial<Turn> = {}): Turn {
  return {
    number: 1,
    requestId: 'r1',
    ts: 0,
    prompt: 'do the thing',
    body: [],
    reasoning: [],
    prose: [],
    toolNodes: [],
    todos: [],
    filesTouched: [],
    scalar: {},
    ...over,
  };
}

export function testSession (over: Partial<ParsedSession> = {}): ParsedSession {
  return {
    title: 'Test session',
    customTitle: 'Test session',
    defaultTitle: 'do the thing',
    creationDate: 0,
    responderUsername: 'GitHub Copilot',
    initialLocation: 'panel',
    turns: [],
    rawRequests: [],
    census: {
      seen: new Map(),
      dropped: new Map(),
      toolData: new Map(),
      unhandled: [],
      unrecognizedToolData: [],
    },
    editedFiles: [],
    errors: [],
    ...over,
  };
}
