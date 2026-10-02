import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatHistoryStore,
  chatTitle,
  newChatId,
  type ChatRecord,
  type ChatSummary,
} from '../chat-history.js'
import type { UseAgentReturn } from './use-agent.js'

export interface UseChatHistoryOptions {
  /** Where chats are saved (default: a ChatHistoryStore on IndexedDB). */
  store?: ChatHistoryStore
  /** Switch the hook off (keeps hook order stable in components). Default true. */
  enabled?: boolean
  /** Open the most recent chat on mount (default true). */
  resumeLatest?: boolean
}

export interface UseChatHistoryReturn {
  chats: ChatSummary[]
  /** The open conversation (the agent's memory session). */
  currentId: string
  loading: boolean
  /** Open a saved conversation. */
  select: (id: string) => Promise<void>
  /** Start an empty conversation. */
  newChat: () => void
  /** Delete a conversation (and start a new one if it was open). */
  remove: (id: string) => Promise<void>
}

/**
 * Persist an agent's conversations — the transcript with its tool calls, usage
 * and image attachments — and switch between them. Each chat id is also the
 * agent's memory session, so with a persistent `memory` (IndexedDBStore) a
 * reopened chat continues with the model's context intact.
 */
export const useChatHistory = (
  agent: UseAgentReturn,
  options: UseChatHistoryOptions = {},
): UseChatHistoryReturn => {
  const enabled = options.enabled !== false
  const store = useMemo(() => options.store ?? new ChatHistoryStore(), [options.store])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [loading, setLoading] = useState(enabled)
  const createdRef = useRef(new Map<string, number>())
  const agentRef = useRef(agent)
  agentRef.current = agent

  const refresh = useCallback(async () => {
    try {
      setChats(await store.list())
    } catch {
      /* storage unavailable: history simply stays empty */
    }
  }, [store])

  const newChat = useCallback(() => {
    agentRef.current.loadChat({ sessionId: newChatId(), messages: [] })
  }, [])

  const select = useCallback(
    async (id: string) => {
      const record = await store.get(id).catch(() => undefined)
      if (!record) return
      createdRef.current.set(id, record.createdAt)
      agentRef.current.loadChat({
        sessionId: record.id,
        messages: record.messages,
        totalUsage: record.totalUsage,
      })
    },
    [store],
  )

  const remove = useCallback(
    async (id: string) => {
      await store.delete(id).catch(() => {})
      if (id === agentRef.current.sessionId) newChat()
      await refresh()
    },
    [store, newChat, refresh],
  )

  // On mount: open the latest chat, or start a fresh one.
  useEffect(() => {
    if (!enabled) return
    let active = true
    void (async () => {
      const list = await store.list().catch(() => [] as ChatSummary[])
      if (!active) return
      setChats(list)
      if (options.resumeLatest !== false && list[0]) await select(list[0].id)
      else newChat()
      setLoading(false)
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, store])

  // Save the open chat whenever its transcript settles (not on every streamed token).
  const { messages, totalUsage, sessionId, isRunning } = agent
  useEffect(() => {
    if (!enabled || loading || isRunning || messages.length === 0) return
    const now = Date.now()
    const createdAt = createdRef.current.get(sessionId) ?? now
    createdRef.current.set(sessionId, createdAt)
    const record: ChatRecord = {
      id: sessionId,
      title: chatTitle(messages),
      createdAt,
      updatedAt: now,
      messages,
      totalUsage,
    }
    void store
      .put(record)
      .then(refresh)
      .catch(() => {})
  }, [enabled, loading, isRunning, messages, totalUsage, sessionId, store, refresh])

  return { chats, currentId: sessionId, loading, select, newChat, remove }
}
