import type { Page, Route } from '@playwright/test'

/**
 * A scripted stand-in for the Gemini API, installed with `page.route`: the
 * page drives the real agent (planner → executor tool loop → synthesizer) with
 * the real `@ai-sdk/google` provider, and only the HTTP answers are scripted.
 * Each request is routed by the role marker in its system instruction.
 */
export interface GeminiCall {
  stage: 'planner' | 'replanner' | 'executor' | 'synthesizer' | 'other'
  /** All text of the system instruction. */
  system: string
  /** All user text (goal, state, tool results) in order. */
  user: string
  /** Function responses already in the conversation (tool-loop position). */
  functionResponses: { name: string; response: unknown }[]
  /** Inline files sent (images, PDFs). */
  inlineData: { mimeType: string; bytes: number }[]
  /** generationConfig.thinkingConfig.thinkingLevel, when the call asked for thinking. */
  thinkingLevel?: string
  streaming: boolean
}

export type GeminiReply = (
  | { text: string }
  | { call: { name: string; args: Record<string, unknown> } }
  /** An HTTP error from the API (e.g. 429 when the quota is spent). */
  | { error: { status: number; message: string } }
) & {
  /** Hold the answer this long (a slow model, to act mid-run). */
  delayMs?: number
}

type Part = {
  text?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: unknown
  functionResponse?: { name: string; response: unknown }
}
type Body = {
  systemInstruction?: { parts?: Part[] }
  contents?: { role: string; parts?: Part[] }[]
  generationConfig?: { thinkingConfig?: { thinkingLevel?: string } }
}

const stageOf = (system: string): GeminiCall['stage'] => {
  if (system.includes('REPLANNER')) return 'replanner'
  if (system.includes('PLANNER')) return 'planner'
  if (system.includes('EXECUTOR')) return 'executor'
  if (system.includes('SYNTHESIZER')) return 'synthesizer'
  return 'other'
}

const USAGE = {
  promptTokenCount: 1200,
  candidatesTokenCount: 40,
  cachedContentTokenCount: 800,
  thoughtsTokenCount: 12,
  totalTokenCount: 1252,
}

export const mockGemini = async (
  page: Page,
  script: (call: GeminiCall) => GeminiReply,
): Promise<GeminiCall[]> => {
  const calls: GeminiCall[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
    const req = route.request()
    const body = (req.postDataJSON() ?? {}) as Body
    const system = (body.systemInstruction?.parts ?? []).map((p) => p.text ?? '').join('\n')
    const parts = (body.contents ?? []).flatMap((c) =>
      (c.parts ?? []).map((p) => ({ role: c.role, ...p })),
    )
    const call: GeminiCall = {
      stage: stageOf(system),
      system,
      user: parts
        .filter((p) => p.role === 'user' && p.text)
        .map((p) => p.text)
        .join('\n'),
      functionResponses: parts
        .filter((p) => p.functionResponse)
        .map((p) => p.functionResponse as { name: string; response: unknown }),
      inlineData: parts
        .filter((p) => p.inlineData)
        .map((p) => ({ mimeType: p.inlineData!.mimeType, bytes: p.inlineData!.data.length })),
      thinkingLevel: body.generationConfig?.thinkingConfig?.thinkingLevel,
      streaming: req.url().includes(':streamGenerateContent'),
    }
    calls.push(call)
    const reply = script(call)
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs))
    if ('error' in reply) {
      await route.fulfill({
        status: reply.error.status,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          error: { code: reply.error.status, message: reply.error.message, status: 'ERROR' },
        }),
      })
      return
    }
    const candidate = {
      content: {
        role: 'model',
        parts: 'text' in reply ? [{ text: reply.text }] : [{ functionCall: reply.call }],
      },
      finishReason: 'STOP',
      index: 0,
    }
    const chunk = { candidates: [candidate], usageMetadata: USAGE }
    await route.fulfill(
      call.streaming
        ? {
            status: 200,
            headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
            body: `data: ${JSON.stringify(chunk)}\r\n\r\n`,
          }
        : {
            status: 200,
            headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
            body: JSON.stringify(chunk),
          },
    )
  })
  return calls
}

/** A one-step plan, as the planner's JSON. */
export const plan = (...steps: string[]): GeminiReply => ({
  text: JSON.stringify({ thought: 'On it.', steps: steps.map((description) => ({ description })) }),
})
