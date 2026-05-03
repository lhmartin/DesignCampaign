"""
DesignCampaign Python sidecar.
Long-lived subprocess that communicates via newline-delimited JSON on stdin/stdout.

Protocol:
  stdin:  {"id": "<uuid>", "action": "<name>", "args": {...}}
  stdout: {"id": "<uuid>", "result": ..., "error": null | "traceback string"}
"""

import sys
import json
import os
import traceback as tb
from concurrent.futures import ThreadPoolExecutor


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

# ── Cached annotators (loaded once per sidecar process) ──────────────────────
# AntPack loads model weights on construction; caching avoids reloading per sequence.
_annotator_cache: dict = {}

# Thread pool for parallel annotation. AntPack uses NumPy/C extensions which
# release the GIL, so threads give real parallelism without multiprocessing overhead.
_thread_pool: 'ThreadPoolExecutor | None' = None

def _get_annotator(scheme: str):
    """Return a single annotator that scores all chain types (H, K, L)."""
    if scheme not in _annotator_cache:
        from antpack import SingleChainAnnotator  # type: ignore  # noqa: PLC0415
        # chains=['H','K','L'] lets AntPack pick the best-matching chain type.
        _annotator_cache[scheme] = SingleChainAnnotator(chains=['H', 'K', 'L'], scheme=scheme)
    return _annotator_cache[scheme]

def _get_thread_pool() -> ThreadPoolExecutor:
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=min(4, os.cpu_count() or 2))
    return _thread_pool


def _annotate_one(s: dict, ann, scheme: str) -> dict:
    """Annotate a single sequence; safe to call from multiple threads."""
    seq      = s['sequence']
    name     = s['name']
    chain_id = s.get('chain', 'A')
    try:
        numbering, pct_id, chain_type, err = ann.analyze_seq(seq)
        assignments = [_imgt_region(pos) for pos in numbering]
        return {
            'name': name, 'chain': chain_id, 'scheme': scheme,
            'chain_type': chain_type,
            'percent_identity': float(pct_id),
            'assignments': assignments,
            'error': err or None,
        }
    except Exception:
        return {
            'name': name, 'chain': chain_id, 'scheme': scheme,
            'chain_type': 'H',
            'percent_identity': 0.0, 'assignments': [], 'error': 'Annotation failed',
        }


def _antpack_number(args: dict) -> list:
    """
    args = {
      "sequences": [{"name": str, "chain": str, "sequence": str}],
      "scheme": "imgt" | "chothia" | "aho"   (default "imgt")
    }
    Returns list of {name, chain, chain_type, scheme, percent_identity, assignments, error}.

    In AntPack 0.3.x, analyze_seq() returns:
      (numbering, percent_identity, chain_type, error_msg)
    where `numbering` is already 1:1 with the input sequence (no gap positions).
    """
    scheme     = args.get('scheme', 'imgt')
    sequences  = args['sequences']
    ann        = _get_annotator(scheme)
    pool       = _get_thread_pool()

    futures = [pool.submit(_annotate_one, s, ann, scheme) for s in sequences]
    return [f.result() for f in futures]


# ── Structure annotation action (SS + SASA) ───────────────────────────────────

def _compute_structure_annotations(args: dict) -> dict:
    """
    For each PDB file path, compute:
      - ss_helix_frac / ss_sheet_frac / ss_coil_frac  (all-chain, backbone geometry)
      - per-chain exposed_mask: bool[] in ATOM-record residue order
        (True = residue summed heavy-atom SASA > 20 Å²)

    Returns {filePath: {ss_helix_frac, ss_sheet_frac, ss_coil_frac,
                        chains: {chainId: {exposed_mask: [bool, ...]}}}}
    Files that fail to parse are silently skipped.
    """
    import biotite.structure as struc
    import biotite.structure.io.pdb as pdb_io
    import numpy as np

    SASA_THRESHOLD = 20.0  # Å² per residue

    results: dict = {}
    for file_path in args.get('filePaths', []):
        try:
            pdb_file   = pdb_io.PDBFile.read(file_path)
            atom_array = pdb_io.get_structure(pdb_file, model=1)

            # ── SS fractions ──────────────────────────────────────────────────
            backbone = atom_array[struc.filter_backbone(atom_array)]
            sse      = struc.annotate_sse(backbone)  # 'a'=helix 'b'=sheet 'c'=coil
            total    = len(sse)
            if total == 0:
                ss = {'ss_helix_frac': 0.0, 'ss_sheet_frac': 0.0, 'ss_coil_frac': 1.0}
            else:
                helix = int(np.sum(sse == 'a'))
                sheet = int(np.sum(sse == 'b'))
                ss = {
                    'ss_helix_frac': round(helix / total, 4),
                    'ss_sheet_frac': round(sheet / total, 4),
                    'ss_coil_frac':  round((total - helix - sheet) / total, 4),
                }

            # ── Per-chain solvent exposure masks ──────────────────────────────
            # Compute SASA on the full structure (inter-chain contacts matter).
            # NOTE: mask indices align to ATOM-record residue order. For designed
            # binders (RFdiffusion/ProteinMPNN) this matches SEQRES order exactly.
            heavy      = atom_array[atom_array.element != 'H']
            atom_sasa  = struc.sasa(heavy)  # per-atom SASA in Å²

            chain_masks: dict = {}
            for chain_id in np.unique(heavy.chain_id):
                chain_mask  = heavy.chain_id == chain_id
                chain_atoms = heavy[chain_mask]
                chain_sasa  = atom_sasa[chain_mask]

                res_starts = struc.get_residue_starts(chain_atoms)
                exposed: list[bool] = []
                for i in range(len(res_starts)):
                    start = res_starts[i]
                    end   = res_starts[i + 1] if i + 1 < len(res_starts) else len(chain_atoms)
                    exposed.append(bool(chain_sasa[start:end].sum() > SASA_THRESHOLD))
                chain_masks[str(chain_id)] = {'exposed_mask': exposed}

            results[file_path] = {**ss, 'chains': chain_masks}
        except Exception:
            pass
    return results


# ── Dispatch table ────────────────────────────────────────────────────────────

def _dispatch(action: str, args: dict):
    if action == 'ping':
        return 'pong'
    if action == 'antpack_number':
        return _antpack_number(args)
    if action == 'compute_structure_annotations':
        return _compute_structure_annotations(args)
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
