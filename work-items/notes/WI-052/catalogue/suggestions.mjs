// Concept groups, suggested short/medium templates, default include/hide flags, and GUI descriptions for the catalogue.
// Everything here is a reviewable suggestion. The user's choices live in lod-format-choices.json and win over these.
// Concept matching uses names only to GROUP rows. Origin (built-in / MCP) never comes from a name (see build-catalogue.mjs).

const failure = '{if error} ✗ {error | oneline | head:100}{/if}';
const sized = '{if result}({result | linecount} lines, {result | bytes}){/if}';
const fileOr = (verb, tail = '') => `{if path}${verb} {path | basename}${tail}{else}{title ?? name}{/if}`;

const toolMedium = `{name}{if input}({input | json | head:140}){/if}{if result} → {result | first | head:120}{/if}${failure}`;

export const concepts = {
  'file-read': {
    title: 'Read a file',
    short: `${fileOr('Read')}${failure}`,
    medium: `{if path}Read {path}{else}{title ?? name}{/if} ${sized}${failure}`,
  },
  'file-create': {
    title: 'Create a file',
    short: `${fileOr('Created')}${failure}`,
    medium: `{if path}Created {path}{else}{title ?? name}{/if}{if content} ({content | linecount} lines){/if}${failure}`,
  },
  'file-edit': {
    title: 'Edit a file',
    short: `${fileOr('Edited')}${failure}`,
    medium: `{if path}Edited {path}{else}{title ?? name}{/if}{if oldText} (-{oldText | linecount} +{newText | linecount} lines){/if}${failure}`,
  },
  patch: {
    title: 'Apply a patch',
    short: `Applied patch{if description}: {description | oneline | head:80}{/if}${failure}`,
    medium: `Applied patch: {description ?? title ?? name | oneline | head:160}${failure}`,
  },
  'list-directory': {
    title: 'List a folder',
    short: `{if path}Listed {path | basename}{else}{title ?? name}{/if}${failure}`,
    medium: `{if path}Listed {path}{else}{title ?? name}{/if} ${sized}${failure}`,
  },
  'search-files': {
    title: 'Find files by name',
    short: `{if query}Found files {query | oneline | head:80 | code}{else}{title ?? name}{/if}${failure}`,
    medium: `{if query}Found files {query | oneline | head:120 | code}{else}{title ?? name}{/if}{if result} → {result | linecount} results{/if}${failure}`,
  },
  'search-text': {
    title: 'Search text in files',
    short: `{if query}Searched {query | oneline | head:80 | code}{else}{title ?? name}{/if}{if path} in {path | basename}{/if}${failure}`,
    medium: `{if query}Searched {query | oneline | head:120 | code}{else}{title ?? name}{/if}{if path} in {path}{/if}{if result} → {result | linecount} lines{/if}${failure}`,
  },
  'search-code': {
    title: 'Search code by meaning or symbol',
    short: `{if query}Searched code: {query | oneline | head:80}{else}{title ?? name}{/if}${failure}`,
    medium: `{if query}Searched code: {query | oneline | head:140}{else}{title ?? name}{/if}{if result} → {result | linecount} lines{/if}${failure}`,
  },
  'shell-run': {
    title: 'Run a shell command',
    short: `$ {command | oneline | head:100}{if exitCode} ✗ exit {exitCode}{/if}${failure}`,
    medium: `{if description}{description | oneline | head:120}\n{/if}$ {command | oneline | head:240}\n{if exitCode}exit {exitCode} · {/if}{if result}{result | linecount} lines{/if}{if durationMs} · {durationMs | ms}{/if}${failure}`,
  },
  'shell-session': {
    title: 'Read or control a running shell',
    short: `{title ?? name}${failure}`,
    medium: `{title ?? name}{if input.shellId} ({input.shellId}){/if}{if result}: {result | first | head:100}{/if}${failure}`,
  },
  'web-fetch': {
    title: 'Fetch a web page',
    short: `{if url}Fetched {url | head:80}{else}{title ?? name}{/if}${failure}`,
    medium: `{if url}Fetched {url}{else}{title ?? name}{/if}{if result} ({result | bytes}){/if}${failure}`,
  },
  'web-search': {
    title: 'Search the web',
    short: `{if query}Searched the web: {query | oneline | head:80}{else}{title ?? name}{/if}${failure}`,
    medium: `{if query}Searched the web: {query | oneline | head:120}{else}{title ?? name}{/if}{if result}\n→ {result | first | head:160}{/if}${failure}`,
  },
  github: {
    title: 'GitHub lookup or action',
    short: `GitHub: {title ?? name}{if query}: {query | oneline | head:60}{/if}${failure}`,
    medium: `GitHub {name}({input | json | head:140}){if result} → {result | first | head:100}{/if}${failure}`,
  },
  'ask-user': {
    title: 'Question to the user and the answer',
    short: '❓ {question | oneline | head:160}{if answer} → {answer | oneline | head:100}{/if}',
    medium: '❓ {question | lines:8}{if choices}\nOptions: {choices | join:, | head:300}{/if}{if answer}\n→ {answer | lines:6}{/if}',
  },
  subagent: {
    title: 'Start, read, or message a subagent',
    short: `{input.agent_type ?? name}{if description ?? title}: {description ?? title | oneline | head:80}{/if}${failure}`,
    medium: `{input.agent_type ?? name}{if description ?? title}: {description ?? title | oneline | head:120}{/if}{if prompt}\nPrompt: {prompt | lines:6}{/if}{if result}\nResult: {result | lines:6}{/if}${failure}`,
  },
  'todo-plan': {
    title: 'Todo list or plan update',
    short: `{title ?? name}${failure}`,
    medium: `{title ?? name}{if todos}: {todos | count} items{/if}${failure}`,
  },
  'intent-status': {
    title: 'Intent or completion note',
    short: '{input.intent ?? input.summary ?? title ?? name | oneline | head:120}',
    medium: '{input.intent ?? input.summary ?? title ?? name | oneline | head:240}',
  },
  memory: {
    title: 'Memory read or write',
    short: `Memory: {input.subject ?? input.fact ?? title ?? name | oneline | head:100}${failure}`,
    medium: `Memory {name}: {input | json | head:220}${failure}`,
  },
  'session-info': {
    title: 'Chat session lookup',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  diagnostics: {
    title: 'Check problems or errors',
    short: `Checked problems{if path} in {path | basename}{/if}${failure}`,
    medium: `Checked problems{if path} in {path}{/if}{if result} → {result | linecount} lines{/if}${failure}`,
  },
  'tests-tasks': {
    title: 'Run tests or tasks',
    short: `{title ?? name}${failure}`,
    medium: `{title ?? name}{if result}: {result | first | head:120}{/if}${failure}`,
  },
  skill: {
    title: 'Load a skill',
    short: `Skill: {input.skill ?? input.name ?? title ?? name | head:60}${failure}`,
    medium: `Skill: {input.skill ?? input.name ?? title ?? name | head:60}{if result} ({result | bytes}){/if}${failure}`,
  },
  'tool-discovery': {
    title: 'Search for tools',
    short: `Searched tools: {query ?? title ?? name | head:60}${failure}`,
    medium: toolMedium,
  },
  artifact: {
    title: 'Artifact or reference bookkeeping',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  'vscode-api': {
    title: 'VS Code command, API, or extension',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  image: {
    title: 'View an image',
    short: `{if path}Viewed image {path | basename}{else}{title ?? name}{/if}${failure}`,
    medium: toolMedium,
  },
  notebook: {
    title: 'Notebook action',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  browser: {
    title: 'Browser automation',
    short: `Browser: {title ?? name}{if input.url} {input.url | head:60}{/if}${failure}`,
    medium: `{name}{if description} - {description | oneline | head:100}{/if}{if result}\n→ {result | first | head:120}{/if}${failure}`,
  },
  'docs-lookup': {
    title: 'Documentation lookup (MCP)',
    short: `{if query}Docs lookup: {query | oneline | head:80}{else}{title ?? name}{/if}${failure}`,
    medium: `{if query}Docs lookup: {query | oneline | head:120}{else}{title ?? name}{/if}{if result} ({result | bytes}){/if}${failure}`,
  },
  'code-graph': {
    title: 'Code knowledge graph (MCP)',
    short: `Code graph: {name}{if query} {query | oneline | head:60}{/if}${failure}`,
    medium: toolMedium,
  },
  'mcp-other': {
    title: 'Other MCP tool',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  'tool-other': {
    title: 'Other tool',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  pylance: {
    title: 'Python analysis (Pylance MCP)',
    short: `{title ?? name}${failure}`,
    medium: toolMedium,
  },
  'env-change': {
    title: 'Tools, MCP servers, extensions, or IDE changed',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'Environment bookkeeping. Turn on if you need to see when tools or servers changed.',
  },
  'agent-features': {
    title: 'Canvas, workflow, schedule, or autopilot event',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'Rare events, none recorded in the scanned chats. Review when you meet one.',
  },
  'msg-user': {
    title: 'User prompt',
    short: 'User: {content ?? text ?? message | oneline | head:200}',
    medium: 'User: {content ?? text ?? message | lines:12}',
  },
  'msg-assistant': {
    title: 'Assistant message to the user',
    short: 'Assistant: {content ?? text ?? value | oneline | head:200 | default:(no text)}{if toolRequests} [{toolRequests | count} tool calls]{/if}',
    medium: 'Assistant: {content ?? text ?? value | lines:12 | default:(no text)}{if toolRequests}\n[{toolRequests | count} tool calls]{/if}',
  },
  reasoning: {
    title: 'Reasoning (chain of thought)',
    short: '{if content ?? text ?? value}Reasoning: {content ?? text ?? value | oneline | head:160}{else}Reasoning (no readable text recorded){/if}',
    medium: '{if content ?? text ?? value}Reasoning: {content ?? text ?? value | lines:10}{else}Reasoning (no readable text recorded){/if}',
  },
  'tool-lifecycle': {
    title: 'Tool call lifecycle record',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'The tool rows already cover start and result. Showing these too would print each call twice.',
  },
  'subagent-lifecycle': {
    title: 'Subagent lifecycle',
    short: 'Subagent {name}: {agentName ?? agentDisplayName ?? data | head:60}',
    medium: 'Subagent {name}: {data | json | head:200}',
  },
  hook: {
    title: 'Hook run',
    short: 'Hook {name}',
    medium: 'Hook {name}: {data | json | head:200}',
    include: 'hide',
    why: 'Project rule: hooks are not exported. They are counted and reported as omitted.',
  },
  permission: {
    title: 'Permission request or answer',
    short: 'Permission {name}',
    medium: 'Permission {name}: {data | json | head:200}',
    include: 'hide',
    why: 'Project rule: permission prompts are not exported. They are counted and reported as omitted.',
  },
  'session-lifecycle': {
    title: 'Session start, resume, or end',
    short: '{name}',
    medium: '{name}{if selectedModel} ({selectedModel}){/if}{if timestamp} at {timestamp}{/if}',
  },
  'session-settings': {
    title: 'Model, mode, or permission change',
    short: '{name}{if newModel}: {newModel}{/if}{if newMode}: {newMode}{/if}',
    medium: '{name}: {data | json | head:200}',
  },
  compaction: {
    title: 'Context compaction or truncation',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
  },
  usage: {
    title: 'Usage, tokens, or cost record',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'Usage totals are cumulative and easy to double count. Report them once in the export header instead.',
  },
  notice: {
    title: 'Warning, error, info, or abort notice',
    short: '{name}: {message ?? errorType ?? reason | oneline | head:160}',
    medium: '{name}: {message ?? data | oneline | head:300}',
  },
  'fusion-model': {
    title: 'Model call or Fusion routing record',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'Internal model-call bookkeeping. Very high volume, little review value.',
  },
  'skill-event': {
    title: 'Skill delivered or invoked',
    short: 'Skill {name}: {skillName ?? name | head:60}',
    medium: 'Skill {name}: {data | json | head:200}',
  },
  'system-message': {
    title: 'System message or notification',
    short: '{name}: {content | oneline | head:120}',
    medium: '{name}: {content | lines:8}',
    include: 'hide',
    why: 'System prompts are large and repeated. Keep them out unless you are auditing instructions.',
  },
  'user-input': {
    title: 'User input or elicitation request',
    short: '{name}: {message ?? question | oneline | head:140}',
    medium: '{name}: {data | json | head:240}',
  },
  'context-change': {
    title: 'Context, instruction, or plan change',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'Bookkeeping about the working context. Turn on if you need to know why behaviour changed.',
  },
  delta: {
    title: 'Streaming delta',
    short: '{name}',
    medium: '{name}: {data | json | head:120}',
    include: 'hide',
    why: 'Partial text chunks. The full message record already holds the text.',
  },
  turn: {
    title: 'Turn boundary or per-turn counters',
    short: '{name}',
    medium: '{name}: {data | json | head:160}',
    include: 'hide',
    why: 'Boundary markers with no readable content.',
  },
  'event-other': {
    title: 'Other event',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'No concept matched. Review and decide.',
  },
  'local-reference': {
    title: 'Inline reference or citation',
    short: '{target ?? name | basename}',
    medium: '{name}: {target ?? text ?? data | oneline | head:160}',
    include: 'hide',
    why: 'Already part of the assistant text. Showing it again repeats the link.',
  },
  'local-edit': {
    title: 'File edit group',
    short: '{if uri.path ?? uri.fsPath}Edited {uri.path ?? uri.fsPath | basename}{else}{name}{/if}',
    medium: '{if uri.path ?? uri.fsPath}Edited {uri.path ?? uri.fsPath}{else}{name}{/if}{if edits}: {edits | count} edit groups{/if}',
  },
  'local-progress': {
    title: 'Progress or status line',
    short: '{value ?? content ?? name | oneline | head:100}',
    medium: '{value ?? content ?? name | oneline | head:200}',
    include: 'hide',
    why: 'Transient status text shown while work runs. Not part of the finished answer.',
  },
  'local-notice': {
    title: 'Warning or confirmation',
    short: '{name}: {content ?? title ?? message ?? value | oneline | head:140}',
    medium: '{name}: {content ?? title ?? message ?? value | lines:6}',
  },
  'local-misc': {
    title: 'Other Local response part',
    short: '{name}',
    medium: '{name}: {data | json | head:200}',
    include: 'hide',
    why: 'Visual or bookkeeping part. Review and decide.',
  },
  'prompt-context': {
    title: 'Attachment or context on a prompt',
    short: 'Attached: {name}{if path} {path | basename}{/if}',
    medium: 'Attached {name}: {path ?? data | oneline | head:160}',
  },
  'tool-payload': {
    title: 'Tool payload variant',
    short: '{name}',
    medium: '{name}: {data | oneline | head:200}',
    include: 'hide',
    why: 'A recorded variant inside a tool row. It is formatted through the tool row, so it has no line of its own.',
  },
  'request-meta': {
    title: 'Request or session metadata field',
    short: '{name}',
    medium: '{if value ?? data}{name}: {value ?? data | oneline | head:120}{else}{name} (empty){/if}',
    include: 'hide',
    why: 'Storage bookkeeping. Use the export header for model, timing, and usage instead.',
  },
  'api-type': {
    title: 'Public API type or protocol note',
    short: '{name}',
    medium: '{name}',
    include: 'hide',
    why: 'Documented only. No recorded example in the scanned chats.',
  },
};

const toolRules = [
  ['browser', /playwright|chrome-?devtools|^(browser_|close_page$|list_pages$|new_page$|select_page$)|(^|_)(click_?element|navigate_?page|open_?browser_?page|read_?page|screenshot_?page|type_?in_?page|handle_?dialog|run_?playwright_?code|hover_?element|drag_?element)$/i],
  ['docs-lookup', /context7|svelte|draw-?mcp|get-library-docs|resolve-library-id|query-docs|get_drawio/i],
  ['code-graph', /codebase-memo|^(check_index_coverage|get_architecture|get_code_snippet|index_repository|index_status|list_projects|search_code|search_graph|trace_path|query_graph|detect_changes|get_file_outline|get_graph_schema|manage_adr|compare_graphs|delete_project|ingest_traces)$/i],
  ['file-read', /^(view|copilot_readfile|read_file)$/i],
  ['file-create', /^(create|createfile|copilot_createfile|create_file|copilot_createdirectory|copilot_createnewworkspace|copilot_createnewjupyternotebook|createjupyternotebook)$/i],
  ['file-edit', /^(edit|str_replace|copilot_replacestring|copilot_multireplacestring|copilot_insertedit|copilot_editfiles|replace_string_in_file|multi_replace_string_in_file)$/i],
  ['patch', /^(apply_patch|copilot_applypatch)$/i],
  ['list-directory', /^(copilot_listdirectory|list_dir|copilot_readprojectstructure)$/i],
  ['search-files', /^(glob|copilot_findfiles|file_search|copilot_findtestfiles)$/i],
  ['search-text', /^(grep|rg|copilot_findtextinfiles|grep_search)$/i],
  ['subagent', /^(task|runsubagent|execution_subagent|explore_subagent|search_subagent|read_agent|write_agent|list_agents)$/i],
  ['search-code', /^(copilot_searchcodebase|semantic_search|copilot_searchworkspacesymbols|usages|dosearch)$/i],
  ['shell-run', /^(powershell|bash|run_in_terminal|copilot_runinterminal)$/i],
  ['shell-session', /^(read_powershell|write_powershell|stop_powershell|list_powershell|read_bash|write_bash|stop_bash|list_bash|send_to_terminal|get_terminal_output|kill_terminal)$/i],
  ['web-fetch', /^(web_fetch|copilot_fetchwebpage|vscode_fetchwebpage_internal|fetch_webpage)$/i],
  ['web-search', /^(web_search)$/i],
  ['ask-user', /^(ask_user|vscode_askquestions)$/i],
  ['todo-plan', /^(manage_todo_list|exit_plan_mode|sql|copilot_switchagent)$/i],
  ['intent-status', /^(report_intent|task_complete)$/i],
  ['memory', /^(memory|store_memory|vote_memory|copilot_memory|copilot_resolvememoryfileuri)$/i],
  ['session-info', /^(session_store_sql|copilot_sessionstoresql|get_current_session|get_session_context|list_sessions|archive_chat|create_session|delete_session|isolate_session|send_message|set_workspace)$/i],
  ['diagnostics', /^(copilot_geterrors|problems|get_errors)$/i],
  ['tests-tasks', /^(runtests|runtask|createandruntask|gettaskoutput|testfailure)$/i],
  ['skill', /^skill$/i],
  ['tool-discovery', /^(tool_search|tool_search_tool)$/i],
  ['artifact', /artifact_or_reference|artifacts_and_references/i],
  ['image', /^(copilot_viewimage|view_image)$/i],
  ['notebook', /notebook/i],
  ['vscode-api', /^(copilot_getvscodeapi|get_vscode_api|copilot_runvscodecommand|copilot_installextension|copilot_getchangedfiles|rename|configureautomation|deleteautomation|listautomations|runautomation|configurepythonenvironment|getpythonenvironmentinfo|getpythonexecutablecommand|installpythonpackage|configurenotebook)$/i],
  ['github', /github|^(activepullrequest|issue_fetch|labels_fetch|notification_fetch|openpullrequest|pullrequeststatuschecks|addcomment|deletecomments|listcomments|replytocomment|resolvecomments|resolvereviewthread|viewunreviewedcomments|create_pull_request|list_artifacts|get_commit|issue_read|issue_write|list_issues|list_pull_requests|list_commits|list_branches|pull_request_read|search_issues|search_pull_requests|search_repositories|search_users|get_file_contents|get_me)/i],
  ['pylance', /pylance/i],
  ['mcp-other', /^mcp_|-mcp-/i],
];

const eventRules = [
  ['msg-user', /^user\.message$/],
  ['msg-assistant', /^assistant\.message$/],
  ['reasoning', /^assistant\.reasoning$/],
  ['delta', /_delta$|^assistant\.streaming/],
  ['usage', /usage|^session\.(quota_observation|session_limits)/],
  ['turn', /^assistant\.(turn_|intent|idle|message_start)|^model\.turn_(started|ended)$|^session\.idle$/],
  ['fusion-model', /fusion|^model\./],
  ['tool-lifecycle', /^tool\.|^assistant\.server_tool_progress$/],
  ['subagent-lifecycle', /^subagent\./],
  ['hook', /^hook\./],
  ['permission', /^permission\.|^external_tool\.|^auto_mode_recovery|^auto_mode_switch|^session_limits_exhausted|^session\.permission_recovery/],
  ['session-lifecycle', /^session\.(start|resume|shutdown|handoff|snapshot_rewind|task_complete|remote)/],
  ['session-settings', /^session\.(model_change|model_deselected|mode_changed|mode_notice_delivered|permissions_changed|auto_mode_resolved|auto_tier|reasoning|title_changed|custom)/],
  ['compaction', /compaction|truncation/],
  ['notice', /^(abort|session\.(error|warning|info))$/],
  ['skill-event', /^skill\./],
  ['system-message', /^system\./],
  ['user-input', /^user_input\.|^elicitation\.|^command\.|^human_response\.|^exit_plan_mode\./],
  ['todo-plan', /^session\.todos_changed$/],
  ['env-change', /^mcp\.|^mcp_app\.|^sampling\.|^ide\.|^capabilities\.|^commands\.|^tool_search\.|^session\.(mcp_server|extensions|skills_loaded|tools_updated|managed_|background_tasks_changed)/],
  ['agent-features', /^session\.(canvas|schedule|autopilot)|^workflow\./],
  ['context-change', /^instruction\.|^session\.(context_changed|context_cleared|workspace_file_changed|plan_changed|binary_asset|journal_link|completion_receipt|indexed_search)|^pending_messages\.|^ui\./],
];

const localPartRules = [
  ['msg-assistant', /^\(markdown record, no kind\)$|^markdownContent$/],
  ['reasoning', /^thinking$/],
  ['ask-user', /^(questionCarousel|elicitation2|elicitationSerialized|planReview)$/],
  ['local-notice', /^(warning|info|confirmation|markdownVuln|mcpAuthenticationRequired|disabledClaudeHooks)$/],
  ['local-reference', /^(inlineReference|reference|codeCitation|usedContext|codeblockUri)$/],
  ['local-edit', /^(textEditGroup|textEdit|workspaceEdit|notebookEdit|externalEdit|multiDiffData)$/],
  ['local-progress', /^(progressMessage|progressTask|progressTaskSerialized|progressTaskResult|mcpServersStarting|mcpServersStartingSlow|voiceProgress|systemNotification)$/],
  ['tool-lifecycle', /^(toolInvocation|toolInvocationSerialized|externalToolInvocationUpdate|clearToPreviousToolInvocation)$/],
  ['hook', /^hook$/],
  ['session-settings', /^autoModeResolution$/],
  ['turn', /^undoStop$/],
  ['usage', /^usage$/],
];

export function conceptOf(row) {
  const { key, name } = row;
  const test = rules => rules.find(([, pattern]) => pattern.test(name))?.[0];
  if (key.startsWith('tool:'))
    return test(toolRules) ?? 'tool-other';
  if (key.startsWith('sdk-question:') || key.startsWith('local-question:'))
    return 'ask-user';
  if (key.startsWith('sdk-event:'))
    return test(eventRules) ?? 'event-other';
  if (key.startsWith('local-part:'))
    return test(localPartRules) ?? 'local-misc';
  if (key.startsWith('sdk-content:')) {
    if (/^(agent_|shell_|workflow_|new_inbox|instruction_discovered|extension_context)/.test(name))
      return 'system-message';
    if (/^(file|directory|selection|session_reference|github_|blob)/.test(name))
      return 'prompt-context';
    return 'tool-payload';
  }
  if (key.startsWith('local-prompt-part:') || key.startsWith('local-attachment:') || key.startsWith('sdk-attachment:'))
    return 'prompt-context';
  if (key.startsWith('local-tool-data:') || key.startsWith('local-result-details:'))
    return 'tool-payload';
  if (key.startsWith('local-request-field:') || key.startsWith('local-session-field:'))
    return name === 'message' ? 'msg-user' : 'request-meta';
  if (key.startsWith('api:'))
    return 'api-type';
  return 'event-other';
}

// A few rows deserve their own wording instead of the concept's.
export const rowOverrides = {
  'tool:report_intent': { include: 'hide', why: 'Short status note the agent sends before acting. Usually repeats the next tool line.' },
  'tool:tool_search': { include: 'hide', why: 'Tool discovery bookkeeping.' },
  'tool:tool_search_tool': { include: 'hide', why: 'Tool discovery bookkeeping.' },
  'local-part:toolInvocationSerialized': { include: 'hide', why: 'This is the container for every Local tool call. Each tool has its own row.' },
  'local-tool-data:terminal': { short: '$ {commandLine.original | oneline | head:100}', medium: '$ {commandLine.original | oneline | head:240}{if cwd.path} (in {cwd.path | basename}){/if}' },
  'local-tool-data:todoList': { short: 'Todo list: {todoList | count} items', medium: 'Todo list: {todoList | pick:title | join:; | head:240}' },
  'local-tool-data:subagent': { short: 'Subagent {agentName ?? agentDisplayName}: {description | oneline | head:80}', medium: 'Subagent {agentName ?? agentDisplayName}: {description | oneline | head:120}{if prompt}\nPrompt: {prompt | lines:6}{/if}' },
  'local-part:(markdown record, no kind)': { short: 'Assistant: {value | oneline | head:200}', medium: 'Assistant: {value | lines:12}' },
  'local-part:thinking': { short: '{if value}Reasoning: {value | oneline | head:160}{else}Reasoning (no readable text recorded){/if}', medium: '{if value}Reasoning: {value | lines:10}{else}Reasoning (no readable text recorded){/if}' },
  'local-request-field:message': { short: 'User: {text | oneline | head:200}', medium: 'User: {text | lines:12}' },
  'local-request-field:modelId': { include: 'show', short: 'Model: {value}', medium: 'Model: {value}', why: '' },
  'local-request-field:variableData': { include: 'show', short: 'Attachments: {variables | count}', medium: 'Attachments: {variables | pick:name | join:, | head:240}', why: '' },
  'sdk-event:session.start': { short: 'Session started', medium: 'Session started ({selectedModel}, {producer}){if data.context.repository ?? data.context.cwd} in {data.context.repository ?? data.context.cwd | basename}{/if}' },
  'sdk-event:session.model_change': { short: 'Model: {newModel}', medium: 'Model: {previousModel ?? "?"} → {newModel}' },
  'sdk-event:assistant.reasoning': { short: 'Reasoning: {content | oneline | head:160}', medium: 'Reasoning: {content | lines:10}' },
  'sdk-event:subagent.started': { short: 'Subagent started: {agentName ?? agentDisplayName}', medium: 'Subagent started: {agentName ?? agentDisplayName}{if agentDescription}\n{agentDescription | oneline | head:160}{/if}' },
  'sdk-event:subagent.completed': { short: 'Subagent done: {agentName ?? agentDisplayName}', medium: 'Subagent done: {agentName ?? agentDisplayName}{if durationMs} in {durationMs | ms}{/if}' },
  'sdk-event:session.compaction_complete': { short: 'Context compacted', medium: 'Context compacted{if tokensRemoved}: {tokensRemoved} tokens removed{/if}' },
  'sdk-event:session.compaction_start': { short: 'Context compaction started', medium: 'Context compaction started' },
  'sdk-event:session.error': { short: 'Error: {message | oneline | head:160}', medium: 'Error {errorType}: {message | lines:6}' },
  'sdk-event:session.warning': { short: 'Warning: {message | oneline | head:160}', medium: 'Warning: {message | lines:6}' },
  'sdk-event:session.info': { short: 'Info: {message | oneline | head:160}', medium: 'Info: {message | lines:6}' },
  'sdk-event:abort': { short: 'Aborted', medium: 'Aborted{if reason}: {reason}{/if}' },
  'sdk-event:skill.invoked': { short: 'Skill: {name | head:60}', medium: 'Skill: {name | head:60}{if path} ({path | basename}){/if}' },
};

// Families from repository-inventory.json that are relevant to each concept, so the page can show the earlier LOD research.
export const researchByConcept = {
  'msg-user': ['User request text'],
  'request-meta': ['Request state', 'Usage/timing'],
  'msg-assistant': ['Assistant prose'],
  reasoning: ['Reasoning'],
  'tool-lifecycle': ['Tool lifecycle'],
  'shell-run': ['Terminal payload'],
  'todo-plan': ['Todo payload'],
  subagent: ['Delegation payload'],
  'tool-payload': ['Generic tool input', 'Other tool payloads', 'Live-only tool payload', 'Tool results', 'Result parts'],
  'local-reference': ['References'],
  'local-edit': ['Edits', 'Edit controls'],
  'ask-user': ['Questions and confirmation'],
  'local-progress': ['Progress'],
  'local-notice': ['Warnings and notifications', 'Structured response views'],
  hook: ['Hooks'],
  'fusion-model': ['Model routing'],
  usage: ['Usage/timing'],
  compaction: ['Compaction'],
  image: ['Images'],
};

const sourceBlob = (repository, commit, path) => `https://github.com/${repository}/blob/${commit}/${path}`;

// Plain labels for structural rows. They restate the field or kind name. They are not taken from official docs.
const structuralLabels = {
  'local-request-field': {
    agent: 'Chat participant (agent) the request went to',
    codeCitations: 'Code citations on the response',
    completionTokens: 'Completion token count',
    confirmation: 'Confirmation choice recorded on the request',
    contentReferences: 'Content references on the response',
    copilotCredits: 'Credits used. Local unit, unverified. Never mix with SDK credits',
    editedFileEvents: 'File edit events recorded for the request',
    elapsedMs: 'Elapsed time of the request',
    followups: 'Suggested follow-up prompts',
    hiddenFromTranscript: 'Request hidden from the transcript',
    isSystemInitiated: 'Request started by the system, not the user',
    message: 'User prompt text and its parts',
    modeInfo: 'Chat mode recorded on the request',
    modelConfiguration: 'Model configuration for the request',
    modelId: 'Model used for the request',
    modelState: 'Model or cancellation state of the response',
    outputBuffer: 'Output buffer token count',
    promptTokenDetails: 'Prompt token breakdown',
    promptTokens: 'Prompt token count',
    requestId: 'Request id',
    responseId: 'Response id',
    responseMarkdownInfo: 'Markdown info for the response',
    responseTimestamp: 'Response timestamp',
    result: 'Result of the request: error details, metadata, timings',
    slashCommand: 'Slash command used',
    systemInitiatedLabel: 'Label for a system-started request',
    terminalExecutionId: 'Terminal execution linked to the request',
    timeSpentWaiting: 'Time spent waiting',
    timestamp: 'Request timestamp',
    variableData: 'Attached context variables',
    vote: 'User vote on the response',
    voteDownReason: 'Reason given for a down vote',
  },
  'local-session-field': {
    creationDate: 'Chat creation date',
    customTitle: 'Custom chat title',
    hasPendingEdits: 'Chat has edits not yet kept or undone',
    initialLocation: 'Where the chat was started',
    inputState: 'Saved input box state: attachments, mode, model',
    pendingRequests: 'Queued requests not yet sent',
    requests: 'All requests (turns) of the chat',
    responderUsername: 'Name shown for the responder',
    sessionId: 'Chat session id',
    version: 'Journal format version',
  },
  'local-attachment': {
    directory: 'Folder attached to a prompt',
    element: 'Attachment of kind "element"',
    file: 'File attached to a prompt',
    generic: 'Attachment of kind "generic"',
    image: 'Image attached to a prompt',
    paste: 'Pasted content attached to a prompt',
    promptFile: 'Prompt file attached to a prompt',
    promptText: 'Prompt text attached to a prompt',
    tool: 'Tool reference attached to a prompt',
    workspace: 'Workspace attached to a prompt',
  },
  'sdk-attachment': {
    blob: 'Binary attachment on a user message',
    directory: 'Folder attached to a user message',
    file: 'File attached to a user message',
    selection: 'Editor selection attached to a user message',
  },
  'local-prompt-part': {
    agent: 'Agent mention in the prompt text',
    dynamic: 'Dynamic reference in the prompt text',
    prompt: 'Prompt reference in the prompt text',
    subcommand: 'Slash command in the prompt text',
    text: 'Plain text in the prompt',
    tool: 'Tool reference in the prompt text',
  },
  'local-tool-data': {
    '(none)': 'Tool call with no tool-specific data',
    input: 'Generic tool input block',
    subagent: 'Subagent call data',
    terminal: 'Terminal command data',
    todoList: 'Todo list data',
  },
  'local-result-details': {
    '(none)': 'Tool result with no details',
    'array of locations': 'Result is a list of file locations',
    'object: input, inputLanguage, isError, output': 'Input and output, with a language and an error flag',
    'object: input, isError, output': 'Input and output, with an error flag',
    'object: input, output': 'Input and output',
  },
  'local-question': {
    'singleSelect+options': 'Single-choice question with options',
    'singleSelect+freeform+options': 'Single-choice question with options and free text',
    'multiSelect+freeform+options': 'Multi-choice question with options and free text',
  },
};

export function structuralLabel(row) {
  const [family, ...rest] = row.key.split(':');
  const name = rest.join(':');
  if (structuralLabels[family]?.[name])
    return structuralLabels[family][name];
  if (family === 'sdk-question')
    return `Question form: ${name}`;
  return undefined;
}

// Where the wording of each GUI note comes from. The page shows these labels next to every note.
export const evidence = {
  source: 'inferred from source',
  observed: 'observed here',
  unknown: 'unknown',
  documented: 'documented',
};

const localToolGui = 'A collapsible tool line in the response. While it runs the line shows `invocationMessage`. When done it shows `pastTenseMessage`. Expanding the line shows `resultDetails` (input and output) or a block chosen by `toolSpecificData.kind`. `icon` picks the leading icon.';
const sdkToolGui = 'The SDK does not document how clients draw a tool call. Fields that look display-related: `toolTitle`, `intentionSummary`, and `displayVerbatim` (documented as "display expanded in the CLI timeline"). How Agent Host or Copilot CLI draw it is unknown here.';
const sdkUnknownGui = 'The SDK documents the event fields but not how a client shows it. How Agent Host or Copilot CLI draw this is unknown here.';

export const guiByConcept = {
  'shell-run': {
    local: 'A terminal block. When `toolSpecificData.kind` is `terminal`, the card shows the command (`commandLine.forDisplay` when set) and its output. The chat model source says an Agent Host session shows `intention` above the command.',
    sdk: sdkToolGui,
  },
  'ask-user': {
    local: 'A question carousel with one page per question. Options render as choices, `allowFreeformInput` adds a text box, and `allowSkip` adds a skip action. After an answer, `data` holds the picked values and `isUsed` is set.',
    sdk: 'The SDK `ask_user` tool sends either a form schema (`requestedSchema`) or a question with `choices`. How Agent Host or Copilot CLI draw it is unknown here.',
  },
  subagent: {
    local: 'A subagent pill. `toolSpecificData.kind` is `subagent`, with a description, agent name, prompt, and result. The source describes a compact pill that can open the child chat.',
    sdk: 'Subagent calls appear as `task` tool rows plus `subagent.*` events. The exporter shows sub-agents inline in the parent chat. The native display is unknown here.',
  },
  'todo-plan': {
    local: 'A checklist block when `toolSpecificData.kind` is `todoList` (ids, titles, and status: not-started, in-progress, completed).',
    sdk: sdkToolGui,
  },
  reasoning: {
    local: 'A collapsible "Thinking" block. `value` holds the readable text when the model returns it. Many parts have an empty `value` and only `metadata`, and the reasoning is then not readable from the journal.',
    sdk: 'SDK reasoning arrives as `assistant.reasoning` (readable) and as opaque fields. How Agent Host or Copilot CLI show it is unknown here.',
  },
  'msg-assistant': {
    local: 'Rendered Markdown in the response. Local journals store the text as many small Markdown records, which the chat view joins into one flow.',
    sdk: 'Rendered Markdown in the timeline. `assistant.message` also lists the tool requests of that turn in `toolRequests`.',
  },
  'msg-user': {
    local: 'The user bubble at the top of each turn, with attachments shown as chips.',
    sdk: 'The user bubble in the timeline. Attachments arrive as separate fields.',
  },
  'local-reference': {
    local: 'A clickable file or symbol chip inside the assistant text. A `codeblockUri` links a code block to its file.',
    sdk: sdkUnknownGui,
  },
  'local-edit': {
    local: 'An edit group with the changed file and a diff. The user can keep or undo the edits.',
    sdk: sdkUnknownGui,
  },
  'local-progress': {
    local: 'A transient status line (for example "Searching...") or an MCP server start notice. It is replaced when the work finishes.',
    sdk: sdkUnknownGui,
  },
  hook: {
    local: 'A hook result line. If `stopReason` is set the hook blocked the step, and the message is shown to the user.',
    sdk: sdkUnknownGui,
  },
};

export function guiFor(row, concept, publicInfo) {
  const notes = [];
  const known = guiByConcept[concept];
  const isLocal = row.family?.includes('Local') || row.key.startsWith('local-');
  const isSdk = row.family?.includes('SDK') || row.key.startsWith('sdk-');
  if (row.key.startsWith('tool:')) {
    notes.push({ where: 'Local VS Code chat', text: known?.local ?? localToolGui, evidence: evidence.source, basis: 'IChatToolInvocationSerialized in microsoft/vscode chatService.ts, plus fields recorded in the scanned journals.' });
    notes.push({ where: 'Agent Host, Copilot CLI (SDK)', text: known?.sdk ?? sdkToolGui, evidence: evidence.unknown, basis: 'github/copilot-sdk generated types describe the fields only.' });
  } else if (isLocal) {
    notes.push({ where: 'Local VS Code chat', text: publicInfo?.vscode?.description ? `Source describes it as: ${publicInfo.vscode.description}` : (known?.local ?? 'No rendering note found. The journal records it, and how the chat view draws it was not checked.'), evidence: publicInfo?.vscode ? evidence.source : evidence.unknown, basis: publicInfo?.vscode ? 'microsoft/vscode chatService.ts at the pinned commit.' : 'No source description matched.' });
    if (known?.local && publicInfo?.vscode?.description)
      notes.push({ where: 'Local VS Code chat (observed fields)', text: known.local, evidence: evidence.source, basis: 'Interface fields in chatService.ts and values seen in the scanned journals.' });
  } else if (isSdk) {
    notes.push({ where: 'Agent Host, Copilot CLI (SDK)', text: known?.sdk ?? sdkUnknownGui, evidence: evidence.unknown, basis: 'github/copilot-sdk generated types describe the fields only.' });
    if (publicInfo?.sdk?.description)
      notes.push({ where: 'SDK description', text: publicInfo.sdk.description, evidence: evidence.source, basis: 'JSDoc on the event interface in session-events.ts at the pinned commit.' });
  } else {
    notes.push({ where: 'Any chat', text: 'Documented API or protocol type. It is not recorded in session files, so there is no recorded rendering.', evidence: evidence.unknown, basis: 'Online research notes (work-items/notes/WI-052/online/findings.json).' });
  }
  return notes;
}

export function sourceLinks(publicSources) {
  const links = {};
  if (publicSources.sdk)
    links.sdk = { label: `copilot-sdk session-events.ts @ ${publicSources.sdk.commit.slice(0, 7)}`, url: sourceBlob(publicSources.sdk.repository, publicSources.sdk.commit, publicSources.sdk.path) };
  if (publicSources.vscode)
    links.vscode = { label: `vscode chatService.ts @ ${publicSources.vscode.commit.slice(0, 7)}`, url: sourceBlob(publicSources.vscode.repository, publicSources.vscode.commit, publicSources.vscode.path) };
  if (publicSources.cliDocs)
    links.cli = { label: `CLI command reference @ ${publicSources.cliDocs.commit.slice(0, 7)}`, url: sourceBlob(publicSources.cliDocs.repository, publicSources.cliDocs.commit, publicSources.cliDocs.path) };
  return links;
}
