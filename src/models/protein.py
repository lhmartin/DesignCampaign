"""Protein data model for structure handling."""

from pathlib import Path
from typing import Optional

import biotite.structure as struc
import biotite.structure.io as strucio
import numpy as np

from src.utils.file_utils import validate_file_path, get_file_format


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

        Returns:
            The protein structure as a biotite AtomArray.

        Raises:
            ValueError: If the file format is not supported.
            Exception: If parsing fails.
        """
        if self._structure is None:
            file_format = get_file_format(self.file_path)
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

    def __repr__(self) -> str:
        """Return string representation of the Protein."""
        loaded = "loaded" if self.is_loaded else "not loaded"
        return f"Protein(name='{self.name}', {loaded})"
