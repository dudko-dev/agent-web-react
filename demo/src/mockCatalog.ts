import { markReadOnly, type AgentToolSet } from '@dudko.dev/agent-web'
import { tool } from 'ai'
import { z } from 'zod'

/**
 * A synthetic catalogue of ~150 tools across six pretend MCP servers, so the
 * demo can show what happens with a catalogue far too big to send on every
 * call: the agent switches to tool search and finds what it needs with
 * `find_tools`. The tools answer with small, deterministic fake data.
 */

const SERVERS: Record<string, string[]> = {
  crm: ['customer', 'contact', 'deal', 'lead', 'account', 'note', 'pipeline', 'segment'],
  billing: ['invoice', 'payment', 'refund', 'subscription', 'plan', 'coupon', 'tax_rate'],
  calendar: ['event', 'meeting_room', 'availability', 'reminder', 'calendar'],
  support: ['ticket', 'macro', 'sla_policy', 'agent', 'satisfaction_survey', 'tag'],
  docs: ['page', 'space', 'template', 'comment', 'attachment'],
  analytics: ['dashboard', 'report', 'metric', 'funnel', 'cohort', 'alert'],
}

const VERBS: { verb: string; readOnly: boolean; describe: (n: string) => string }[] = [
  {
    verb: 'list',
    readOnly: true,
    describe: (n) => `List ${n.replace(/_/g, ' ')}s with optional filters.`,
  },
  { verb: 'get', readOnly: true, describe: (n) => `Get one ${n.replace(/_/g, ' ')} by id.` },
  {
    verb: 'search',
    readOnly: true,
    describe: (n) => `Full-text search across ${n.replace(/_/g, ' ')}s.`,
  },
  { verb: 'create', readOnly: false, describe: (n) => `Create a new ${n.replace(/_/g, ' ')}.` },
  {
    verb: 'update',
    readOnly: false,
    describe: (n) => `Update fields of an existing ${n.replace(/_/g, ' ')}.`,
  },
]

// Stable pseudo-random numbers so answers are reproducible.
const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h)
}

const fakeRecords = (server: string, noun: string, query: string) =>
  Array.from({ length: 3 }, (_, i) => {
    const id = `${noun.slice(0, 3)}_${(hash(`${server}${noun}${query}${i}`) % 9000) + 1000}`
    return {
      id,
      name: `${noun.replace(/_/g, ' ')} #${i + 1}`,
      value: (hash(id) % 50_000) / 100,
      status: ['open', 'active', 'closed'][hash(id) % 3],
    }
  })

export const buildMockCatalog = (): AgentToolSet => {
  const tools: AgentToolSet = {}
  for (const [server, nouns] of Object.entries(SERVERS)) {
    for (const noun of nouns) {
      for (const { verb, readOnly, describe } of VERBS) {
        const name = `mock_${server}__${verb}_${noun}`
        const t = tool({
          description: `[${server}] ${describe(noun)}`,
          inputSchema: z.object({
            id: z.string().optional().describe('Record id (get/update)'),
            query: z.string().optional().describe('Search text or filter'),
            fields: z
              .record(z.string(), z.string())
              .optional()
              .describe('Fields to set (create/update)'),
          }),
          execute: async ({ id, query, fields }) => {
            if (verb === 'create')
              return {
                id: `${noun.slice(0, 3)}_${hash(JSON.stringify(fields ?? {})) % 9000}`,
                created: true,
                fields,
              }
            if (verb === 'update') return { id, updated: true, fields }
            const records = fakeRecords(server, noun, `${id ?? ''}${query ?? ''}`)
            return verb === 'get'
              ? { ...records[0], id: id ?? records[0].id }
              : { total: records.length, records }
          },
        })
        tools[name] = readOnly ? markReadOnly(t) : t
      }
    }
  }
  return tools
}
