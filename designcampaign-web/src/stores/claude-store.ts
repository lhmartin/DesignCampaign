import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ToolCallDisplay {
  id: string
  name: string
  input: unknown
  result?: unknown
}

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallDisplay[]
}

interface ClaudeStore {
  messages: DisplayMessage[]
  thinking: boolean
  keyConfigured: boolean

  addUserMessage: (text: string) => string         // returns id
  startAssistantMessage: () => string              // returns id
  appendToMessage: (id: string, delta: string) => void
  addToolCall: (msgId: string, toolCall: ToolCallDisplay) => void
  updateToolCallResult: (msgId: string, toolId: string, result: unknown) => void
  setThinking: (v: boolean) => void
  setKeyConfigured: (v: boolean) => void
  clearHistory: () => void
}

export const useClaudeStore = create<ClaudeStore>()(
  persist(
    (set) => ({
      messages: [],
      thinking: false,
      keyConfigured: false,

      addUserMessage: (text) => {
        const id = crypto.randomUUID()
        set(s => ({ messages: [...s.messages, { id, role: 'user', text }] }))
        return id
      },

      startAssistantMessage: () => {
        const id = crypto.randomUUID()
        set(s => ({ messages: [...s.messages, { id, role: 'assistant', text: '', toolCalls: [] }] }))
        return id
      },

      appendToMessage: (id, delta) => set(s => ({
        messages: s.messages.map(m => m.id === id ? { ...m, text: m.text + delta } : m),
      })),

      addToolCall: (msgId, toolCall) => set(s => ({
        messages: s.messages.map(m =>
          m.id === msgId ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] } : m,
        ),
      })),

      updateToolCallResult: (msgId, toolId, result) => set(s => ({
        messages: s.messages.map(m =>
          m.id === msgId
            ? { ...m, toolCalls: (m.toolCalls ?? []).map(t => t.id === toolId ? { ...t, result } : t) }
            : m,
        ),
      })),

      setThinking: (v) => set({ thinking: v }),
      setKeyConfigured: (v) => set({ keyConfigured: v }),
      clearHistory: () => set({ messages: [] }),
    }),
    { name: 'dc-claude', partialize: (s) => ({ messages: s.messages.slice(-200) }) },
  ),
)
