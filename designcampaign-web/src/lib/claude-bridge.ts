export function claudeSetKey(apiKey: string) {
  return window.electronAPI.claudeSetKey(apiKey)
}

export function claudeKeyStatus() {
  return window.electronAPI.claudeKeyStatus()
}

export function claudeChat(messages: unknown, system: string, tools: unknown) {
  return window.electronAPI.claudeChat(messages, system, tools)
}
