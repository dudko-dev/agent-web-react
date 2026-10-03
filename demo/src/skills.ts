import type { Skill } from '@dudko.dev/agent-web'

/**
 * Example skills (agentskills.io shape). Only the one-line descriptions sit in
 * the prompts; the planner picks the ones that apply, and their full text
 * enters the context only then — progressive disclosure.
 */
export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'chess-coach',
    description: 'Explain chess moves to a beginner — the idea, the threat, what to watch for.',
    content: `When you play or discuss a chess move:
- Name the idea in plain words (develops a piece, controls the centre, attacks a weakness, defends a threat).
- Point out any immediate threat the move creates or parries.
- If the user's last move was a mistake, say so kindly and why, in one sentence.
- Keep commentary to two short sentences; no notation dumps beyond the move itself.`,
  },
  {
    name: 'board-style',
    description:
      'House style for the sticky-notes board: short notes, one idea each, colour by priority.',
    content: `Sticky-notes house style:
- At most five words per note; one idea per note.
- Colours: red = urgent, yellow = normal, green = done, blue = info, purple = idea, pink = personal.
- For a checklist, create one note per item in the order given.
- Never duplicate a note that already exists on the board — update it instead.`,
  },
  {
    name: 'precise-answers',
    description: 'Answer from tool results precisely: quote numbers and ids, name the source tool.',
    content: `When answering from tool results:
- Quote the exact numbers, names and ids the tools returned; never round or paraphrase them away.
- Mention which tool (or server) each fact came from in a few words.
- If tools disagree, say so and show both values.`,
    files: [
      {
        path: 'citation-format.md',
        content: 'Cite like: "… 42 open tickets (support__count_tickets)".',
      },
    ],
  },
]

export const SKILL_TEMPLATE = `---
name: my-skill
description: When the agent should use this skill, in one line.
---
# Instructions
- Step-by-step guidance the agent follows when the skill applies.
`
