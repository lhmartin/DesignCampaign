"""Structure alignment using biotite superimposition."""

import logging

import biotite.structure as struc
import numpy as np

logger = logging.getLogger(__name__)


def align_on_target_chain(
    fixed: struc.AtomArray,
    mobile: struc.AtomArray,
    chain_id: str,
) -> tuple[struc.AtomArray, float]:
    """Align a mobile structure onto a fixed structure using a shared chain.

    Extracts CA atoms for the specified chain from both structures,
    superimposes on those atoms, then applies the transformation to the
    entire mobile structure.

    Args:
        fixed: Reference structure (stays in place).
        mobile: Structure to be aligned (transformed).
        chain_id: Chain ID present in both structures to align on.

    Returns:
        Tuple of (aligned mobile structure, RMSD on alignment chain CAs).

    Raises:
        ValueError: If chain is missing from either structure or CA counts differ.
    """
    # Extract CA atoms for the alignment chain
    fixed_chain_ca = fixed[
        (fixed.chain_id == chain_id) & (fixed.atom_name == "CA")
    ]
    mobile_chain_ca = mobile[
        (mobile.chain_id == chain_id) & (mobile.atom_name == "CA")
    ]

    if len(fixed_chain_ca) == 0:
        raise ValueError(f"Chain '{chain_id}' not found in reference structure")
    if len(mobile_chain_ca) == 0:
        raise ValueError(f"Chain '{chain_id}' not found in mobile structure")
    if len(fixed_chain_ca) != len(mobile_chain_ca):
        raise ValueError(
            f"CA atom count mismatch on chain '{chain_id}': "
            f"reference has {len(fixed_chain_ca)}, mobile has {len(mobile_chain_ca)}"
        )

    # Superimpose using CA atoms of the alignment chain
    fitted_ca, transformation = struc.superimpose(fixed_chain_ca, mobile_chain_ca)

    # Compute RMSD on the alignment chain CAs
    rmsd = struc.rmsd(fixed_chain_ca, fitted_ca)

    # Apply the same transformation to the entire mobile structure
    aligned_mobile = transformation.apply(mobile)

    logger.debug(
        f"Aligned on chain {chain_id}: {len(fixed_chain_ca)} CA atoms, RMSD={rmsd:.3f} A"
    )

    return aligned_mobile, float(rmsd)
