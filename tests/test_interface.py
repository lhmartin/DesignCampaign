"""Tests for interface residue identification."""

import json
import pytest
import numpy as np
from pathlib import Path

from src.models.interface import (
    THREE_TO_ONE,
    get_interface_residues,
    get_bidirectional_interface,
    count_interface_contacts,
)
from src.models.protein import Protein


@pytest.fixture
def sample_pdb_path(tmp_path):
    """Create a sample multi-chain PDB file for testing."""
    # Simple two-chain structure with some contacts
    pdb_content = """ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N
ATOM      2  CA  ALA A   1       1.458   0.000   0.000  1.00 20.00           C
ATOM      3  C   ALA A   1       2.009   1.420   0.000  1.00 20.00           C
ATOM      4  O   ALA A   1       1.246   2.390   0.000  1.00 20.00           O
ATOM      5  CB  ALA A   1       1.986  -0.760  -1.220  1.00 20.00           C
ATOM      6  N   GLY A   2       3.320   1.540   0.000  1.00 20.00           N
ATOM      7  CA  GLY A   2       3.970   2.850   0.000  1.00 20.00           C
ATOM      8  C   GLY A   2       5.480   2.750   0.000  1.00 20.00           C
ATOM      9  O   GLY A   2       6.100   1.680   0.000  1.00 20.00           O
ATOM     10  N   LEU A   3       6.050   3.950   0.000  1.00 20.00           N
ATOM     11  CA  LEU A   3       7.500   4.100   0.000  1.00 20.00           C
ATOM     12  C   LEU A   3       8.100   2.700   0.000  1.00 20.00           C
ATOM     13  O   LEU A   3       7.380   1.700   0.000  1.00 20.00           O
ATOM     14  CB  LEU A   3       8.000   4.850   1.250  1.00 20.00           C
TER
ATOM     15  N   VAL B   1       3.000   0.000   3.000  1.00 20.00           N
ATOM     16  CA  VAL B   1       4.458   0.000   3.000  1.00 20.00           C
ATOM     17  C   VAL B   1       5.009   1.420   3.000  1.00 20.00           C
ATOM     18  O   VAL B   1       4.246   2.390   3.000  1.00 20.00           O
ATOM     19  CB  VAL B   1       4.986  -0.760   1.780  1.00 20.00           C
ATOM     20  N   SER B   2       6.320   1.540   3.000  1.00 20.00           N
ATOM     21  CA  SER B   2       6.970   2.850   3.000  1.00 20.00           C
ATOM     22  C   SER B   2       8.480   2.750   3.000  1.00 20.00           C
ATOM     23  O   SER B   2       9.100   1.680   3.000  1.00 20.00           O
ATOM     24  CB  SER B   2       6.500   3.600   4.250  1.00 20.00           C
TER
END
"""
    pdb_file = tmp_path / "test_complex.pdb"
    pdb_file.write_text(pdb_content)
    return str(pdb_file)


@pytest.fixture
def protein(sample_pdb_path):
    """Create a Protein instance from sample PDB."""
    return Protein(sample_pdb_path)


class TestThreeToOneMapping:
    """Tests for amino acid code mapping."""

    def test_standard_amino_acids(self):
        """Test mapping of standard amino acids."""
        assert THREE_TO_ONE["ALA"] == "A"
        assert THREE_TO_ONE["GLY"] == "G"
        assert THREE_TO_ONE["LEU"] == "L"
        assert THREE_TO_ONE["VAL"] == "V"
        assert THREE_TO_ONE["SER"] == "S"

    def test_all_standard_amino_acids_present(self):
        """Test that all 20 standard amino acids are mapped."""
        standard_aa = [
            "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY",
            "HIS", "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER",
            "THR", "TRP", "TYR", "VAL"
        ]
        for aa in standard_aa:
            assert aa in THREE_TO_ONE


class TestGetInterfaceResidues:
    """Tests for interface residue identification."""

    def test_interface_with_contacts(self, protein):
        """Test finding interface residues when contacts exist."""
        # Use a large cutoff to ensure we find contacts
        interface = protein.get_interface_residues(
            binder_chain="B",
            target_chains=["A"],
            distance_cutoff=10.0,
        )

        assert isinstance(interface, dict)
        # Should find some interface residues
        assert len(interface) > 0

    def test_interface_keys_are_python_ints(self, protein):
        """Test that interface residue IDs are Python ints."""
        interface = protein.get_interface_residues(
            binder_chain="B",
            target_chains=["A"],
            distance_cutoff=10.0,
        )

        for key in interface.keys():
            assert type(key) is int, f"Key {key} is {type(key)}, expected int"

    def test_interface_values_are_strings(self, protein):
        """Test that interface amino acid codes are strings."""
        interface = protein.get_interface_residues(
            binder_chain="B",
            target_chains=["A"],
            distance_cutoff=10.0,
        )

        for value in interface.values():
            assert isinstance(value, str)
            assert len(value) == 1  # Single-letter code

    def test_interface_json_serializable(self, protein):
        """Test that interface result can be JSON serialized."""
        interface = protein.get_interface_residues(
            binder_chain="B",
            target_chains=["A"],
            distance_cutoff=10.0,
        )

        # Should not raise
        json_str = json.dumps(interface)
        assert json_str is not None

        # Round-trip
        parsed = json.loads(json_str)
        assert len(parsed) == len(interface)

    def test_no_interface_with_small_cutoff(self, protein):
        """Test that small cutoff returns no interface residues."""
        interface = protein.get_interface_residues(
            binder_chain="B",
            target_chains=["A"],
            distance_cutoff=0.1,  # Very small
        )

        assert isinstance(interface, dict)
        # Likely no contacts at this distance
        assert len(interface) == 0

    def test_missing_chain_returns_empty(self, protein):
        """Test that missing chain returns empty dict."""
        interface = protein.get_interface_residues(
            binder_chain="Z",  # Doesn't exist
            target_chains=["A"],
            distance_cutoff=4.0,
        )

        assert interface == {}


class TestBidirectionalInterface:
    """Tests for bidirectional interface calculation."""

    def test_bidirectional_returns_two_dicts(self, protein):
        """Test that bidirectional interface returns two dicts."""
        from src.models.interface import get_bidirectional_interface

        interface_a, interface_b = get_bidirectional_interface(
            protein.structure,
            chain_a="A",
            chain_b="B",
            distance_cutoff=10.0,
        )

        assert isinstance(interface_a, dict)
        assert isinstance(interface_b, dict)


class TestInterfaceContacts:
    """Tests for contact counting."""

    def test_contact_counts_are_ints(self, protein):
        """Test that contact counts are integers."""
        contacts = protein.get_interface_contacts(
            binder_chain="B",
            target_chains=["A"],
            distance_cutoff=10.0,
        )

        for count in contacts.values():
            assert isinstance(count, int)
            assert count > 0


class TestProteinInterfaceMethods:
    """Tests for Protein class interface methods."""

    def test_protein_get_interface_residues(self, protein):
        """Test Protein.get_interface_residues method."""
        result = protein.get_interface_residues(
            binder_chain="B",
            target_chains=["A"],
        )
        assert isinstance(result, dict)

    def test_protein_get_interface_contacts(self, protein):
        """Test Protein.get_interface_contacts method."""
        result = protein.get_interface_contacts(
            binder_chain="B",
            target_chains=["A"],
        )
        assert isinstance(result, dict)

    def test_protein_get_sequence(self, protein):
        """Test Protein.get_sequence method."""
        sequence = protein.get_sequence()

        assert isinstance(sequence, list)
        assert len(sequence) > 0

        # Check structure of sequence entries
        for entry in sequence:
            assert "id" in entry
            assert "name" in entry
            assert "one_letter" in entry
            assert "chain" in entry

    def test_sequence_has_correct_chains(self, protein):
        """Test that sequence contains both chains."""
        sequence = protein.get_sequence()
        chains = set(entry["chain"] for entry in sequence)

        assert "A" in chains
        assert "B" in chains
