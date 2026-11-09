import { useEffect, useMemo, useState } from 'react'
import type { BrowserAgentConfig, Skill, ToolApprovalMode } from '@dudko.dev/agent-web'
import { BUILTIN_SKILLS, SKILL_TABS } from './skills'

export type View = 'notes' | 'mcp' | 'chess'

/** 'off' leaves the provider default (a local Qwen3 thinks); 'none' turns it off. */
export type ThinkingChoice = 'off' | 'none' | 'low' | 'medium' | 'high'
export type AnalystMode = 'off' | 'worker' | 'in-process'

/** Everything the "Agent settings" panel controls, shared by every tab. */
export interface DemoSettings {
  approvalMode: ToolApprovalMode
  thinking: ThinkingChoice
  showThoughts: boolean
  /** Run budget (input + output tokens); 0 = unlimited. */
  maxTotalTokens: number
  /** Tool calls per run; 0 = unlimited. */
  maxToolCalls: number
  /** Executed steps per run. */
  maxIterations: number
  /** Tool-calling rounds inside one step. */
  maxStepsPerTask: number
  autoCompact: boolean
  /**
   * Fewer model calls per turn: no replanning and no separate final answer —
   * the step's own reply is the answer (2 calls instead of 3+).
   */
  fastAnswers: boolean
  /** The window compaction works with; 0 = the model's own (auto). */
  contextWindowTokens: number
  /** Names of enabled skills (built-in and custom). */
  enabledSkills: string[]
  customSkills: Skill[]
  /** Chess: consult analyst subagents before moving. */
  analysts: AnalystMode
  /** The agent writes lessons down as skills of its own (kept in the workspace, per tab). */
  learning: boolean
  /** The model may read the web (`web_fetch`), only the hosts below. */
  egress: boolean
  /** Comma-separated hosts (`host`, `*.sub.host`) `web_fetch` may reach; empty = any public https host. */
  egressAllow: string
  // ── chat UI (props of <AgentChat>) ──
  showToolCalls: boolean
  showUsage: boolean
  /** Saved chats in IndexedDB + the sidebar. */
  history: boolean
  /** The workspace (virtual file system) panel. */
  filesPanel: boolean
  theme: 'auto' | 'light' | 'dark'
  lang: 'en' | 'ru'
}

export const DEFAULT_SETTINGS: DemoSettings = {
  approvalMode: 'autopilot',
  thinking: 'off',
  showThoughts: true,
  maxTotalTokens: 0,
  maxToolCalls: 0,
  maxIterations: 6,
  maxStepsPerTask: 4,
  autoCompact: true,
  fastAnswers: false,
  contextWindowTokens: 0,
  enabledSkills: BUILTIN_SKILLS.map((s) => s.name),
  customSkills: [],
  analysts: 'off',
  learning: false,
  egress: false,
  egressAllow: 'en.wikipedia.org, api.github.com',
  showToolCalls: true,
  showUsage: true,
  history: true,
  filesPanel: true,
  theme: 'auto',
  lang: 'en',
}

const KEY = 'agent-web-demo:settings'

const load = (): DemoSettings => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DemoSettings>) }
  } catch {
    /* private mode */
  }
  return DEFAULT_SETTINGS
}

/** The settings, persisted in localStorage. */
export const useDemoSettings = () => {
  const [settings, setSettings] = useState<DemoSettings>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* private mode */
    }
  }, [settings])
  const update = (patch: Partial<DemoSettings>) => setSettings((s) => ({ ...s, ...patch }))
  return { settings, update, reset: () => setSettings(DEFAULT_SETTINGS) }
}

/** All skills the user can toggle: built-in examples + their own. */
export const allSkills = (s: DemoSettings): Skill[] => [...BUILTIN_SKILLS, ...s.customSkills]

/** "a.com, *.b.com" -> ['a.com', '*.b.com']. */
export const parseHosts = (text: string): string[] =>
  text
    .split(/[\s,;]+/)
    .map((h) => h.trim())
    .filter(Boolean)

/** The skills that make sense on a tab: its built-ins plus every custom skill. */
export const skillsOfView = (s: DemoSettings, view: View): Skill[] =>
  allSkills(s).filter((k) => !SKILL_TABS[k.name] || SKILL_TABS[k.name].includes(view))

/** The enabled skills an agent on this tab gets. */
export const enabledSkillsFor = (s: DemoSettings, view: View): Skill[] =>
  skillsOfView(s, view).filter((k) => s.enabledSkills.includes(k.name))

/**
 * The part of BrowserAgentConfig the settings decide. `rebuildKey` changes when
 * a setting that is baked in at createAgent changes (the consent mode is NOT
 * in it — the hook applies that one live, mid-run even).
 */
/** The model's window when it is known (local models: the one they are loaded with). */
export const DEFAULT_WINDOW = 128_000

export const useSettingsConfig = (s: DemoSettings, modelWindow: number | undefined) => {
  // Auto = the model's window; the agent never goes above a local model's anyway.
  const window = s.contextWindowTokens || modelWindow || DEFAULT_WINDOW
  const baked = {
    thinking: s.thinking,
    maxTotalTokens: s.maxTotalTokens,
    maxToolCalls: s.maxToolCalls,
    maxIterations: s.maxIterations,
    maxStepsPerTask: s.maxStepsPerTask,
    autoCompact: s.autoCompact,
    fastAnswers: s.fastAnswers,
    contextWindowTokens: window,
    learning: s.learning,
    egress: s.egress,
    egressAllow: s.egressAllow,
  }
  const rebuildKey = JSON.stringify(baked)
  const config = useMemo<Partial<BrowserAgentConfig>>(
    () => ({
      thinking: s.thinking === 'off' ? undefined : s.thinking,
      limits: s.maxTotalTokens > 0 ? { maxTotalTokens: s.maxTotalTokens } : undefined,
      maxToolCalls: s.maxToolCalls > 0 ? s.maxToolCalls : undefined,
      maxIterations: s.maxIterations,
      maxStepsPerTask: s.maxStepsPerTask,
      compaction: {
        auto: s.autoCompact,
        contextWindowTokens: window,
        // No threshold of its own: the core compacts at 85% of the window, judged on the whole
        // context (the fixed prompt, tool definitions and skills included). Use /compact or the
        // context meter's button to see it sooner.
        keepRecentTurns: 4,
      },
      // Fast answers: the executor's reply is the answer — no synthesizer call,
      // no replanner call (the planner and the step remain).
      ...(s.fastAnswers ? { synthesize: false, replan: false } : {}),
      // Web access: only the listed hosts (empty list = any public https host). A browser can
      // not pin DNS, so the list is the real protection - see the egress docs.
      ...(s.egress ? { egress: { allow: parseHosts(s.egressAllow) } } : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rebuildKey],
  )
  return { config, rebuildKey }
}
