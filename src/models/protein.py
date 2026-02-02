"""Protein data model for structure handling."""

from pathlib import Path
from typing import Any, Optional

import biotite.structure as struc
import biotite.structure.io as strucio
import biotite.structure.io.pdb as pdb
import biotite.structure.io.pdbx as pdbx
import numpy as np

from src.utils.file_utils import validate_file_path, get_file_format
from src.models.metrics import (
    MetricResult,
    calculate_rasa,
    extract_plddt,
    extract_bfactor,
    calculate_metric,
    get_residue_info,
    calculate_secondary_structure,
    get_available_metrics,
)


class Protein:
    """Represents a protein structure with lazy loading.

    Attributes:
        file_path: Path to the structure file.
        name: Name of the protein (derived from filename).
    """

    def __init__(self, file_path: str | Path):
        """Initialize a Protein instance.

        Args:
            file_path: Path to the protein structure file.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        self.file_path = Path(file_path)

        if not validate_file_path(self.file_path):
            raise FileNotFoundError(f"File not found: {self.file_path}")

        self.name = self.file_path.stem
        self._structure: Optional[struc.AtomArray] = None

    def load_structure(self) -> struc.AtomArray:
        """Load the protein structure using biotite.

        Uses lazy loading - structure is only loaded on first access.
        Loads with extra fields (b_factor) when available.

        Returns:
            The protein structure as a biotite AtomArray.

        Raises:
            ValueError: If the file format is not supported.
            Exception: If parsing fails.
        """
        if self._structure is None:
            file_format = get_file_format(self.file_path)

            # Load with B-factor field for PDB files
            if file_format == ".pdb":
                pdb_file = pdb.PDBFile.read(str(self.file_path))
                self._structure = pdb_file.get_structure(
                    extra_fields=["b_factor"],
                    model=1
                )
            elif file_format == ".cif":
                cif_file = pdbx.PDBxFile.read(str(self.file_path))
                self._structure = pdbx.get_structure(
                    cif_file,
                    extra_fields=["b_factor"],
                    model=1
                )
            else:
                # Fallback to generic loader
                self._structure = strucio.load_structure(str(self.file_path))

            # If multi-model file, take first model
            if isinstance(self._structure, struc.AtomArrayStack):
                self._structure = self._structure[0]

        return self._structure

    @property
    def structure(self) -> struc.AtomArray:
        """Get the protein structure, loading if necessary."""
        return self.load_structure()

    @property
    def is_loaded(self) -> bool:
        """Check if the structure has been loaded."""
        return self._structure is not None

    def unload(self) -> None:
        """Unload the structure to free memory."""
        self._structure = None

    def get_num_atoms(self) -> int:
        """Get the number of atoms in the structure."""
        return len(self.structure)

    def get_num_residues(self) -> int:
        """Get the number of residues in the structure."""
        return struc.get_residue_count(self.structure)

    def get_chains(self) -> list[str]:
        """Get unique chain IDs in the structure."""
        return list(np.unique(self.structure.chain_id))

    def get_ca_atoms(self) -> struc.AtomArray:
        """Get only the CA (alpha carbon) atoms."""
        return self.structure[self.structure.atom_name == "CA"]

    def get_coordinates(self) -> np.ndarray:
        """Get atomic coordinates as a NumPy array.

        Returns:
            Array of shape (n_atoms, 3) containing x, y, z coordinates.
        """
        return self.structure.coord

    def get_center_of_mass(self) -> np.ndarray:
        """Calculate the center of mass of the structure.

        Returns:
            Array of shape (3,) containing x, y, z coordinates of center.
        """
        return np.mean(self.structure.coord, axis=0)

    def get_residue_info(self) -> list[dict[str, Any]]:
        """Get information about all residues.

        Returns:
            List of dicts with residue id, name, and chain.
        """
        return get_residue_info(self.structure)

    def get_secondary_structure(self) -> dict[int, str]:
        """Get secondary structure assignment for each residue.

        Returns:
            Dict mapping residue IDs to 'helix', 'sheet', or 'coil'.
        """
        return calculate_secondary_structure(self.structure)

    def calculate_rasa(self) -> MetricResult:
        """Calculate Relative Accessible Surface Area for each residue.

        Returns:
            MetricResult with RASA values (0-1) per residue.
        """
        return calculate_rasa(self.structure)

    def get_plddt(self) -> MetricResult:
        """Extract pLDDT scores from B-factor (AlphaFold structures).

        Returns:
            MetricResult with pLDDT values (0-100) per residue.
        """
        return extract_plddt(self.structure)

    def get_bfactor(self) -> MetricResult:
        """Get B-factor (temperature factor) for each residue.

        Returns:
            MetricResult with B-factor values per residue.
        """
        return extract_bfactor(self.structure)

    def calculate_metric(self, metric_name: str) -> MetricResult:
        """Calculate a named metric.

        Args:
            metric_name: Name of the metric ('rasa', 'plddt', 'bfactor').

        Returns:
            MetricResult with calculated values per residue.
        """
        return calculate_metric(self.structure, metric_name)

    @staticmethod
    def get_available_metrics() -> list[str]:
        """Get list of available metric names.

        Returns:
            List of metric names.
        """
        return get_available_metrics()

    def __repr__(self) -> str:
        """Return string representation of the Protein."""
        loaded = "loaded" if self.is_loaded else "not loaded"
        return f"Protein(name='{self.name}', {loaded})"
