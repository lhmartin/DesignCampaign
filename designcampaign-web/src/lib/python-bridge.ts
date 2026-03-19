/**
 * Thin wrapper around the Electron IPC bridge to the Python sidecar.
 * Usage: `await pythonCall<MyResultType>('action_name', { ...args })`
 */

export function pythonCall<T = unknown>(action: string, args: unknown = {}): Promise<T> {
  if (!window.electronAPI?.pythonCall) {
    return Promise.reject(new Error('Python sidecar not available (not running in Electron)'))
  }
  return window.electronAPI.pythonCall(action, args) as Promise<T>
}
