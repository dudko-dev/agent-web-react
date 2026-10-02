import type { IUsage } from '@dudko.dev/agent-web'
import type { ChatMessage } from './types.js'

/**
 * Saved conversations — the transcript a chat UI shows (messages with their
 * tool calls, usage and image attachments), one record per conversation. The
 * agent's own memory (what the MODEL sees) lives in the core's ContextStore
 * under the same id; keep both and a reloaded chat continues where it was.
 */
export interface ChatRecord {
  /** Also the agent's memory session id. */
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  totalUsage?: IUsage
}

/** A list entry (no messages). */
export type ChatSummary = Omit<ChatRecord, 'messages'> & { messageCount: number }

export interface ChatHistoryStoreOptions {
  /** IndexedDB database (default 'agent-web-react'). */
  dbName?: string
  /** Object store (default 'chats'). */
  storeName?: string
  /** Keep chats in memory only (tests, private mode; also the fallback without IndexedDB). */
  memory?: boolean
}

const DB_VERSION = 1

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

/** IndexedDB-backed chat history (raw IndexedDB — no extra dependency). */
export class ChatHistoryStore {
  private readonly dbName: string
  private readonly storeName: string
  private readonly memory?: Map<string, ChatRecord>
  private db?: Promise<IDBDatabase>

  constructor(opts: ChatHistoryStoreOptions = {}) {
    this.dbName = opts.dbName ?? 'agent-web-react'
    this.storeName = opts.storeName ?? 'chats'
    if (opts.memory || typeof indexedDB === 'undefined') this.memory = new Map()
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(this.dbName, DB_VERSION)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(this.storeName)) {
          r.result.createObjectStore(this.storeName, { keyPath: 'id' })
        }
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    }).catch((err: unknown) => {
      this.db = undefined
      throw err
    })
    return this.db
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open()
    return db.transaction(this.storeName, mode).objectStore(this.storeName)
  }

  async list(): Promise<ChatSummary[]> {
    const all = this.memory
      ? [...this.memory.values()]
      : await req((await this.tx('readonly')).getAll() as IDBRequest<ChatRecord[]>)
    return all
      .map(({ messages, ...rest }) => ({ ...rest, messageCount: messages.length }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<ChatRecord | undefined> {
    if (this.memory) return this.memory.get(id)
    return req((await this.tx('readonly')).get(id) as IDBRequest<ChatRecord | undefined>)
  }

  async put(record: ChatRecord): Promise<void> {
    if (this.memory) {
      this.memory.set(record.id, structuredClone(record))
      return
    }
    await req((await this.tx('readwrite')).put(record))
  }

  async delete(id: string): Promise<void> {
    if (this.memory) {
      this.memory.delete(id)
      return
    }
    await req((await this.tx('readwrite')).delete(id))
  }

  async clear(): Promise<void> {
    if (this.memory) {
      this.memory.clear()
      return
    }
    await req((await this.tx('readwrite')).clear())
  }
}

/** A chat's title: its first user message, trimmed. */
export const chatTitle = (messages: ChatMessage[]): string => {
  const first = messages
    .find((m) => m.role === 'user')
    ?.content.replace(/\s+/g, ' ')
    .trim()
  if (!first) return 'New chat'
  return first.length > 60 ? `${first.slice(0, 59)}…` : first
}

/** A fresh, sortable conversation id (also a valid memory session id). */
export const newChatId = (): string =>
  `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
