/** Utilities for virtual cloud:// paths used by cloud storage connections. */

export function isCloudPath(path: string): boolean {
  return path.startsWith('cloud://')
}

export interface CloudPath {
  provider: 'azure' | 'gcs'
  connectionId: string
  blobName: string
}

/**
 * Parse a virtual cloud path into its components.
 * Format: cloud://<provider>/<connectionId>/<blobName>
 * Example: cloud://azure/conn_abc123/batch01/protein_001.pdb
 */
export function parseCloudPath(path: string): CloudPath {
  // strip "cloud://"
  const withoutScheme = path.slice('cloud://'.length)
  const firstSlash = withoutScheme.indexOf('/')
  const secondSlash = withoutScheme.indexOf('/', firstSlash + 1)
  // secondSlash === -1 when path is a connection folder (no blobName segment)
  return {
    provider: withoutScheme.slice(0, firstSlash) as 'azure' | 'gcs',
    connectionId: secondSlash === -1
      ? withoutScheme.slice(firstSlash + 1)
      : withoutScheme.slice(firstSlash + 1, secondSlash),
    blobName: secondSlash === -1 ? '' : withoutScheme.slice(secondSlash + 1),
  }
}

export function buildCloudPath(provider: string, connectionId: string, blobName: string): string {
  return `cloud://${provider}/${connectionId}/${blobName}`
}
