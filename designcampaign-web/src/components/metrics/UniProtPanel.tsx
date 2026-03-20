import { useState, useCallback, useEffect, useRef } from 'react'
import { useFileStore } from '@/stores/file-store'
import { useSequenceStore } from '@/stores/sequence-store'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UniProtEntry {
  accession: string
  id:        string
  geneName:  string
  organism:  string
  length:    number
  sequence:  string
  fullName:  string
}

interface BlastHit {
  accession:   string
  description: string
  length:      number
  evalue:      number
  identity:    number   // 0–100 %
  coverage:    number   // 0–100 % query coverage
}

type BlastState =
  | { status: 'idle' }
  | { status: 'submitting'; chainId: string }
  | { status: 'polling';    chainId: string; jobId: string; elapsed: number }
  | { status: 'done';       chainId: string; hits: BlastHit[] }
  | { status: 'error';      chainId: string; message: string }

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

// ── EBI BLAST helpers ─────────────────────────────────────────────────────────

const EBI_BLAST = 'https://www.ebi.ac.uk/Tools/services/rest/ncbiblast'

async function submitBlast(seq: string, email: string): Promise<string> {
  const body = new URLSearchParams({
    email,
    program:    'blastp',
    stype:      'protein',
    sequence:   `>query\n${seq}`,
    database:   'uniprotkb_swissprot',
    scores:     '20',
    alignments: '20',
  })
  const res  = await fetch(`${EBI_BLAST}/run`, { method: 'POST', body })
  const text = (await res.text()).trim()
  if (!res.ok) {
    console.error('[BLAST] submit failed', res.status, text)
    throw new Error(`BLAST submit failed (${res.status}): ${text}`)
  }
  return text
}

async function pollBlast(jobId: string): Promise<'RUNNING' | 'FINISHED' | 'FAILED'> {
  const res = await fetch(`${EBI_BLAST}/status/${jobId}`)
  if (!res.ok) throw new Error(`BLAST poll failed: ${res.status}`)
  return (await res.text()).trim() as 'RUNNING' | 'FINISHED' | 'FAILED'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBlastHits(json: any): BlastHit[] {
  const hits: BlastHit[] = []
  const rawHits = json?.result?.hits ?? json?.hits ?? []
  const qLen    = json?.result?.query_len ?? json?.query_len ?? 1
  for (const h of rawHits) {
    const hsp = h.hit_hsps?.[0]
    if (!hsp) continue
    hits.push({
      accession:   String(h.hit_acc ?? '').split('.')[0],
      description: String(h.hit_def ?? ''),
      length:      Number(h.hit_len ?? 0),
      evalue:      Number(hsp.hsp_expect ?? 1),
      identity:    Math.round((Number(hsp.hsp_identity ?? 0) / Number(hsp.hsp_align_len ?? 1)) * 100),
      coverage:    Math.round((Number(hsp.hsp_align_len ?? 0) / qLen) * 100),
    })
  }
  return hits
}

async function fetchBlastResults(jobId: string): Promise<BlastHit[]> {
  const res = await fetch(`${EBI_BLAST}/result/${jobId}/json`)
  if (!res.ok) throw new Error(`BLAST results failed: ${res.status}`)
  return parseBlastHits(await res.json())
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

const S = {
  base:  { fontSize: 11, fontFamily: 'Outfit, sans-serif', color: 'var(--color-text-primary)' } as React.CSSProperties,
  muted: { fontSize: 10, color: 'var(--color-text-secondary)' } as React.CSSProperties,
  mono:  { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
}

const fmtEvalue = (e: number) => e < 1e-99 ? '0.0' : e < 0.01 ? e.toExponential(1) : e.toFixed(2)

// ── Component ─────────────────────────────────────────────────────────────────

export function UniProtPanel() {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<UniProtEntry[]>([])
  const [selected,  setSelected]  = useState<UniProtEntry | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)
  const [seqCopied, setSeqCopied] = useState(false)
  const [blast,     setBlast]     = useState<BlastState>({ status: 'idle' })
  const [blastEmail, setBlastEmail] = useState(() => localStorage.getItem('blast-email') ?? 'user@example.com')
  const [editEmail,  setEditEmail]  = useState(false)

  const pollTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeFile   = useFileStore(s => s.activeFile)
  const activeChains = useSequenceStore(s => activeFile ? s.sequences.get(activeFile) : null) ?? null

  // Auto-copy first chain sequence to clipboard when structure changes
  useEffect(() => {
    if (!activeChains || activeChains.length === 0) return
    navigator.clipboard.writeText(activeChains[0].seq).then(() => {
      setSeqCopied(true)
      if (seqCopiedTimer.current) clearTimeout(seqCopiedTimer.current)
      seqCopiedTimer.current = setTimeout(() => setSeqCopied(false), 2000)
    }).catch(() => {})
  }, [activeChains])

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (pollTimer.current)      clearTimeout(pollTimer.current)
    if (seqCopiedTimer.current) clearTimeout(seqCopiedTimer.current)
  }, [])

  const runSearch = useCallback(async (entries: Promise<UniProtEntry[]>) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const res = await entries
      setResults(res)
      if (res.length === 0) setError('No UniProt match found.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    const looksLikeAccession = /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9]$|^[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9][A-Z][A-Z0-9]{2}[0-9]$/i.test(trimmed)
    if (looksLikeAccession) {
      setLoading(true); setError(null); setSelected(null)
      try {
        const entry = await fetchByAccession(trimmed)
        if (entry) { setResults([entry]); setSelected(entry); return }
      } catch { /* fall through */ } finally { setLoading(false) }
    }
    void runSearch(searchUniProt(trimmed))
  }, [runSearch])

  const saveEmail = useCallback((e: string) => {
    const v = e.trim()
    setBlastEmail(v)
    localStorage.setItem('blast-email', v)
    setEditEmail(false)
  }, [])

  const runBlast = useCallback(async (seq: string, chainId: string) => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    setBlast({ status: 'submitting', chainId })
    try {
      const jobId     = await submitBlast(seq, blastEmail)
      const startTime = Date.now()

      const poll = async () => {
        const status  = await pollBlast(jobId)
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        if (status === 'FINISHED') {
          const hits = await fetchBlastResults(jobId)
          setBlast({ status: 'done', chainId, hits })
        } else if (status === 'FAILED') {
          setBlast({ status: 'error', chainId, message: 'BLAST job failed on EBI server.' })
        } else {
          setBlast({ status: 'polling', chainId, jobId, elapsed })
          pollTimer.current = setTimeout(() => void poll(), 4000)
        }
      }
      pollTimer.current = setTimeout(() => void poll(), 5000)
      setBlast({ status: 'polling', chainId, jobId, elapsed: 0 })
    } catch (e) {
      setBlast({ status: 'error', chainId, message: e instanceof Error ? e.message : 'BLAST failed.' })
    }
  }, [blastEmail])

  const handleCopy = useCallback(async () => {
    if (!selected) return
    const fasta = `>${selected.accession}|${selected.id} ${selected.fullName} [${selected.organism}]\n${selected.sequence}`
    await navigator.clipboard.writeText(fasta)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [selected])

  const blastChain = blast.status !== 'idle' ? blast.chainId : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 10, gap: 8 }}>

      {/* From active structure */}
      {activeChains && activeChains.length > 0 && (
        <div style={{
          padding: '6px 8px', borderRadius: 5,
          border: '1px solid var(--color-border)',
          background: 'var(--color-secondary-bg)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ ...S.muted, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active structure
            </div>
            {seqCopied && (
              <div style={{ ...S.muted, fontSize: 9, color: 'var(--color-accent)' }}>
                ✓ Chain {activeChains[0].chain} sequence copied
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {activeChains.map(c => (
              <div key={c.chain} style={{ display: 'flex', gap: 3 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(c.seq).then(() => {
                      setSeqCopied(true)
                      if (seqCopiedTimer.current) clearTimeout(seqCopiedTimer.current)
                      seqCopiedTimer.current = setTimeout(() => setSeqCopied(false), 2000)
                    }).catch(() => {})
                  }}
                  title={`Copy chain ${c.chain} sequence to clipboard (${c.seq.length} aa)`}
                  style={{
                    padding: '3px 7px', borderRadius: 4, fontSize: 10,
                    fontFamily: 'Outfit, sans-serif', fontWeight: 600,
                    border: '1px solid var(--color-border)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Copy {c.chain} · {c.seq.length} aa
                </button>
                <button
                  onClick={() => blastEmail ? void runBlast(c.seq, c.chain) : setEditEmail(true)}
                  disabled={blast.status === 'submitting' || blast.status === 'polling'}
                  title={blastEmail ? `Run BLAST (Swiss-Prot) for chain ${c.chain}` : 'Set email first (required by EBI fair-use policy)'}
                  style={{
                    padding: '3px 7px', borderRadius: 4, fontSize: 10,
                    fontFamily: 'Outfit, sans-serif', fontWeight: 600,
                    border: '1px solid var(--color-border)',
                    background: blastChain === c.chain ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent',
                    color: 'var(--color-accent)',
                    cursor: blast.status === 'polling' || blast.status === 'submitting' ? 'wait' : 'pointer',
                  }}
                >
                  BLAST {c.chain} ↗
                </button>
              </div>
            ))}
          </div>

          {/* Email for EBI fair-use */}
          {(editEmail || !blastEmail) ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
              <span style={{ ...S.muted, fontSize: 9, flexShrink: 0 }}>EBI email:</span>
              <input
                autoFocus
                defaultValue={blastEmail}
                placeholder="you@example.com"
                onBlur={e => saveEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEmail((e.target as HTMLInputElement).value) }}
                style={{
                  flex: 1, fontSize: 10, fontFamily: 'Outfit, sans-serif',
                  padding: '2px 6px', borderRadius: 4,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text-primary)', outline: 'none',
                }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
              <span style={{ ...S.muted, fontSize: 9 }}>EBI: {blastEmail}</span>
              <button
                onClick={() => setEditEmail(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', ...S.muted, fontSize: 9, padding: 0, textDecoration: 'underline' }}
              >
                change
              </button>
            </div>
          )}
        </div>
      )}

      {/* BLAST status / results */}
      {blast.status !== 'idle' && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            padding: '5px 10px', fontSize: 10, fontFamily: 'Outfit, sans-serif',
            fontWeight: 600, background: 'var(--color-secondary-bg)',
            borderBottom: blast.status === 'done' ? '1px solid var(--color-border)' : 'none',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            color: 'var(--color-text-secondary)',
          }}>
            <span>BLAST · Swiss-Prot · chain {blast.chainId}</span>
            {(blast.status === 'submitting' || blast.status === 'polling') && (
              <span style={{ color: 'var(--color-accent)' }}>
                {blast.status === 'submitting' ? 'Submitting…' : `Running… ${blast.elapsed}s`}
              </span>
            )}
            {blast.status === 'done'  && <span>{blast.hits.length} hits</span>}
            {blast.status === 'error' && <span style={{ color: 'rgba(239,68,68,0.9)' }}>Error</span>}
            <button
              onClick={() => { setBlast({ status: 'idle' }); if (pollTimer.current) clearTimeout(pollTimer.current) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>

          {blast.status === 'error' && (
            <div style={{ padding: '6px 10px', fontSize: 10, color: 'rgba(239,68,68,0.9)' }}>{blast.message}</div>
          )}
          {blast.status === 'done' && blast.hits.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--color-text-secondary)' }}>No significant hits found.</div>
          )}
          {blast.status === 'done' && blast.hits.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {blast.hits.map((hit, i) => (
                <button
                  key={`${hit.accession}-${i}`}
                  onClick={() => window.open(`https://www.uniprot.org/uniprotkb/${hit.accession}`, '_blank', 'noopener,noreferrer')}
                  style={{
                    display: 'grid', gridTemplateColumns: '64px 1fr 52px 52px',
                    width: '100%', padding: '5px 10px', gap: 6,
                    textAlign: 'left', border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'Outfit, sans-serif',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title={`Open ${hit.accession} on UniProt ↗`}
                >
                  <span style={{ ...S.mono, fontSize: 10, color: 'var(--color-accent)' }}>{hit.accession}</span>
                  <span style={{ ...S.base, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.description}</span>
                  <span style={{ ...S.muted, fontSize: 9, textAlign: 'right', whiteSpace: 'nowrap' }}>{hit.identity}% id</span>
                  <span style={{ ...S.muted, ...S.mono, fontSize: 9, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEvalue(hit.evalue)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Text search bar */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void doSearch(query)}
          placeholder="Gene, protein name or accession (P15692)…"
          style={{
            flex: 1, fontSize: 11, fontFamily: 'Outfit, sans-serif',
            padding: '4px 8px', borderRadius: 5,
            border: '1px solid var(--color-border)',
            background: 'var(--color-background)',
            color: 'var(--color-text-primary)', outline: 'none',
          }}
        />
        <button
          onClick={() => void doSearch(query)}
          disabled={loading || !query.trim()}
          style={{
            padding: '4px 12px', borderRadius: 5, fontSize: 11,
            fontFamily: 'Outfit, sans-serif', fontWeight: 600,
            border: '1px solid var(--color-border)',
            background: 'var(--color-accent)', color: '#0a0e1a',
            cursor: loading ? 'wait' : 'pointer', flexShrink: 0,
          }}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)', padding: '4px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          {error}
        </div>
      )}

      {/* Text search results list */}
      {results.length > 0 && (
        <div style={{
          flexGrow: selected ? 0 : 1, flexShrink: 0, flexBasis: selected ? 'auto' : undefined,
          maxHeight: selected ? 160 : undefined,
          overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6,
        }}>
          {results.map(entry => (
            <button
              key={entry.accession}
              onClick={() => setSelected(entry)}
              style={{
                display: 'grid', gridTemplateColumns: '70px 1fr auto',
                width: '100%', padding: '6px 10px', gap: 8,
                textAlign: 'left', border: 'none',
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
              <span style={S.base}>
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
          flex: 1, border: '1px solid var(--color-border)', borderRadius: 6,
          padding: 10, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto',
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
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            color: 'var(--color-text-secondary)', background: 'var(--color-background)',
            border: '1px solid var(--color-border)', borderRadius: 4,
            padding: '6px 8px', wordBreak: 'break-all', lineHeight: 1.6,
            maxHeight: 160, overflowY: 'auto',
          }}>
            {selected.sequence.match(/.{1,60}/g)?.join('\n') ?? selected.sequence}
          </div>

          <button
            onClick={() => void handleCopy()}
            style={{
              alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 4,
              fontSize: 10, fontFamily: 'Outfit, sans-serif', fontWeight: 600,
              border: '1px solid var(--color-border)',
              background: copied ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent',
              color: copied ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            {copied ? '✓ Copied' : 'Copy sequence (FASTA)'}
          </button>
        </div>
      )}

    </div>
  )
}
