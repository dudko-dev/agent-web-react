import { expect, test, type Page } from '@playwright/test'
import { mockGemini, plan, type GeminiCall, type GeminiReply } from './gemini.ts'

/**
 * Talking to the agent while it works, in a real page: the demo's real agent and real
 * provider, with only Gemini's HTTP answers scripted. What matters is what the MODEL was
 * sent and when — read off the recorded requests — and what the user sees.
 */

const openWithKey = async (page: Page) => {
  await page.goto('/')
  await page.getByPlaceholder('AIza…').fill('AIza-test-key')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
}

const send = async (page: Page, text: string) => {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

const decision = (mode: 'continue' | 'finish'): GeminiReply => ({
  text: JSON.stringify({ decision: mode, reason: `because ${mode}` }),
})

test('a message typed while the agent works reaches it between tool calls, and the plan is re-checked', async ({
  page,
}) => {
  const calls = await mockGemini(page, (c: GeminiCall): GeminiReply => {
    if (c.stage === 'planner') return plan('Add a note')
    if (c.stage === 'executor') {
      // The first model call is held, so there is time to type.
      return c.functionResponses.length === 0
        ? { call: { name: 'add_note', args: { text: 'first' } }, delayMs: 1500 }
        : { text: 'Added.' }
    }
    if (c.stage === 'replanner') return decision('continue')
    return { text: 'Done, in metric.' }
  })
  await openWithKey(page)
  await send(page, 'add a note')
  await expect(page.locator('.awr-sendbtn--stop')).toBeVisible()

  // While it works the input is still live — and says what it does now.
  const box = page.getByRole('textbox', { name: 'Message' })
  await expect(box).toHaveAttribute('placeholder', 'Tell the agent something while it works…')
  await box.fill('use metric units')
  await page.getByRole('button', { name: 'Send to the agent' }).click()
  await expect(box).toHaveValue('')
  // Waiting for a boundary: shown as queued, not yet as part of the conversation.
  await expect(page.locator('.awr-queued__item')).toContainText('use metric units')

  // Once the tool has run, the agent has it: the queue empties and the note appears
  // under the step, saying where it landed.
  const note = page.locator('.awr-note')
  await expect(note.locator('.awr-note__text')).toHaveText('use metric units')
  await expect(note.locator('.awr-note__where')).toHaveText('you said, between tool calls')
  await expect(page.locator('.awr-queued__item')).toHaveCount(0)
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText('Done, in metric.')

  // The model was told — in the round after the tool result, not before.
  const executor = calls.filter((c) => c.stage === 'executor')
  expect(executor).toHaveLength(2)
  expect(executor[0].user).not.toContain('use metric units')
  expect(executor[1].user).toContain('NEW MESSAGE FROM THE USER')
  expect(executor[1].user).toContain('use metric units')
  // …and the replanner re-checked the plan against it, though nothing had failed.
  const replanner = calls.filter((c) => c.stage === 'replanner')
  expect(replanner).toHaveLength(1)
  expect(replanner[0].user).toContain('use metric units')
  // The answer was written knowing it.
  expect(calls.find((c) => c.stage === 'synthesizer')?.user).toContain('use metric units')

  // It is a note on THIS run, not a new turn of the conversation.
  await expect(page.locator('.awr-msg--user')).toHaveCount(1)
  await expect(page.locator('.awr-note')).toHaveCount(1)
})

test('a message that comes too late for the run is sent as the next message', async ({ page }) => {
  const calls = await mockGemini(page, (c: GeminiCall): GeminiReply => {
    if (c.stage === 'planner') return plan('Say hi')
    if (c.stage === 'executor') return { text: 'Hi.' }
    // The first answer is slow: the user speaks while it is being written.
    return c.user.includes('one more thing')
      ? { text: 'Second answer.' }
      : { text: 'First answer.', delayMs: 1500 }
  })
  await openWithKey(page)
  await send(page, 'hello')
  await expect.poll(() => calls.some((c) => c.stage === 'synthesizer')).toBe(true)

  await page.getByRole('textbox', { name: 'Message' }).fill('and one more thing')
  await page.getByRole('button', { name: 'Send to the agent' }).click()
  await expect(page.locator('.awr-queued__item')).toContainText('and one more thing')

  // The run ends without having shown it to the agent; it goes out as the next message.
  await expect(page.locator('.awr-msg--user .awr-msg__bubble')).toHaveText([
    'hello',
    'and one more thing',
  ])
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText([
    'First answer.',
    'Second answer.',
  ])
  // Nothing was injected into the first run, and nothing is left waiting.
  expect(
    calls.filter((c) => c.user.includes('NEW MESSAGE FROM THE USER')),
    'the first run never saw it mid-run',
  ).toHaveLength(0)
  await expect(page.locator('.awr-queued__item')).toHaveCount(0)
  const second = calls.find((c) => c.stage === 'planner' && c.user.includes('one more thing'))
  expect(second, 'the follow-up is a run of its own').toBeTruthy()
})

test('Stop keeps what was typed: undelivered messages are offered, not silently dropped', async ({
  page,
}) => {
  await mockGemini(page, (c: GeminiCall): GeminiReply =>
    c.stage === 'planner'
      ? plan('Say hi')
      : c.stage === 'executor'
        ? { text: 'Hi.', delayMs: 3000 }
        : { text: 'Hi there.' },
  )
  await openWithKey(page)
  await send(page, 'hello')
  await expect(page.locator('.awr-sendbtn--stop')).toBeVisible()
  await page.getByRole('textbox', { name: 'Message' }).fill('remember the budget')
  await page.getByRole('button', { name: 'Send to the agent' }).click()
  await expect(page.locator('.awr-queued__item')).toContainText('remember the budget')

  await page.locator('.awr-sendbtn--stop').click()
  const left = page.locator('.awr-queued__item--undelivered')
  await expect(left).toContainText('Not delivered (1 message)')
  await expect(left).toContainText('remember the budget')
  // Not sent behind the user's back after they pressed Stop.
  await expect(page.locator('.awr-msg--user')).toHaveCount(1)

  await left.getByRole('button', { name: 'Discard' }).click()
  await expect(page.locator('.awr-queued__item--undelivered')).toHaveCount(0)
  await expect(page.locator('.awr-msg--user')).toHaveCount(1)
})
