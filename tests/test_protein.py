"""Tests for Protein model."""

from pathlib import Path

import numpy as np
import pytest

from src.models.protein import Protein


# Path to sample protein file
SAMPLE_PDB = Path(__file__).parent.parent / "examples" / "sample_proteins" / "1UBQ.pdb"


class TestProteinInitialization:
    """Tests for Protein class initialization."""

    def test_init_with_valid_file(self):
        """Test initialization with a valid PDB file."""
        protein = Protein(SAMPLE_PDB)

        assert protein.name == "1UBQ"
        assert protein.file_path == SAMPLE_PDB
        assert protein.is_loaded is False

    def test_init_with_string_path(self):
        """Test initialization with string path."""
        protein = Protein(str(SAMPLE_PDB))

        assert protein.name == "1UBQ"

    def test_init_raises_for_nonexistent_file(self, tmp_path: Path):
        """Test that FileNotFoundError is raised for nonexistent file."""
        nonexistent = tmp_path / "nonexistent.pdb"

        with pytest.raises(FileNotFoundError):
            Protein(nonexistent)


@pytest.mark.skipif(not SAMPLE_PDB.exists(), reason="Sample PDB file not found")
class TestProteinStructure:
    """Tests for Protein structure loading and methods."""

    def test_lazy_loading(self):
        """Test that structure is not loaded until accessed."""
        protein = Protein(SAMPLE_PDB)

        assert protein.is_loaded is False

        # Access structure
        _ = protein.structure

        assert protein.is_loaded is True

    def test_load_structure_returns_atom_array(self):
        """Test that load_structure returns a biotite AtomArray."""
        protein = Protein(SAMPLE_PDB)
        structure = protein.load_structure()

        # Check it has expected attributes
        assert hasattr(structure, "coord")
        assert hasattr(structure, "atom_name")
        assert hasattr(structure, "res_name")

    def test_structure_property_same_as_load(self):
        """Test that structure property returns same object as load_structure."""
        protein = Protein(SAMPLE_PDB)
        loaded = protein.load_structure()
        prop = protein.structure

        assert loaded is prop

    def test_unload_clears_structure(self):
        """Test that unload clears the cached structure."""
        protein = Protein(SAMPLE_PDB)
        _ = protein.structure
        assert protein.is_loaded is True

        protein.unload()

        assert protein.is_loaded is False

    def test_get_num_atoms(self):
        """Test get_num_atoms returns positive integer."""
        protein = Protein(SAMPLE_PDB)
        num_atoms = protein.get_num_atoms()

        assert isinstance(num_atoms, int)
        assert num_atoms > 0

    def test_get_num_residues(self):
        """Test get_num_residues returns positive integer."""
        protein = Protein(SAMPLE_PDB)
        num_residues = protein.get_num_residues()

        assert isinstance(num_residues, int)
        assert num_residues > 0
        # 1UBQ (ubiquitin) has 76 amino acid residues, but PDB files
        # may include water molecules and other heteroatoms
        assert num_residues >= 76

    def test_get_chains(self):
        """Test get_chains returns list of chain IDs."""
        protein = Protein(SAMPLE_PDB)
        chains = protein.get_chains()

        assert isinstance(chains, list)
        assert len(chains) > 0
        assert all(isinstance(c, str) for c in chains)

    def test_get_ca_atoms(self):
        """Test get_ca_atoms returns only CA atoms."""
        protein = Protein(SAMPLE_PDB)
        ca_atoms = protein.get_ca_atoms()

        # All atoms should be CA
        assert len(ca_atoms) > 0
        assert all(name == "CA" for name in ca_atoms.atom_name)

    def test_get_coordinates_shape(self):
        """Test get_coordinates returns array with correct shape."""
        protein = Protein(SAMPLE_PDB)
        coords = protein.get_coordinates()

        assert isinstance(coords, np.ndarray)
        assert coords.ndim == 2
        assert coords.shape[1] == 3  # x, y, z

    def test_get_center_of_mass_shape(self):
        """Test get_center_of_mass returns 3D point."""
        protein = Protein(SAMPLE_PDB)
        center = protein.get_center_of_mass()

        assert isinstance(center, np.ndarray)
        assert center.shape == (3,)


class TestProteinRepr:
    """Tests for Protein string representation."""

    def test_repr_not_loaded(self):
        """Test repr when structure is not loaded."""
        protein = Protein(SAMPLE_PDB)

        repr_str = repr(protein)

        assert "1UBQ" in repr_str
        assert "not loaded" in repr_str

    @pytest.mark.skipif(not SAMPLE_PDB.exists(), reason="Sample PDB file not found")
    def test_repr_loaded(self):
        """Test repr when structure is loaded."""
        protein = Protein(SAMPLE_PDB)
        _ = protein.structure

        repr_str = repr(protein)

        assert "1UBQ" in repr_str
        assert "loaded" in repr_str
        assert "not loaded" not in repr_str
