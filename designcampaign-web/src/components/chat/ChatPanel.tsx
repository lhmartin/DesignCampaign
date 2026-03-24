import { useEffect, useRef, useState } from 'react'
import { Send, Trash2, Wrench, ChevronDown, ChevronRight, KeyRound } from 'lucide-react'
import type Anthropic from '@anthropic-ai/sdk'
import { useClaudeStore, type ToolCallDisplay } from '@/stores/claude-store'
import { claudeKeyStatus, claudeSetKey, claudeChat } from '@/lib/claude-bridge'
import { TOOLS, buildSystemPrompt } from '@/lib/claude-tools'
import { executeTool } from '@/lib/claude-tool-executor'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert display messages back to Anthropic API message params.
 * Assistant messages with tool calls expand into two API messages:
 *   1. { role:'assistant', content: [text?, ...tool_use blocks] }
 *   2. { role:'user',      content: [...tool_result blocks] }
 * This preserves the full agentic context across multi-turn conversations.
 */
function toApiMessages(messages: ReturnType<typeof useClaudeStore.getState>['messages']): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text || '' })
      continue
    }
    // Assistant message
    const hasCalls = (m.toolCalls ?? []).length > 0
    if (!hasCalls) {
      out.push({ role: 'assistant', content: m.text || '…' })
      continue
    }
    // Build mixed content block: optional text + tool_use blocks
    const content: Anthropic.ContentBlockParam[] = []
    if (m.text) content.push({ type: 'text', text: m.text })
    for (const tc of m.toolCalls ?? []) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input as Record<string, unknown> })
    }
    out.push({ role: 'assistant', content })
    // Follow with tool results as a user message
    out.push({
      role: 'user',
      content: (m.toolCalls ?? []).map(tc => ({
        type: 'tool_result' as const,
        tool_use_id: tc.id,
        content: JSON.stringify(tc.result ?? null),
      })),
    })
  }
  return out
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolCallPill({ call }: { call: ToolCallDisplay }) {
  const [open, setOpen] = useState(false)
  const hasResult = call.result !== undefined

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      margin: '4px 0',
      borderRadius: 6,
      border: '1px solid var(--color-border)',
      background: 'var(--color-background)',
      fontSize: 10,
      overflow: 'hidden',
      maxWidth: '100%',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        }}
      >
        <Wrench size={10} />
        <span style={{ color: 'var(--color-accent)' }}>{call.name}</span>
        {hasResult ? (open ? <ChevronDown size={10} /> : <ChevronRight size={10} />) : (
          <span style={{ opacity: 0.5 }}>running…</span>
        )}
      </button>
      {open && (
        <div style={{ padding: '0 8px 6px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ opacity: 0.7, marginBottom: 2 }}>input</div>
          <pre style={{ margin: 0, fontSize: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(call.input, null, 2)}
          </pre>
          {hasResult && (
            <>
              <div style={{ opacity: 0.7, marginTop: 4, marginBottom: 2 }}>result</div>
              <pre style={{ margin: 0, fontSize: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(call.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: ReturnType<typeof useClaudeStore.getState>['messages'][0] }) {
  const isUser = msg.role === 'user'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 8,
      padding: '0 8px',
    }}>
      <div style={{
        maxWidth: '85%',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}>
        {/* Tool call pills (assistant only) */}
        {(msg.toolCalls ?? []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
            {(msg.toolCalls ?? []).map(tc => <ToolCallPill key={tc.id} call={tc} />)}
          </div>
        )}
        {/* Message text */}
        {msg.text && (
          <div style={{
            padding: '6px 10px',
            borderRadius: isUser ? '10px 10px 2px 10px' : '2px 10px 10px 10px',
            background: isUser ? 'var(--color-accent)' : 'var(--color-secondary-bg)',
            border: isUser ? 'none' : '1px solid var(--color-border)',
            color: isUser ? '#fff' : 'var(--color-text)',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChatPanel() {
  const { messages, thinking, keyConfigured, setKeyConfigured, clearHistory,
    addUserMessage, startAssistantMessage, appendToMessage, addToolCall,
    updateToolCallResult, setThinking } = useClaudeStore()

  const [input, setInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Check key status on mount
  useEffect(() => {
    claudeKeyStatus().then(({ configured }) => setKeyConfigured(configured))
  }, [setKeyConfigured])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  async function handleSaveKey() {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    try {
      await claudeSetKey(apiKeyInput.trim())
      setApiKeyInput('')
      setKeyConfigured(true)
    } finally {
      setSavingKey(false)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')

    addUserMessage(text)
    setThinking(true)

    // Build API messages from full history (includes the just-added user message)
    const apiMessages: Anthropic.MessageParam[] = toApiMessages(useClaudeStore.getState().messages)  // mutated via push in loop
    // Snapshot the system prompt once — it's constant for this turn
    const system = buildSystemPrompt()
    const assistantMsgId = startAssistantMessage()

    try {
      while (true) {
        const response = await claudeChat(apiMessages, system, TOOLS) as Anthropic.Message

        // Extract text and tool_use blocks
        const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
        const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

        // Append text to the assistant message
        for (const tb of textBlocks) {
          appendToMessage(assistantMsgId, tb.text)
        }

        if (response.stop_reason === 'end_turn' || toolBlocks.length === 0) break

        // Execute tool calls and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of toolBlocks) {
          const callDisplay: ToolCallDisplay = { id: block.id, name: block.name, input: block.input }
          addToolCall(assistantMsgId, callDisplay)

          const result = await executeTool(block.name, block.input)
          updateToolCallResult(assistantMsgId, block.id, result)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }

        // Continue conversation with tool results
        apiMessages.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        )
      }
    } catch (err) {
      appendToMessage(assistantMsgId, `\n\n*Error: ${err instanceof Error ? err.message : String(err)}*`)
    } finally {
      setThinking(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}>
          CLAUDE
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {keyConfigured && (
            <button
              onClick={() => setKeyConfigured(false)}
              title="Change API key"
              style={{ padding: '2px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            >
              <KeyRound size={11} />
            </button>
          )}
          <button
            onClick={clearHistory}
            disabled={messages.length === 0}
            title="Clear history"
            style={{ padding: '2px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)', opacity: messages.length === 0 ? 0.4 : 1 }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {messages.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 8,
            padding: 16,
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 24 }}>✦</span>
            <span style={{ fontSize: 11 }}>Ask about your structures,<br />apply filters, or configure ranking.</span>
          </div>
        )}
        {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
        {thinking && (
          <div style={{ padding: '0 16px', color: 'var(--color-text-secondary)', fontSize: 11, fontStyle: 'italic' }}>
            thinking…
          </div>
        )}
      </div>

      {/* Input area */}
      {!keyConfigured ? (
        <div style={{
          padding: 10,
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Anthropic API key</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
              placeholder="sk-ant-…"
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSaveKey}
              disabled={savingKey || !apiKeyInput.trim()}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 11,
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                opacity: savingKey || !apiKeyInput.trim() ? 0.5 : 1,
              }}
            >
              {savingKey ? '…' : 'Save'}
            </button>
          </div>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', opacity: 0.7 }}>
            Stored encrypted on this device. Never sent anywhere except Anthropic.
          </span>
        </div>
      ) : (
        <div style={{
          padding: 8,
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: 6,
          alignItems: 'flex-end',
          flexShrink: 0,
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (Enter to send)"
            rows={2}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 12,
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: 'var(--color-background)',
              color: 'var(--color-text)',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.4,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            title="Send (Enter)"
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              opacity: !input.trim() || thinking ? 0.4 : 1,
              flexShrink: 0,
            }}
          >
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
