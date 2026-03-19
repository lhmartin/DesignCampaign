import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UniProtEntry {
  accession: string   // "P15692"
  id:        string   // "VEGFA_HUMAN"
  geneName:  string   // "VEGFA"
  organism:  string   // "Homo sapiens"
  length:    number   // 412
  sequence:  string   // full AA sequence
  fullName:  string   // "Vascular endothelial growth factor A"
}

// ── UniProt REST helpers ──────────────────────────────────────────────────────

const FIELDS = 'accession,id,gene_names,organism_name,protein_name,length,sequence'

function parseEntry(raw: Record<string, unknown>): UniProtEntry | null {
  try {
    const acc      = raw.primaryAccession as string
    const id       = raw.uniProtkbId as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const genes    = (raw.genes as any[]) ?? []
    const geneName = genes[0]?.geneName?.value ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const org      = (raw.organism as any)?.scientificName ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prot     = (raw.proteinDescription as any)
    const fullName = prot?.recommendedName?.fullName?.value
      ?? prot?.submissionNames?.[0]?.fullName?.value
      ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq      = (raw.sequence as any)?.value ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const len      = (raw.sequence as any)?.length ?? seq.length
    if (!acc || !seq) return null
    return { accession: acc, id, geneName, organism: org, length: len, sequence: seq, fullName }
  } catch { return null }
}

async function searchUniProt(query: string): Promise<UniProtEntry[]> {
  const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&format=json&fields=${FIELDS}&size=15`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`UniProt API error: ${res.status}`)
  const json = await res.json() as { results: Record<string, unknown>[] }
  return (json.results ?? []).flatMap(r => { const e = parseEntry(r); return e ? [e] : [] })
}

async function fetchByAccession(accession: string): Promise<UniProtEntry | null> {
  const url = `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(accession)}.json`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`UniProt API error: ${res.status}`)
  const json = await res.json() as Record<string, unknown>
  return parseEntry(json)
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

const S = {
  base: {
    fontSize: 11,
    fontFamily: 'Outfit, sans-serif',
    color: 'var(--color-text-primary)',
  } as React.CSSProperties,
  muted: { fontSize: 10, color: 'var(--color-text-secondary)' } as React.CSSProperties,
  mono:  { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UniProtPanel() {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<UniProtEntry[]>([])
  const [selected, setSelected] = useState<UniProtEntry | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      // If it looks like an accession (e.g. P12345, Q8N2W9), try direct fetch first
      const looksLikeAccession = /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9]$|^[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9][A-Z][A-Z0-9]{2}[0-9]$/i.test(trimmed)
      if (looksLikeAccession) {
        const entry = await fetchByAccession(trimmed)
        if (entry) { setResults([entry]); setSelected(entry); return }
      }
      const entries = await searchUniProt(trimmed)
      setResults(entries)
      if (entries.length === 0) setError('No results found.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCopy = async () => {
    if (!selected) return
    const fasta = `>${selected.accession}|${selected.id} ${selected.fullName} [${selected.organism}]\n${selected.sequence}`
    await navigator.clipboard.writeText(fasta)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 10, gap: 8 }}>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void doSearch(query)}
          placeholder="Search proteins or enter accession (P15692)…"
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: 'Outfit, sans-serif',
            padding: '4px 8px',
            borderRadius: 5,
            border: '1px solid var(--color-border)',
            background: 'var(--color-background)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        <button
          onClick={() => void doSearch(query)}
          disabled={loading || !query.trim()}
          style={{
            padding: '4px 12px', borderRadius: 5, fontSize: 11,
            fontFamily: 'Outfit, sans-serif', fontWeight: 600,
            border: '1px solid var(--color-border)',
            background: 'var(--color-accent)',
            color: '#0a0e1a',
            cursor: loading ? 'wait' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)', padding: '4px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          {error}
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div style={{
          flex: selected ? '0 0 auto' : 1,
          maxHeight: selected ? 160 : undefined,
          overflowY: 'auto',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          flexShrink: 0,
        }}>
          {results.map(entry => (
            <button
              key={entry.accession}
              onClick={() => setSelected(entry)}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr auto',
                width: '100%',
                padding: '6px 10px',
                gap: 8,
                textAlign: 'left',
                border: 'none',
                borderBottom: '1px solid var(--color-border)',
                background: selected?.accession === entry.accession
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (selected?.accession !== entry.accession) (e.currentTarget as HTMLElement).style.background = 'var(--color-secondary-bg)' }}
              onMouseLeave={e => { if (selected?.accession !== entry.accession) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ ...S.mono, fontSize: 10, color: 'var(--color-accent)' }}>{entry.accession}</span>
              <span style={{ ...S.base }}>
                <span style={{ fontWeight: 600 }}>{entry.id}</span>
                {entry.organism && <span style={S.muted}> · {entry.organism}</span>}
              </span>
              <span style={{ ...S.muted, ...S.mono, fontSize: 10, whiteSpace: 'nowrap' }}>{entry.length} aa</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div style={{
          flex: 1,
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}>
          <div>
            <div style={{ ...S.base, fontWeight: 700, fontSize: 13 }}>{selected.id}</div>
            {selected.fullName && <div style={S.muted}>{selected.fullName}</div>}
            <div style={{ ...S.muted, marginTop: 2 }}>
              {selected.organism} · {selected.length} aa · {selected.accession}
              {selected.geneName && ` · ${selected.geneName}`}
            </div>
          </div>

          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '6px 8px',
            wordBreak: 'break-all',
            lineHeight: 1.6,
            maxHeight: 160,
            overflowY: 'auto',
          }}>
            {selected.sequence.match(/.{1,60}/g)?.join('\n') ?? selected.sequence}
          </div>

          <button
            onClick={() => void handleCopy()}
            style={{
              alignSelf: 'flex-start',
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 10,
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              border: '1px solid var(--color-border)',
              background: copied ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent',
              color: copied ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            {copied ? '✓ Copied' : 'Copy sequence (FASTA)'}
          </button>
        </div>
      )}

    </div>
  )
}
