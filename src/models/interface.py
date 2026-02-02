"""Interface residue identification for protein complexes.

This module provides functions to identify interface residues between
protein chains using spatial proximity analysis with KD-trees.
"""

import numpy as np
from scipy.spatial import cKDTree
from biotite.structure import AtomArray, filter_amino_acids

# Three-letter to one-letter amino acid code mapping
THREE_TO_ONE = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    # Non-standard but common
    "MSE": "M",  # Selenomethionine
    "SEC": "U",  # Selenocysteine
    "PYL": "O",  # Pyrrolysine
}


def get_interface_residues(
    structure: AtomArray,
    binder_chain: str = "B",
    target_chains: list[str] | None = None,
    distance_cutoff: float = 4.0,
) -> dict[int, str]:
    """Identify interface residues between binder and target chains.

    Analyzes a protein complex structure to identify binder residues that
    are in close contact with the target protein, defining the binding interface.
    Uses spatial proximity analysis with KD-trees for efficient computation.

    Args:
        structure: Biotite AtomArray containing the protein complex.
        binder_chain: Chain identifier for the binder protein. Defaults to 'B'.
        target_chains: Chain identifiers for the target proteins. Defaults to ['A'].
        distance_cutoff: Maximum distance (Å) for interface contacts. Defaults to 4.0.

    Returns:
        Dictionary mapping binder residue numbers (int) to single-letter amino
        acid codes (str) for all residues with atoms within the distance cutoff
        of the target.
    """
    if target_chains is None:
        target_chains = ["A"]

    # Filter to amino acids only
    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    # Get atoms for binder chain
    binder_mask = aa_structure.chain_id == binder_chain
    binder_atoms = aa_structure[binder_mask]

    if len(binder_atoms) == 0:
        return {}

    binder_coords = binder_atoms.coord

    # Get atoms for target chains
    target_mask = np.isin(aa_structure.chain_id, target_chains)
    target_atoms = aa_structure[target_mask]

    if len(target_atoms) == 0:
        return {}

    target_coords = target_atoms.coord

    # Build KD trees for efficient spatial queries
    binder_tree = cKDTree(binder_coords)
    target_tree = cKDTree(target_coords)

    # Query for pairs of atoms within the distance cutoff
    pairs = binder_tree.query_ball_tree(target_tree, distance_cutoff)

    # Collect interface residues
    interface_residues: dict[int, str] = {}

    for binder_idx, close_indices in enumerate(pairs):
        if close_indices:  # Has contacts with target
            res_id = int(binder_atoms[binder_idx].res_id)
            res_name = binder_atoms[binder_idx].res_name

            # Convert to single-letter code
            aa_code = THREE_TO_ONE.get(res_name, "X")
            interface_residues[res_id] = aa_code

    return interface_residues


def get_bidirectional_interface(
    structure: AtomArray,
    chain_a: str = "A",
    chain_b: str = "B",
    distance_cutoff: float = 4.0,
) -> tuple[dict[int, str], dict[int, str]]:
    """Get interface residues for both chains in an interaction.

    Args:
        structure: Biotite AtomArray containing the protein complex.
        chain_a: First chain identifier.
        chain_b: Second chain identifier.
        distance_cutoff: Maximum distance (Å) for interface contacts.

    Returns:
        Tuple of two dictionaries:
        - First dict: Chain A residues at interface (res_id -> aa_code)
        - Second dict: Chain B residues at interface (res_id -> aa_code)
    """
    interface_a = get_interface_residues(
        structure,
        binder_chain=chain_a,
        target_chains=[chain_b],
        distance_cutoff=distance_cutoff,
    )

    interface_b = get_interface_residues(
        structure,
        binder_chain=chain_b,
        target_chains=[chain_a],
        distance_cutoff=distance_cutoff,
    )

    return interface_a, interface_b


def get_all_chain_interfaces(
    structure: AtomArray,
    distance_cutoff: float = 4.0,
) -> dict[str, dict[str, dict[int, str]]]:
    """Get interface residues for all chain pairs in a structure.

    Args:
        structure: Biotite AtomArray containing the protein complex.
        distance_cutoff: Maximum distance (Å) for interface contacts.

    Returns:
        Nested dictionary: {chain_id: {partner_chain: {res_id: aa_code}}}
    """
    # Get unique chains
    chains = list(set(structure.chain_id))

    if len(chains) < 2:
        return {}

    interfaces: dict[str, dict[str, dict[int, str]]] = {}

    for chain in chains:
        interfaces[chain] = {}
        other_chains = [c for c in chains if c != chain]

        for partner in other_chains:
            interface = get_interface_residues(
                structure,
                binder_chain=chain,
                target_chains=[partner],
                distance_cutoff=distance_cutoff,
            )
            if interface:
                interfaces[chain][partner] = interface

    return interfaces


def count_interface_contacts(
    structure: AtomArray,
    binder_chain: str = "B",
    target_chains: list[str] | None = None,
    distance_cutoff: float = 4.0,
) -> dict[int, int]:
    """Count the number of atomic contacts for each interface residue.

    Args:
        structure: Biotite AtomArray containing the protein complex.
        binder_chain: Chain identifier for the binder protein.
        target_chains: Chain identifiers for the target proteins.
        distance_cutoff: Maximum distance (Å) for interface contacts.

    Returns:
        Dictionary mapping residue IDs to contact counts.
    """
    if target_chains is None:
        target_chains = ["A"]

    # Filter to amino acids only
    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    # Get atoms for binder chain
    binder_mask = aa_structure.chain_id == binder_chain
    binder_atoms = aa_structure[binder_mask]

    if len(binder_atoms) == 0:
        return {}

    # Get atoms for target chains
    target_mask = np.isin(aa_structure.chain_id, target_chains)
    target_atoms = aa_structure[target_mask]

    if len(target_atoms) == 0:
        return {}

    # Build KD trees
    binder_tree = cKDTree(binder_atoms.coord)
    target_tree = cKDTree(target_atoms.coord)

    # Query for pairs
    pairs = binder_tree.query_ball_tree(target_tree, distance_cutoff)

    # Count contacts per residue
    contact_counts: dict[int, int] = {}

    for binder_idx, close_indices in enumerate(pairs):
        if close_indices:
            res_id = int(binder_atoms[binder_idx].res_id)
            contact_counts[res_id] = contact_counts.get(res_id, 0) + len(close_indices)

    return contact_counts
