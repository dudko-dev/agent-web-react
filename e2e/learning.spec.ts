import { expect, test, type Page } from '@playwright/test'
import { mockGemini, plan, type GeminiCall, type GeminiReply } from './gemini.ts'

/**
 * The agent's notebook and its web access, in a real page: the demo's real agent and real
 * provider, with only Gemini's HTTP answers scripted. What matters is what the MODEL was sent
 * (read off the recorded requests) and what the user sees and can do.
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

const LESSON = {
  name: 'image-format-jpg',
  description: 'When convert rejects the format "jpeg"',
  instructions: 'The convert tool only knows "jpg". Pass format "jpg" - never "jpeg".',
}

const decision = (): GeminiReply => ({
  text: JSON.stringify({ decision: 'continue', reason: 'ok' }),
})

test('learning: a lesson is written, listed, kept in the workspace across a reload, used by the planner - and forgotten on request', async ({
  page,
}) => {
  const calls = await mockGemini(page, (c: GeminiCall): GeminiReply => {
    if (c.stage === 'planner') return plan('Remember it')
    if (c.stage === 'executor') {
      // The first run writes the lesson down; later runs just answer.
      return c.functionResponses.length === 0 && !c.system.includes('image-format-jpg')
        ? { call: { name: 'save_skill', args: LESSON } }
        : { text: 'Noted.' }
    }
    if (c.stage === 'replanner') return decision()
    return { text: 'Done.' }
  })
  await openWithKey(page)
  await page.locator('.agentset__title').click()
  await page.getByLabel('Let the agent learn').check()
  await expect(page.getByText('The agent has not written any lessons down yet.')).toBeVisible()

  await send(page, 'remember how to convert images')
  // The transcript says what it learned...
  await expect(page.locator('.awr-activity__summary')).toContainText('learned: image-format-jpg')
  await expect(page.locator('.awr-learned')).toContainText('learned: image-format-jpg')
  // ...the notebook lists it...
  await expect(page.locator('.awr-lesson__name')).toHaveText(['image-format-jpg'])
  await expect(page.locator('.awr-lesson__when')).toHaveText(
    'When convert rejects the format "jpeg"',
  )
  // ...and it is a plain SKILL.md in the workspace, next to the user's files.
  await page.getByRole('button', { name: 'Show files' }).click()
  await expect(page.locator('.awr-filelist__path')).toContainText([
    '/skills/notes/image-format-jpg/.origin.json',
    '/skills/notes/image-format-jpg/SKILL.md',
  ])
  // The executor was told it keeps a notebook and given the tool.
  const first = calls.find((c) => c.stage === 'executor')
  expect(first?.system).toContain('You keep a notebook of lessons')

  // A reload: a brand-new agent starts with the lesson (the page kept it in IndexedDB).
  await page.reload()
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
  await page.locator('.agentset__title').click()
  await expect(page.locator('.awr-lesson__name')).toHaveText(['image-format-jpg'])

  // The planner sees it in its index, so the next run starts from it.
  await send(page, 'convert another image')
  await expect.poll(() => calls.filter((c) => c.stage === 'planner').length).toBeGreaterThan(1)
  const planner = calls.filter((c) => c.stage === 'planner').at(-1)
  expect(planner?.system).toContain('- image-format-jpg: When convert rejects the format "jpeg"')

  // Forgetting removes it from the notebook and from the workspace.
  await page.getByRole('button', { name: 'Forget: image-format-jpg' }).click()
  await expect(page.locator('.awr-lesson')).toHaveCount(0)
  await expect(
    page.locator('.awr-filelist__path').filter({ hasText: '/skills/notes/' }),
  ).toHaveCount(0)
})

test('egress: off by default; on, the model reads an allowed page and a refused one comes back as an error it can read', async ({
  page,
}) => {
  const fetched: string[] = []
  await page.route('https://en.wikipedia.org/**', async (route) => {
    fetched.push(route.request().url())
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' },
      body: 'JPEG is a lossy image format.',
    })
  })
  const calls = await mockGemini(page, (c: GeminiCall): GeminiReply => {
    if (c.stage === 'planner') return plan('Look it up')
    if (c.stage === 'executor') {
      const n = c.functionResponses.length
      if (n === 0)
        return { call: { name: 'web_fetch', args: { url: 'https://en.wikipedia.org/wiki/JPEG' } } }
      if (n === 1) {
        return {
          call: { name: 'web_fetch', args: { url: 'https://169.254.169.254/latest/meta-data/' } },
        }
      }
      return { text: 'Read one page; the other was refused.' }
    }
    if (c.stage === 'replanner') return decision()
    return { text: 'Done.' }
  })
  await openWithKey(page)

  // Off: the model is not even offered the tool, and no page was asked for.
  await send(page, 'look up jpeg')
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble')).toHaveText('Done.')
  expect(fetched).toHaveLength(0)
  const offered = calls.filter((c) => c.stage === 'executor').flatMap((c) => c.tools)
  expect(offered).not.toContain('web_fetch')

  // On, limited to the listed hosts.
  await page.locator('.agentset__title').click()
  await page.getByLabel('Let it read the web').check()
  await expect(page.getByLabel('Allowed hosts')).toHaveValue('en.wikipedia.org, api.github.com')
  const before = calls.length
  await send(page, 'look up jpeg again')
  await expect(page.locator('.awr-msg--assistant .awr-msg__bubble').last()).toHaveText('Done.')
  await expect(page.locator('.awr-msg--assistant .awr-activity__summary').last()).toContainText(
    '2 web requests',
  )

  // The allowed page was read; the metadata address never left the page.
  expect(fetched).toEqual(['https://en.wikipedia.org/wiki/JPEG'])
  const rows = page.locator('.awr-msg--assistant').last().locator('.awr-fetch')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('https://en.wikipedia.org/wiki/JPEG')
  await expect(rows.first()).toContainText('200')
  await expect(rows.last()).toContainText('https://169.254.169.254/latest/meta-data/')
  await expect(rows.last()).toContainText('refused:')
  // The model got the refusal as a tool result it can act on.
  const after = calls.slice(before).filter((c) => c.stage === 'executor')
  expect(JSON.stringify(after.at(-1)?.functionResponses)).toMatch(/allow list|non-public/)
})
