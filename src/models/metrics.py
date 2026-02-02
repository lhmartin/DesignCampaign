"""Protein structure metrics calculations."""

from dataclasses import dataclass
from typing import Any

import numpy as np
from biotite.structure import AtomArray, sasa, filter_amino_acids, get_residues


# Maximum accessible surface area for each amino acid (Å²)
# Values from Tien et al. (2013) - empirical SASA for extended Gly-X-Gly tripeptide
MAX_ASA = {
    "ALA": 129.0, "ARG": 274.0, "ASN": 195.0, "ASP": 193.0, "CYS": 167.0,
    "GLN": 225.0, "GLU": 223.0, "GLY": 104.0, "HIS": 224.0, "ILE": 197.0,
    "LEU": 201.0, "LYS": 236.0, "MET": 224.0, "PHE": 240.0, "PRO": 159.0,
    "SER": 155.0, "THR": 172.0, "TRP": 285.0, "TYR": 263.0, "VAL": 174.0,
}

# pLDDT confidence thresholds (AlphaFold)
PLDDT_THRESHOLDS = {
    "very_high": 90,   # Very high confidence
    "confident": 70,    # Confident
    "low": 50,          # Low confidence
    "very_low": 0,      # Very low confidence
}


@dataclass
class MetricResult:
    """Result of a metric calculation."""

    name: str
    description: str
    values: dict[int, float]  # residue_id -> value
    min_value: float
    max_value: float
    unit: str = ""

    def get_normalized_values(self) -> dict[int, float]:
        """Get values normalized to [0, 1] range.

        Returns:
            Dict mapping residue IDs to normalized values.
        """
        range_val = self.max_value - self.min_value
        if range_val == 0:
            return {k: 0.5 for k in self.values}
        return {
            k: (v - self.min_value) / range_val
            for k, v in self.values.items()
        }


def calculate_rasa(structure: AtomArray) -> MetricResult:
    """Calculate Relative Accessible Surface Area (RASA) per residue.

    RASA is the ratio of the actual accessible surface area to the maximum
    possible accessible surface area for each residue type.

    Args:
        structure: Biotite AtomArray structure.

    Returns:
        MetricResult with RASA values (0-1) per residue.
    """
    # Filter to amino acids only
    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    if len(aa_structure) == 0:
        return MetricResult(
            name="RASA",
            description="Relative Accessible Surface Area",
            values={},
            min_value=0.0,
            max_value=1.0,
        )

    # Calculate absolute SASA per atom
    atom_sasa = sasa(aa_structure)

    # Aggregate SASA per residue
    # Use int() to convert numpy.int64 to Python int for JSON serialization
    residue_ids, residue_names = get_residues(aa_structure)
    residue_sasa: dict[int, float] = {}
    residue_names_map: dict[int, str] = {}

    for i, (res_id, res_name) in enumerate(zip(aa_structure.res_id, aa_structure.res_name)):
        res_id_int = int(res_id)
        if res_id_int not in residue_sasa:
            residue_sasa[res_id_int] = 0.0
            residue_names_map[res_id_int] = res_name
        residue_sasa[res_id_int] += atom_sasa[i]

    # Calculate relative ASA
    rasa_values: dict[int, float] = {}
    for res_id, total_sasa in residue_sasa.items():
        res_name = residue_names_map[res_id]
        max_asa = MAX_ASA.get(res_name, 200.0)  # Default for non-standard
        rasa = min(total_sasa / max_asa, 1.0) if max_asa > 0 else 0.0
        rasa_values[res_id] = float(rasa)

    values_list = list(rasa_values.values())
    return MetricResult(
        name="RASA",
        description="Relative Accessible Surface Area",
        values=rasa_values,
        min_value=min(values_list) if values_list else 0.0,
        max_value=max(values_list) if values_list else 1.0,
    )


def extract_plddt(structure: AtomArray) -> MetricResult:
    """Extract pLDDT scores from B-factor column (AlphaFold structures).

    AlphaFold structures store pLDDT confidence scores (0-100) in the
    B-factor column of PDB files.

    Args:
        structure: Biotite AtomArray structure.

    Returns:
        MetricResult with pLDDT values (0-100) per residue.
    """
    # Check if b_factor annotation is available
    if "b_factor" not in structure.get_annotation_categories():
        return MetricResult(
            name="pLDDT",
            description="AlphaFold Confidence Score (not available)",
            values={},
            min_value=0.0,
            max_value=100.0,
        )

    # Filter to amino acids and CA atoms for representative values
    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    if len(aa_structure) == 0:
        return MetricResult(
            name="pLDDT",
            description="AlphaFold Confidence Score",
            values={},
            min_value=0.0,
            max_value=100.0,
        )

    # Get CA atoms for per-residue pLDDT
    # Use int() to convert numpy.int64 to Python int for JSON serialization
    ca_mask = aa_structure.atom_name == "CA"
    ca_atoms = aa_structure[ca_mask]

    plddt_values: dict[int, float] = {}
    for res_id, b_factor in zip(ca_atoms.res_id, ca_atoms.b_factor):
        plddt_values[int(res_id)] = float(b_factor)

    values_list = list(plddt_values.values())
    return MetricResult(
        name="pLDDT",
        description="AlphaFold Confidence Score",
        values=plddt_values,
        min_value=min(values_list) if values_list else 0.0,
        max_value=max(values_list) if values_list else 100.0,
        unit="%",
    )


def extract_bfactor(structure: AtomArray) -> MetricResult:
    """Extract B-factor (temperature factor) per residue.

    B-factors indicate atomic displacement/flexibility. Higher values
    typically indicate more flexible regions.

    Args:
        structure: Biotite AtomArray structure.

    Returns:
        MetricResult with B-factor values per residue.
    """
    # Check if b_factor annotation is available
    if "b_factor" not in structure.get_annotation_categories():
        return MetricResult(
            name="B-factor",
            description="Temperature Factor (not available)",
            values={},
            min_value=0.0,
            max_value=100.0,
            unit="Ų",
        )

    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    if len(aa_structure) == 0:
        return MetricResult(
            name="B-factor",
            description="Temperature Factor",
            values={},
            min_value=0.0,
            max_value=100.0,
            unit="Ų",
        )

    # Average B-factor per residue
    # Use int() to convert numpy.int64 to Python int for JSON serialization
    residue_bfactors: dict[int, list[float]] = {}
    for res_id, b_factor in zip(aa_structure.res_id, aa_structure.b_factor):
        res_id_int = int(res_id)
        if res_id_int not in residue_bfactors:
            residue_bfactors[res_id_int] = []
        residue_bfactors[res_id_int].append(float(b_factor))

    bfactor_values: dict[int, float] = {
        res_id: float(np.mean(bfs)) for res_id, bfs in residue_bfactors.items()
    }

    values_list = list(bfactor_values.values())
    return MetricResult(
        name="B-factor",
        description="Temperature Factor",
        values=bfactor_values,
        min_value=min(values_list) if values_list else 0.0,
        max_value=max(values_list) if values_list else 100.0,
        unit="Ų",
    )


def calculate_secondary_structure(structure: AtomArray) -> dict[int, str]:
    """Assign secondary structure to each residue.

    Uses biotite's DSSP-like algorithm for secondary structure assignment.

    Args:
        structure: Biotite AtomArray structure.

    Returns:
        Dict mapping residue IDs to secondary structure type
        ('helix', 'sheet', 'coil').
    """
    try:
        from biotite.structure import annotate_sse
    except ImportError:
        # Fallback if annotate_sse not available
        return {}

    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    if len(aa_structure) == 0:
        return {}

    # Get chain IDs - need to process each chain separately
    chain_ids = np.unique(aa_structure.chain_id)
    ss_map: dict[int, str] = {}

    for chain_id in chain_ids:
        chain_mask = aa_structure.chain_id == chain_id
        chain_structure = aa_structure[chain_mask]

        try:
            sse = annotate_sse(chain_structure)
            residue_ids = np.unique(chain_structure.res_id)

            for res_id, ss_code in zip(residue_ids, sse):
                if ss_code == 'a':  # Alpha helix
                    ss_map[int(res_id)] = 'helix'
                elif ss_code == 'b':  # Beta sheet
                    ss_map[int(res_id)] = 'sheet'
                else:  # Coil/other
                    ss_map[int(res_id)] = 'coil'
        except Exception:
            # If SSE annotation fails for a chain, mark as coil
            for res_id in np.unique(chain_structure.res_id):
                ss_map[int(res_id)] = 'coil'

    return ss_map


def get_residue_info(structure: AtomArray) -> list[dict[str, Any]]:
    """Get basic information for all residues.

    Args:
        structure: Biotite AtomArray structure.

    Returns:
        List of dicts with residue information (id, name, chain).
    """
    aa_mask = filter_amino_acids(structure)
    aa_structure = structure[aa_mask]

    if len(aa_structure) == 0:
        return []

    # Get unique residues
    seen = set()
    residues = []

    for res_id, res_name, chain_id in zip(
        aa_structure.res_id,
        aa_structure.res_name,
        aa_structure.chain_id
    ):
        key = (int(res_id), chain_id)
        if key not in seen:
            seen.add(key)
            residues.append({
                "id": int(res_id),
                "name": res_name,
                "chain": chain_id,
            })

    return residues


# Registry of available metrics
AVAILABLE_METRICS = {
    "rasa": {
        "name": "RASA",
        "description": "Relative Accessible Surface Area",
        "calculator": calculate_rasa,
        "min": 0.0,
        "max": 1.0,
    },
    "plddt": {
        "name": "pLDDT",
        "description": "AlphaFold Confidence Score",
        "calculator": extract_plddt,
        "min": 0.0,
        "max": 100.0,
    },
    "bfactor": {
        "name": "B-factor",
        "description": "Temperature Factor",
        "calculator": extract_bfactor,
        "min": 0.0,
        "max": 100.0,
    },
}


def calculate_metric(structure: AtomArray, metric_name: str) -> MetricResult:
    """Calculate a metric by name.

    Args:
        structure: Biotite AtomArray structure.
        metric_name: Name of the metric ('rasa', 'plddt', 'bfactor').

    Returns:
        MetricResult with calculated values.

    Raises:
        ValueError: If metric name is not recognized.
    """
    metric_name = metric_name.lower()
    if metric_name not in AVAILABLE_METRICS:
        raise ValueError(
            f"Unknown metric: {metric_name}. "
            f"Available: {list(AVAILABLE_METRICS.keys())}"
        )

    calculator = AVAILABLE_METRICS[metric_name]["calculator"]
    return calculator(structure)


def get_available_metrics() -> list[str]:
    """Get list of available metric names.

    Returns:
        List of metric names.
    """
    return list(AVAILABLE_METRICS.keys())
