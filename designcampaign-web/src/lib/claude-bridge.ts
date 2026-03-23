export function claudeSetKey(apiKey: string): Promise<{ ok: boolean }> {
  if (!window.electronAPI?.claudeSetKey) return Promise.reject(new Error('Not running in Electron'))
  return window.electronAPI.claudeSetKey(apiKey)
}

export function claudeKeyStatus(): Promise<{ configured: boolean }> {
  if (!window.electronAPI?.claudeKeyStatus) return Promise.resolve({ configured: false })
  return window.electronAPI.claudeKeyStatus()
}

export function claudeChat(messages: unknown, system: string, tools: unknown): Promise<unknown> {
  if (!window.electronAPI?.claudeChat) return Promise.reject(new Error('Not running in Electron'))
  return window.electronAPI.claudeChat(messages, system, tools)
}
