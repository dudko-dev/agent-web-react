import { expect, test, type Page } from '@playwright/test'
import { mockGemini, plan, type GeminiCall, type GeminiReply } from './gemini.ts'

/**
 * The agent end to end in a real page: the demo's real agent, real provider
 * (`@ai-sdk/google`), real IndexedDB — only Gemini's HTTP answers are scripted.
 */

// A 2×2 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQAk9QL/lnh3ewAAAABJRU5ErkJggg==',
  'base64',
)

/** Open the demo with a (fake) Gemini key saved, on the given tab. */
const openWithKey = async (page: Page, tab?: string) => {
  await page.goto('/')
  await page.getByPlaceholder('AIza…').fill('AIza-test-key')
  await page.getByRole('button', { name: 'Save' }).click()
  if (tab) await page.getByRole('tab', { name: tab }).click()
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
}

const send = async (page: Page, text: string) => {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

/** Plan one step, call `tool` once, then answer. */
const oneToolCall =
  (tool: string, args: Record<string, unknown>, answer: string) =>
  (c: GeminiCall): GeminiReply => {
    if (c.stage === 'planner') return plan('Do it')
    if (c.stage === 'executor') {
      return c.functionResponses.length === 0 ? { call: { name: tool, args } } : { text: 'Done.' }
    }
    return { text: answer }
  }

test('a run shows each tool call, tokens by kind, and is saved as a chat', async ({ page }) => {
  await mockGemini(page, oneToolCall('add_note', { text: 'hi there' }, 'Added a note saying hi.'))
  await openWithKey(page)
  await send(page, 'Add a note saying hi')

  const answer = page.locator('.awr-msg--assistant').last()
  await expect(answer.locator('.awr-msg__bubble')).toHaveText('Added a note saying hi.')
  await expect(answer.locator('.awr-activity__summary')).toHaveText('1 step · 1 tool call')
  await answer.locator('.awr-activity__summary').click()
  await expect(answer.locator('.awr-tool__name')).toHaveText('add_note')
  await expect(answer.locator('.awr-tool__cost')).toContainText('ms')
  // Tokens by kind for the answer: input, output, thinking, cache hits.
  await expect(answer.locator('.awr-msg__usage')).toContainText(
    /in .+ · out .+ · think .+ · cached/,
  )
  // The tool really ran.
  await expect(page.locator('.board').getByText('hi there')).toBeVisible()

  // Saved: the chat list has it (the sidebar overlays a narrow panel, so it
  // starts closed), and a reload brings the transcript back.
  await page.getByRole('button', { name: 'Show chats' }).click()
  await expect(page.locator('.awr-history__title')).toHaveText(['Add a note saying hi'])
  await page.reload()
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText(
    'Added a note saying hi.',
  )
  await page.getByRole('button', { name: 'Show chats' }).click()
  await page.getByRole('button', { name: 'New chat' }).click()
  await expect(page.locator('.awr-msg')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show chats' }).click()
  await expect(page.locator('.awr-history__item')).toHaveCount(1)
})

test('an attached image is shown in the chat, sent to the model and saved in the workspace', async ({
  page,
}) => {
  const calls = await mockGemini(page, (c) =>
    c.stage === 'planner' ? plan('Describe the picture') : { text: 'A tiny gray square.' },
  )
  await openWithKey(page)
  await page
    .locator('.awr-composer2 input[type=file]')
    .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.awr-files .awr-file__thumb')).toBeVisible()
  await send(page, 'What is in the picture?')

  await expect(page.locator('.awr-msg--user .awr-thumb--msg')).toBeVisible()
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText(
    'A tiny gray square.',
  )
  expect(calls.some((c) => c.inlineData.some((d) => d.mimeType === 'image/png'))).toBe(true)

  await page.getByRole('button', { name: 'Show files' }).click()
  await expect(page.locator('.awr-filelist__path')).toContainText(['/attachments/pixel.png'])
})

test('a file dropped anywhere on the page is attached', async ({ page }) => {
  await mockGemini(page, () => ({ text: 'ok' }))
  await openWithKey(page)
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer()
    d.items.add(new File(['# Notes\n- one'], 'notes.md', { type: 'text/markdown' }))
    return d
  })
  await page.dispatchEvent('main', 'dragenter', { dataTransfer: dt })
  await expect(page.locator('.awr-dropnote')).toBeVisible()
  await page.dispatchEvent('main', 'drop', { dataTransfer: dt })
  await expect(page.locator('.awr-files .awr-file__name')).toHaveText(['notes.md'])
})

test('consent: in "Ask" mode a write tool waits for the user', async ({ page }) => {
  await mockGemini(page, oneToolCall('add_note', { text: 'needs consent' }, 'Added it.'))
  await openWithKey(page)
  await page.getByRole('button', { name: /^Tool consent: / }).click()
  await page.getByRole('menuitemradio', { name: /^Ask Run read-only/ }).click()
  await expect(page.getByRole('button', { name: 'Tool consent: Ask' })).toBeVisible()

  await send(page, 'Add a note')
  await expect(page.locator('.awr-approval')).toContainText('add_note')
  await page.getByRole('button', { name: 'Allow once' }).click()
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText('Added it.')
  await expect(page.locator('.board').getByText('needs consent')).toBeVisible()
})

test('slash commands: "/" opens the palette and /read-only switches the consent mode', async ({
  page,
}) => {
  await mockGemini(page, () => ({ text: 'ok' }))
  await openWithKey(page)
  await page.getByRole('textbox', { name: 'Message' }).fill('/')
  await expect(page.getByRole('listbox', { name: 'Commands' })).toContainText('/compact')
  await page.getByRole('textbox', { name: 'Message' }).fill('/read-only')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Tool consent: Read-only' })).toBeVisible()
})

test('chess: the user’s move triggers the agent, which answers with its own', async ({ page }) => {
  const calls = await mockGemini(page, (c) => {
    if (c.stage === 'planner') return plan('Answer the move')
    if (c.stage === 'executor') {
      return c.functionResponses.length === 0
        ? { call: { name: 'make_move', args: { move: 'e5' } } }
        : { text: 'Played e5.' }
    }
    return { text: 'I answer symmetrically with e5.' }
  })
  await openWithKey(page, 'Chess vs agent')
  await page.getByRole('button', { name: 'e2 white p' }).click()
  await page.getByRole('button', { name: 'e4' }).click()

  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText(
    'I answer symmetrically with e5.',
  )
  expect(calls.some((c) => c.user.includes('White played e4'))).toBe(true)
  await expect(page.getByRole('button', { name: 'e5 black p' })).toBeVisible()
})

test('labels: every text of the chat can be swapped (Russian)', async ({ page }) => {
  await mockGemini(page, () => ({ text: 'ok' }))
  await openWithKey(page)
  await page.locator('.agentset__title').click()
  await page.getByLabel('Labels').selectOption('ru')
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Показать чаты' })).toBeVisible()
})
