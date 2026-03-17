/**
 * Minimal PDB line builder for test fixtures.
 *
 * Generates fixed-format ATOM records with exactly the column positions
 * expected by parseAtoms() and extractMetricsFromPDB():
 *
 *   0-5   record type ("ATOM  ")
 *   6-10  serial number (right-justified)
 *   11    space
 *   12-15 atom name (4 chars — leading space for 1–2 char element symbols)
 *   16    alt loc (space)
 *   17-19 residue name
 *   20    space
 *   21    chain ID
 *   22-25 residue sequence number (right-justified)
 *   26    insertion code (space)
 *   27-29 spaces
 *   30-37 x (8.3f)
 *   38-45 y (8.3f)
 *   46-53 z (8.3f)
 *   54-59 occupancy (6.2f)
 *   60-65 B-factor (6.2f)
 */
export function makePdbLine(
  atomName: string,
  chain: string,
  resSeq: number,
  x: number,
  y: number,
  z: number,
  bfactor = 50.0,
  serial = 1,
  resName = 'ALA',
): string {
  // Atom name field (cols 12-15): 1-3 char elements get a leading space (e.g. " CA ")
  const nameField = atomName.length <= 3
    ? (' ' + atomName).padEnd(4)
    : atomName.slice(0, 4)

  return (
    'ATOM  ' +                           // 0-5
    String(serial).padStart(5) +         // 6-10
    ' ' +                                // 11
    nameField +                          // 12-15
    ' ' +                                // 16 (altLoc)
    resName.padEnd(3) +                  // 17-19
    ' ' +                                // 20
    chain +                              // 21
    String(resSeq).padStart(4) +         // 22-25
    ' ' +                                // 26 (iCode)
    '   ' +                              // 27-29
    x.toFixed(3).padStart(8) +           // 30-37
    y.toFixed(3).padStart(8) +           // 38-45
    z.toFixed(3).padStart(8) +           // 46-53
    (1.0).toFixed(2).padStart(6) +       // 54-59 (occupancy)
    bfactor.toFixed(2).padStart(6)       // 60-65
  )
}

// ─── Named multi-line PDB fragments ──────────────────────────────────────────

/**
 * Chain A — 3 residues, all heavy-atom types present.
 *   Res 1: N, CA, C, O, CB (all 5 atoms)
 *   Res 2: CA only
 *   Res 3: CA only
 * Known B-factors: CA atoms = 50, 60, 70 → mean_plddt = (50+60+70)/3 = 60.00
 */
export const CHAIN_A = [
  makePdbLine('N',  'A', 1, 10.0, 10.0, 10.0, 50.0, 1),
  makePdbLine('CA', 'A', 1, 10.1, 10.0, 10.0, 50.0, 2),
  makePdbLine('C',  'A', 1, 10.2, 10.0, 10.0, 50.0, 3),
  makePdbLine('O',  'A', 1, 10.3, 10.0, 10.0, 50.0, 4),
  makePdbLine('CB', 'A', 1, 10.4, 10.0, 10.0, 50.0, 5),
  makePdbLine('CA', 'A', 2, 11.0, 10.0, 10.0, 60.0, 6),
  makePdbLine('CA', 'A', 3, 12.0, 10.0, 10.0, 70.0, 7),
].join('\n')

/**
 * Chain B — 2 residues. CA coords are within 1Å of chain A res 1 → contact at 6Å cutoff.
 */
export const CHAIN_B_NEAR = [
  makePdbLine('CA', 'B', 1, 10.5, 10.0, 10.0, 40.0, 8),
  makePdbLine('CA', 'B', 2, 11.5, 10.0, 10.0, 40.0, 9),
].join('\n')

/**
 * Chain B — far away (30Å from chain A) → no contacts at any reasonable cutoff.
 */
export const CHAIN_B_FAR = [
  makePdbLine('CA', 'B', 1, 40.0, 10.0, 10.0, 40.0, 8),
].join('\n')

/**
 * Chain B — exactly at 6Å from chain A res 1 (x=10+6=16).
 * distance = sqrt((16-10)²+0+0) = 6.0 → exactly AT the cutoff → should count (≤ comparison).
 */
export const CHAIN_B_EXACTLY_AT_CUTOFF = [
  makePdbLine('CA', 'B', 1, 16.0, 10.0, 10.0, 40.0, 8),
].join('\n')

/**
 * Noisy PDB: hydrogen atoms, HETATM, REMARK, short line, non-standard chains.
 * Only chain A res 1 CA should survive all filters.
 */
export const NOISY_PDB = [
  'REMARK  3  this is a header line',
  makePdbLine('CA', 'A', 1, 10.0, 10.0, 10.0, 72.5, 1),  // keep
  makePdbLine('HA', 'A', 1, 10.1, 10.0, 10.0,  0.0, 2),  // skip: hydrogen
  'ATOM  ', // skip: too short (< 66 chars)
  // HETATM record — parseAtoms() keeps it but extractMetricsFromPDB() skips (checks 'ATOM' only)
  'HETATM   10  C1  LIG X   1      50.000  50.000  50.000  1.00  0.00           C',
  makePdbLine('CA', 'A', 2, 11.0, 10.0, 10.0, 88.0, 3),  // keep
].join('\n')

/** Two-chain PDB combining chain A and chain B (near). */
export const TWO_CHAIN_PDB = CHAIN_A + '\n' + CHAIN_B_NEAR
