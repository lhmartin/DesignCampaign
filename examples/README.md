# Example Structures

A small set of publicly available antibody and nanobody crystal structures from the RCSB PDB, pre-loaded with companion metrics to demonstrate DesignCampaign's features.

## How to use

1. Open DesignCampaign
2. Click **Open Folder** and select this `examples/` directory
3. Click **Calculate All** in the Metrics tab — built-in metrics (pLDDT, B-factor, residues, chains) are extracted automatically
4. The JSON sidecar files are loaded automatically alongside each PDB, adding the extra columns below

## Structures

| File | Description | Chains | Resolution |
|------|-------------|--------|------------|
| `1MEL.pdb` | VHHEL-3 anti-lysozyme nanobody + lysozyme | A=nanobody, L=lysozyme | 2.5 Å |
| `1RI8.pdb` | Anti-lysozyme nanobody (high-res) | A=nanobody, B=lysozyme | 1.85 Å |
| `1ZVH.pdb` | Anti-lysozyme nanobody (high-res) | A=nanobody, L=lysozyme | 1.5 Å |
| `4KRL.pdb` | Anti-lysozyme nanobody | B=nanobody, A=lysozyme | 2.85 Å |
| `3HFM.pdb` | HyHEL-10 Fv antibody (VH+VL) + lysozyme | H=VH, L=VL, Y=lysozyme | 3.0 Å |
| `1MLC.pdb` | HyHEL-5 Fv antibody (VH+VL) + lysozyme | A=VH, B=VL, E=lysozyme | 2.5 Å |
| `3K1K.pdb` | Anti-lysozyme antibody VH domain + antigen | A=VH, C=antigen | 2.15 Å |
| `6MRR.pdb` | Designed miniprotein binder (Baker lab) | A=binder | 1.18 Å |

## Companion metrics (`.json` sidecars)

Each PDB has a `.json` sidecar with pre-computed design metrics — the kind you'd get from a design pipeline run:

| Column | Description |
|--------|-------------|
| `plddt_binder` | AlphaFold2 predicted pLDDT of the binder chain |
| `rosetta_total_score` | Rosetta total score (REU; more negative = better) |
| `ddg` | Binding energy ΔΔG (REU; more negative = tighter) |
| `pae_interaction` | AF2-Multimer PAE interaction score (lower = better) |
| `shape_complementarity` | Shape complementarity Sc (0–1; higher = better fit) |
| `binder_length` | Number of residues in the binder chain |
| `resolution_A` | Crystal structure resolution (Å) |

## What to try

- **Metrics table** — sort by `ddg` or `plddt_binder` to rank designs; toggle column visibility
- **Filter tab** — add a rule `ddg < -40` to keep only tight binders, then rank by `pae_interaction`
- **Alignment tab** — the four nanobodies (1MEL, 1RI8, 1ZVH, 4KRL) have similar CDR sequences; the alignment highlights conserved and variable positions
- **Sequence viewer** — click the CDR button to highlight CDR1/CDR2/CDR3 regions on any nanobody
- **Interface detection** — load 1ZVH, set binder chain A and target chain L, run interface detection to identify paratope and epitope residues
- **Scatter plot** — plot `ddg` vs `pae_interaction` to see how the two binding metrics correlate

## Source

All structures are from the [RCSB PDB](https://www.rcsb.org) and are freely available under their respective licenses. The companion `.json` metrics are illustrative values for demonstration purposes only.
