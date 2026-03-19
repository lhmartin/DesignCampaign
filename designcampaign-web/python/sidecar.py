"""
DesignCampaign Python sidecar.
Long-lived subprocess that communicates via newline-delimited JSON on stdin/stdout.

Protocol:
  stdin:  {"id": "<uuid>", "action": "<name>", "args": {...}}
  stdout: {"id": "<uuid>", "result": ..., "error": null | "traceback string"}
"""

import sys
import json
import traceback as tb


# ── IMGT region boundaries ────────────────────────────────────────────────────

def _imgt_region(num_str: str) -> str | None:
    """Map an IMGT position label (e.g. '27', '27A') to a CDR/FW name."""
    try:
        n = int(''.join(c for c in str(num_str) if c.isdigit()))
    except (ValueError, TypeError):
        return None
    if n <= 26:   return 'FW1'
    if n <= 38:   return 'CDR1'
    if n <= 55:   return 'FW2'
    if n <= 65:   return 'CDR2'
    if n <= 104:  return 'FW3'
    if n <= 117:  return 'CDR3'
    return 'FW4'


# ── AntPack numbering action ──────────────────────────────────────────────────

def _antpack_number(args: dict) -> list:
    """
    args = {
      "sequences": [{"name": str, "chain": str, "sequence": str}],
      "scheme": "imgt" | "chothia" | "aho"   (default "imgt")
    }
    Returns list of {name, chain, scheme, percent_identity, assignments, error}.
    assignments = per-residue CDR/FW label (same length as input sequence).
    """
    from antpack import SingleChainAnnotator  # type: ignore  # noqa: PLC0415

    scheme = args.get('scheme', 'imgt')
    results = []

    for s in args['sequences']:
        seq       = s['sequence']
        name      = s['name']
        chain_id  = s.get('chain', 'A')

        # Try all chain types and keep the best hit.
        best: dict | None = None
        for chain_type in ('H', 'L', 'K'):
            try:
                ann = SingleChainAnnotator(allowed_chain=chain_type, scheme=scheme)
                numbering, pct_id, aligned_seq, err = ann.analyze_seq(seq)
                if best is None or float(pct_id) > best['pct']:
                    # Build per-residue assignments (skip gap '-' positions)
                    assignments = [
                        _imgt_region(pos)
                        for pos, aa in zip(numbering, aligned_seq)
                        if aa != '-'
                    ]
                    best = {
                        'pct': float(pct_id),
                        'assignments': assignments,
                        'error': err,
                        'chain_type': chain_type,
                    }
            except Exception:
                pass

        if best is None:
            results.append({
                'name': name, 'chain': chain_id, 'scheme': scheme,
                'percent_identity': 0.0, 'assignments': [], 'error': 'Annotation failed',
            })
        else:
            results.append({
                'name': name, 'chain': chain_id, 'scheme': scheme,
                'percent_identity': best['pct'],
                'assignments': best['assignments'],
                'error': best['error'],
            })

    return results


# ── Dispatch table ────────────────────────────────────────────────────────────

def _dispatch(action: str, args: dict):
    if action == 'ping':
        return 'pong'
    if action == 'antpack_number':
        return _antpack_number(args)
    raise ValueError(f'Unknown action: {action!r}')


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        cmd_id = None
        try:
            cmd    = json.loads(raw_line)
            cmd_id = cmd.get('id', '')
            result = _dispatch(cmd['action'], cmd.get('args', {}))
            sys.stdout.write(json.dumps({'id': cmd_id, 'result': result, 'error': None}) + '\n')
        except Exception:
            sys.stdout.write(json.dumps({'id': cmd_id, 'result': None, 'error': tb.format_exc()}) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
