import { useState } from 'react'
import {
  ApprovalModeSwitch,
  loadSkillFromUrl,
  parseSkillMarkdown,
} from '@dudko.dev/agent-web-react'
import { allSkills, type DemoSettings, type ThinkingChoice } from '../settings'
import { BUILTIN_SKILLS, SKILL_TEMPLATE } from '../skills'

export interface AgentSettingsPanelProps {
  settings: DemoSettings
  update: (patch: Partial<DemoSettings>) => void
  onReset: () => void
}

const TOKEN_BUDGETS = [0, 20_000, 50_000, 100_000, 250_000]
const TOOL_CALL_CAPS = [0, 5, 10, 25, 50]
const WINDOWS = [8_000, 32_000, 128_000, 1_000_000]
const k = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}k`)

/**
 * Everything the agent loop exposes, as settings: tool consent (the autopilot
 * switch), thinking, run limits, context compaction and skills. Shared by all
 * three tabs.
 */
export const AgentSettingsPanel = ({ settings, update, onReset }: AgentSettingsPanelProps) => {
  const [draft, setDraft] = useState('')
  const [skillUrl, setSkillUrl] = useState('')
  const [skillError, setSkillError] = useState<string | undefined>()
  const builtin = new Set(BUILTIN_SKILLS.map((s) => s.name))

  const toggleSkill = (name: string, on: boolean) =>
    update({
      enabledSkills: on
        ? [...settings.enabledSkills, name]
        : settings.enabledSkills.filter((n) => n !== name),
    })

  const addSkill = (skill: ReturnType<typeof parseSkillMarkdown>) => {
    if (allSkills(settings).some((s) => s.name === skill.name)) {
      throw new Error(`a skill named "${skill.name}" already exists`)
    }
    update({
      customSkills: [...settings.customSkills, skill],
      enabledSkills: [...settings.enabledSkills, skill.name],
    })
  }

  const addFromDraft = () => {
    try {
      addSkill(parseSkillMarkdown(draft))
      setDraft('')
      setSkillError(undefined)
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : String(err))
    }
  }

  const addFromUrl = async () => {
    try {
      addSkill(await loadSkillFromUrl(skillUrl.trim()))
      setSkillUrl('')
      setSkillError(undefined)
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <details className="agentset">
      <summary className="agentset__title">
        Agent settings{' '}
        <span className="agentset__peek">
          {settings.approvalMode === 'autopilot' ? 'autopilot' : settings.approvalMode} · thinking{' '}
          {settings.thinking} · {settings.enabledSkills.length} skill(s)
        </span>
      </summary>

      <div className="agentset__group">
        <span className="settings__label">Tool consent</span>
        <ApprovalModeSwitch
          mode={settings.approvalMode}
          onChange={(approvalMode) => update({ approvalMode })}
        />
        <p className="settings__note">
          {settings.approvalMode === 'autopilot'
            ? 'Autopilot: the agent runs every tool on its own.'
            : settings.approvalMode === 'ask-writes'
              ? 'Read-only tools run freely; you approve anything that changes state (a note, a chess move, a write to your MCP server).'
              : settings.approvalMode === 'ask-all'
                ? 'You approve every single tool call.'
                : 'Read-only: changes are refused without asking — the agent can only look.'}{' '}
          Switches apply instantly, even mid-run.
        </p>
      </div>

      <div className="agentset__grid">
        <label className="settings__field">
          <span className="settings__label">Thinking</span>
          <select
            className="settings__select"
            value={settings.thinking}
            onChange={(e) => update({ thinking: e.target.value as ThinkingChoice })}
          >
            <option value="off">default</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="settings__field">
          <span className="settings__label">Tokens / run</span>
          <select
            className="settings__select"
            value={settings.maxTotalTokens}
            onChange={(e) => update({ maxTotalTokens: Number(e.target.value) })}
          >
            {TOKEN_BUDGETS.map((n) => (
              <option key={n} value={n}>
                {n ? k(n) : 'unlimited'}
              </option>
            ))}
          </select>
        </label>
        <label className="settings__field">
          <span className="settings__label">Tool calls / run</span>
          <select
            className="settings__select"
            value={settings.maxToolCalls}
            onChange={(e) => update({ maxToolCalls: Number(e.target.value) })}
          >
            {TOOL_CALL_CAPS.map((n) => (
              <option key={n} value={n}>
                {n || 'unlimited'}
              </option>
            ))}
          </select>
        </label>
        <label className="settings__field">
          <span className="settings__label">Steps / run</span>
          <input
            className="settings__select"
            type="number"
            min={1}
            max={20}
            value={settings.maxIterations}
            onChange={(e) => update({ maxIterations: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="settings__field">
          <span className="settings__label">Rounds / step</span>
          <input
            className="settings__select"
            type="number"
            min={1}
            max={12}
            value={settings.maxStepsPerTask}
            onChange={(e) => update({ maxStepsPerTask: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="settings__field">
          <span className="settings__label">Window</span>
          <select
            className="settings__select"
            value={settings.contextWindowTokens}
            onChange={(e) => update({ contextWindowTokens: Number(e.target.value) })}
          >
            {WINDOWS.map((n) => (
              <option key={n} value={n}>
                {k(n)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="agentset__checks">
        <label>
          <input
            type="checkbox"
            checked={settings.showThoughts}
            onChange={(e) => update({ showThoughts: e.target.checked })}
          />{' '}
          Show thoughts
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.autoCompact}
            onChange={(e) => update({ autoCompact: e.target.checked })}
          />{' '}
          Auto-compact the conversation
        </label>
      </div>

      <div className="agentset__group">
        <span className="settings__label">Chat UI — every part is a prop</span>
        <div className="agentset__checks">
          {(
            [
              ['showToolCalls', 'Tool calls'],
              ['showUsage', 'Token usage'],
              ['history', 'Saved chats (IndexedDB)'],
              ['filesPanel', 'Files panel'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
              />{' '}
              {label}
            </label>
          ))}
        </div>
        <div className="agentset__grid">
          <label className="settings__field">
            <span className="settings__label">Theme</span>
            <select
              className="settings__select"
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as DemoSettings['theme'] })}
            >
              <option value="auto">auto</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <label className="settings__field">
            <span className="settings__label">Labels</span>
            <select
              className="settings__select"
              value={settings.lang}
              onChange={(e) => update({ lang: e.target.value as DemoSettings['lang'] })}
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </label>
        </div>
      </div>

      <div className="agentset__group">
        <span className="settings__label">Skills</span>
        <ul className="agentset__skills">
          {allSkills(settings).map((s) => (
            <li key={s.name}>
              <label title={s.content}>
                <input
                  type="checkbox"
                  checked={settings.enabledSkills.includes(s.name)}
                  onChange={(e) => toggleSkill(s.name, e.target.checked)}
                />{' '}
                <code>{s.name}</code> — {s.description}
              </label>
              {!builtin.has(s.name) && (
                <button
                  type="button"
                  className="mcp__btn-ghost"
                  onClick={() =>
                    update({
                      customSkills: settings.customSkills.filter((c) => c.name !== s.name),
                      enabledSkills: settings.enabledSkills.filter((n) => n !== s.name),
                    })
                  }
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <details className="agentset__add">
          <summary>Add a skill (SKILL.md)</summary>
          <textarea
            className="agentset__textarea"
            rows={7}
            placeholder={SKILL_TEMPLATE}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mcp__actions">
            <button
              type="button"
              className="settings__btn"
              onClick={addFromDraft}
              disabled={!draft.trim()}
            >
              Add
            </button>
            <button
              type="button"
              className="mcp__btn-ghost"
              onClick={() => setDraft(SKILL_TEMPLATE)}
            >
              Insert template
            </button>
          </div>
          <div className="mcp__form-row">
            <input
              className="mcp__input mcp__grow"
              type="url"
              placeholder="…or import https://…/SKILL.md"
              value={skillUrl}
              onChange={(e) => setSkillUrl(e.target.value)}
            />
            <button
              type="button"
              className="settings__btn"
              onClick={() => void addFromUrl()}
              disabled={!skillUrl.trim()}
            >
              Import
            </button>
          </div>
        </details>
        {skillError && <p className="settings__warn">{skillError}</p>}
      </div>

      <button type="button" className="mcp__btn-ghost" onClick={onReset}>
        Reset settings
      </button>
    </details>
  )
}
