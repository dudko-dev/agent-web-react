# The chat panel

`<AgentChat>` is the drop-in UI: a transcript where every answer keeps its own
activity, a composer with everything around the input, and optional side
panels for saved chats and the agent's workspace. Every part can be switched
off, relabelled, rendered by you, or swapped for your own component — and
everything it does is also available as hooks and pure helpers for a fully
custom UI.

```tsx
import {
  AgentChat,
  ChatHistoryStore,
  VirtualFileSystem,
  createFileTools,
  useAgent,
} from '@dudko.dev/agent-web-react'
import '@dudko.dev/agent-web-react/styles.css'

const files = new VirtualFileSystem({ namespace: 'my-app' }) // IndexedDB
const history = new ChatHistoryStore()                        // IndexedDB

function Assistant() {
  const agent = useAgent({
    model,
    tools: { ...myTools, ...createFileTools(files) }, // the agent can use the workspace too
    memory: new IndexedDBStore(),                     // a reopened chat keeps its context
    toolApproval: { mode: 'ask-writes' },
  })
  return (
    <AgentChat
      controller={agent}
      title="Assistant"
      history={history}
      files={files}
      composer={{
        model: { label: 'Gemini 3.5 Flash', options: models, value, onSelect },
        thinking: { value: level, onChange: setLevel },
        convertFile: pdfToMarkdown, // PDFs the model can't read become Markdown
        dropZone: 'window',
      }}
      style={{ height: 640 }}
    />
  )
}
```

## Contents

- [Transcript](#transcript)
- [Composer](#composer)
- [Attachments: images, PDFs, files, URLs](#attachments-images-pdfs-files-urls)
- [Saved chats (IndexedDB)](#saved-chats-indexeddb)
- [Workspace (virtual file system)](#workspace-virtual-file-system)
- [Tool consent](#tool-consent)
- [Customising: show/hide, labels, render props, slots, components, theme](#customising)
- [Hooks and helpers for your own UI](#hooks-and-helpers-for-your-own-ui)

## Transcript

Each assistant message keeps **its own** activity after the next run starts —
the reducer mirrors the run onto the message:

- a collapsible summary ("2 steps · 3 tool calls · skills: …"), open while the
  answer is being produced;
- every step with its streamed text and thoughts;
- **every tool call** — name, arguments, status, ≈tokens of its arguments and
  of the result fed back to the model, its duration, and any images it
  returned (data URLs or `{ type: 'image' }` parts are shown as thumbnails);
- consent decisions and subagent delegations under the step that made them;
- the answer's thoughts (when the model thinks);
- a usage line with **tokens by kind**: `in 12k · out 456 · think 120 · cached 9k · 4.2 s`.

User messages show their text and attachments: image thumbnails (click to open
full size) and file chips. The header shows the conversation's total.

| Prop | Default | |
| --- | --- | --- |
| `showActivity` | `true` | the per-answer activity block |
| `showToolCalls` | `true` | each tool call inside it |
| `showUsage` | `true` | per-answer and per-tool-call tokens |
| `showTotalUsage` | `true` | the conversation total in the header |
| `showThoughts` | `true` | step and answer thoughts |
| `showStatus` | `true` | the status dot in the header |
| `showContext` | `false` | context meter above the composer (`number` = budget bar) |
| `activityOpen` | `false` | keep finished answers' activity expanded |

## Composer

`<AgentComposer>` (the footer of `<AgentChat>`, usable on its own):

- **notices** above the input: a limit that stopped the run, a compaction, a
  start failure, an attachment the model can't take, a microphone error —
  dismissible;
- **"+"**, **Ctrl+V** and **drag & drop** for files and images;
- **"/" commands**: `/compact`, `/new`, `/stop`, `/autopilot`, `/ask`,
  `/ask-all`, `/read-only`, `/think <level>`, and every skill as
  `/skill-name <goal>`; add your own with `commands`;
- **run timer**, **running subagents** ("2 agents"), the **model + thinking**
  chip (with a switcher), the **consent-mode** chip ("⚡ Auto"), a **mic**
  (speech to text with the browser's Web Speech API) and send / stop.

| Prop | |
| --- | --- |
| `model` | `{ label, options?, value?, onSelect? }` — chip and switcher |
| `thinking` | `{ value, options?, onChange }` — shown next to the model |
| `commands` / `builtinCommands` / `skillCommands` | slash commands |
| `attachments` | `false`, or `{ accept, maxBytes, imageMaxDimension, imageMaxPixels }` |
| `convertFile` / `convert` | file → text (e.g. PDF → Markdown), `'when-needed'` or `'always'` |
| `files` | save attachments into a `VirtualFileSystem` under `/attachments/` |
| `dropZone` | `'self'` (default), `'window'`, or a ref (`<AgentChat>` passes its panel) |
| `speech` | `false`, or `{ lang }` |
| `showTimer` / `showAgents` / `showApprovalMode` / `showNotices` | toolbar parts |
| `toolbarExtra` / `toolbarEnd` | your own toolbar content |
| `renderAttachment` | render a pending attachment chip yourself |
| `labels`, `placeholder`, `disabled`, `className` | |

Speech to text uses `SpeechRecognition` / `webkitSpeechRecognition` (Chrome,
Edge, Safari). In Chrome the audio is recognised by Google's service; the mic
button only appears where the API exists.

## Attachments: images, PDFs, files, URLs

What the composer does with each file:

| Kind | Goes to the model as | When the model can't take it |
| --- | --- | --- |
| text (`.md`, `.json`, `.ts`, …) | inlined into the goal, fenced | — (every model reads text) |
| image | a file part (downscaled to ≤ 1568 px / 1.15 MP first) | refused with a sentence the user can act on |
| PDF | a file part | converted with `convertFile` if given, else refused |
| other | a file part | `convertFile`, else refused |

"Can't take it" comes from the core's `agent.capabilities` (`images`, `pdf`,
`files`: true / false / unknown). Unknown means *try*: if the provider refuses,
the run fails with an `AttachmentsNotSupportedError` naming the model and what
to do instead — never a raw provider error.

Images are downscaled because providers bill images by their pixel size and
resize anything larger themselves; a 12 MP phone photo costs the same tokens
as its 1.15 MP version but uploads ten times slower.

The core also takes URLs: `agent.run(goal, { files: [{ data: new
URL('https://…/report.pdf') }] })` — providers that accept links fetch them
themselves; for the rest the AI SDK downloads them (from a browser: subject to
CORS).

## Saved chats (IndexedDB)

`history` on `<AgentChat>`: `true` (a default `ChatHistoryStore`), your own
`ChatHistoryStore`, or the result of your own `useChatHistory()` (to render the
list elsewhere). Each chat stores the transcript **with** its tool calls, usage
and image attachments, and its id becomes the agent's memory session — use a
persistent `memory` (`IndexedDBStore`) and a reopened chat continues with the
model's context intact.

The sidebar sits beside a wide panel and overlays a narrow one (under
`narrowWidth`, default 760 px), where it starts closed.

```ts
const store = new ChatHistoryStore({ dbName: 'my-app-chats' }) // or { memory: true }
const chats = useChatHistory(agent, { store, resumeLatest: true })
chats.chats      // [{ id, title, createdAt, updatedAt, messageCount, totalUsage }]
chats.select(id) // open one
chats.newChat()  // start fresh
chats.remove(id)
```

Chats are saved when a run settles, not on every streamed token.

## Workspace (virtual file system)

`files` takes the core's `VirtualFileSystem` (IndexedDB, browser only — in Node
use the real file system). The composer saves attachments into it under
`/attachments/`, the Files panel shows it live (preview text and images,
download, delete, upload), and `createFileTools(files)` gives the agent
`fs_list`, `fs_read` (read-only), `fs_write` and `fs_delete` over the same
files — so "summarise the PDF I attached and save the summary next to it"
works.

## Tool consent

With a `toolApproval` mode other than autopilot, consent requests appear as
cards in the transcript ("Allow once", "Always allow", "Deny"); the consent
chip in the composer and the `/autopilot`, `/ask`, `/ask-all`, `/read-only`
commands switch the mode live, even mid-run.

## Customising

**Show / hide** — the `show*` props above, `composer={false}`, `history`,
`files`.

**Labels (i18n)** — every string is a label, counted phrases are functions so
plurals work in any language:

```tsx
<AgentChat labels={{ send: 'Отправить', steps: (n) => `${n} шаг(ов)` }} />
// or for a whole tree:
<AgentLabelsProvider labels={ruLabels}>…</AgentLabelsProvider>
```

See `defaultLabels` for the full list (the demo ships a complete Russian set in
`demo/src/i18n.ts`).

**Render props** — take over a part and keep the rest; each gets the built-in
rendering as `fallback`:

```tsx
<AgentChat
  renderContent={(m) => <Markdown>{m.content}</Markdown>}
  renderToolCall={(call, fallback) =>
    call.name === 'make_move' ? <li><ChessMove move={call.input} /></li> : fallback}
  renderAttachment={(a) => <MyThumb attachment={a} />}
  renderMessage={(m, fallback) => <Animated key={m.id}>{fallback}</Animated>}
  renderApproval={(req, fallback) => fallback}
/>
```

**Slots** — `slots={{ header, headerStart, headerEnd, beforeMessages,
afterMessages, footerStart, sidebar }}` (`header: false` hides it).

**Components** — swap whole parts with your own (same props):
`components={{ Composer, MessageList, HistoryList, FilesPanel, ApprovalPrompt }}`.

**Theme** — `theme="auto" | "light" | "dark"`, the `--awr-*` custom properties
(colours, radius, fonts, `--awr-sidebar-width`, `--awr-files-width`),
`classNames={{ root, main, header, body, footer, sidebar, files }}` and
`className` / `style`. Components used outside `<AgentChat>` get the theme
tokens inside an element with class `awr-theme`.

## Hooks and helpers for your own UI

| | |
| --- | --- |
| `useAgent` | the agent, its UI state, `run(goal, { images, files, attachments, label })`, consent, `compact`, `sessionId`, `loadChat` |
| `useChatHistory` | saved chats over a `ChatHistoryStore` |
| `useVirtualFiles` | a live listing of a `VirtualFileSystem` + upload / remove / read |
| `useSpeechToText` | Web Speech API: `{ supported, listening, interim, start, stop, toggle }` |
| `useMcpServers` | several MCP servers, merged tools |
| `agentStateReducer` | the pure event → UI reducer |
| `parseSlash`, `filterCommands`, `attachmentKindOf`, `withAttachments`, `attachmentRefusal`, `noticesOf`, `formatElapsed`, `usageLine` | the composer's and transcript's pure logic |
| `downscaleImage` | the image downscaler |
