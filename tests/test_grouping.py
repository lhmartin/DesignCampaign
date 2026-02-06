"""Tests for GroupingManager binder search functionality."""

from unittest.mock import MagicMock

import numpy as np
import pytest

from src.models.grouping import GroupingManager, TargetDesignation


def _make_mock_protein(chain_ids, res_ids, coords):
    """Create a mock Protein with a minimal structure.

    Args:
        chain_ids: Array of chain ID strings per atom.
        res_ids: Array of residue ID ints per atom.
        coords: Nx3 array of coordinates.
    """
    chain_ids = np.array(chain_ids)
    res_ids = np.array(res_ids)
    coords = np.array(coords, dtype=float)

    # Build a mock AtomArray-like object that supports indexing/masking
    class MockStructure:
        def __init__(self, chains, resis, crds):
            self.chain_id = chains
            self.res_id = resis
            self.coord = crds

        def __getitem__(self, key):
            return MockStructure(
                self.chain_id[key], self.res_id[key], self.coord[key]
            )

        def __len__(self):
            return len(self.chain_id)

    protein = MagicMock()
    protein.structure = MockStructure(chain_ids, res_ids, coords)
    return protein


@pytest.fixture
def two_chain_protein():
    """A protein with chain A (target) and chain B (binder) in close contact."""
    # Chain A: residues 1,2,3 at x=0
    # Chain B: residues 10,11 at x=3 (within 4A cutoff of chain A)
    chains = ["A", "A", "A", "B", "B"]
    res_ids = [1, 2, 3, 10, 11]
    coords = [
        [0.0, 0.0, 0.0],  # A:1
        [0.0, 1.0, 0.0],  # A:2
        [0.0, 2.0, 0.0],  # A:3
        [3.0, 0.0, 0.0],  # B:10 - 3A from A:1
        [3.0, 1.0, 0.0],  # B:11 - 3A from A:2
    ]
    return _make_mock_protein(chains, res_ids, coords)


@pytest.fixture
def distant_protein():
    """A protein with chain A and chain B too far apart for contact."""
    chains = ["A", "A", "B", "B"]
    res_ids = [1, 2, 10, 11]
    coords = [
        [0.0, 0.0, 0.0],   # A:1
        [0.0, 1.0, 0.0],   # A:2
        [50.0, 0.0, 0.0],  # B:10 - 50A away
        [50.0, 1.0, 0.0],  # B:11
    ]
    return _make_mock_protein(chains, res_ids, coords)


class TestBinderSearch:
    """Tests for find_binders_contacting_residues."""

    def test_finds_binders_in_contact(self, two_chain_protein):
        """Test that binders within cutoff are found."""
        gm = GroupingManager()
        gm.register_protein("/path/protein1.pdb", two_chain_protein)

        results = gm.find_binders_contacting_residues(
            [("A", 1), ("A", 2)], distance_cutoff=4.0
        )
        assert len(results) == 1
        file_path, binder_residues, target_contacted = results[0]
        assert file_path == "/path/protein1.pdb"
        assert 10 in binder_residues  # B:10 contacts A:1
        assert 11 in binder_residues  # B:11 contacts A:2
        assert target_contacted == 2  # Both A:1 and A:2 contacted

    def test_no_results_beyond_cutoff(self, distant_protein):
        """Test that distant binders are not found."""
        gm = GroupingManager()
        gm.register_protein("/path/distant.pdb", distant_protein)

        results = gm.find_binders_contacting_residues(
            [("A", 1)], distance_cutoff=4.0
        )
        assert len(results) == 0

    def test_inferred_chains_from_query(self, two_chain_protein):
        """Test chain inference when no explicit designation exists."""
        gm = GroupingManager()
        gm.register_protein("/path/protein1.pdb", two_chain_protein)

        # Query targets chain A -> chain B should be inferred as binder
        results = gm.find_binders_contacting_residues(
            [("A", 1)], distance_cutoff=4.0
        )
        assert len(results) == 1

    def test_explicit_designation(self, two_chain_protein):
        """Test with explicit target/binder designation."""
        gm = GroupingManager()
        gm.register_protein("/path/protein1.pdb", two_chain_protein)
        gm._designations["/path/protein1.pdb"] = TargetDesignation(
            file_path="/path/protein1.pdb", target_chains=["A"], binder_chains=["B"]
        )

        results = gm.find_binders_contacting_residues(
            [("A", 1)], distance_cutoff=4.0
        )
        assert len(results) == 1

    def test_file_paths_filter(self, two_chain_protein, distant_protein):
        """Test that file_paths parameter limits search scope."""
        gm = GroupingManager()
        gm.register_protein("/path/close.pdb", two_chain_protein)
        gm.register_protein("/path/far.pdb", distant_protein)

        # Search only the distant protein -> no results
        results = gm.find_binders_contacting_residues(
            [("A", 1)], distance_cutoff=4.0, file_paths=["/path/far.pdb"]
        )
        assert len(results) == 0

        # Search only the close protein -> finds it
        results = gm.find_binders_contacting_residues(
            [("A", 1)], distance_cutoff=4.0, file_paths=["/path/close.pdb"]
        )
        assert len(results) == 1

    def test_min_target_contacts_filtering(self, two_chain_protein):
        """Test min_target_contacts parameter."""
        gm = GroupingManager()
        gm.register_protein("/path/protein1.pdb", two_chain_protein)

        # B:10 contacts A:1 only, B:11 contacts A:2 only
        # But the whole binder contacts 2 target residues
        results = gm.find_binders_contacting_residues(
            [("A", 1), ("A", 2)], distance_cutoff=4.0, min_target_contacts=2
        )
        assert len(results) == 1
        assert results[0][2] == 2

        # Require all 3 target residues -> A:3 is at (0,2,0), B:10 at (3,0,0)
        # distance = sqrt(9+4) = 3.6 < 4.0. So B:10 contacts A:3 too.
        # Actually let's check: B:11 at (3,1,0) to A:3 at (0,2,0) = sqrt(9+1)=3.16
        # So all 3 target residues should be contacted
        results = gm.find_binders_contacting_residues(
            [("A", 1), ("A", 2), ("A", 3)], distance_cutoff=4.0, min_target_contacts=3
        )
        assert len(results) == 1

    def test_empty_target_residues(self):
        """Test empty target residues returns empty list."""
        gm = GroupingManager()
        results = gm.find_binders_contacting_residues([], distance_cutoff=4.0)
        assert results == []

    def test_results_sorted_by_target_contacts(self):
        """Test that results are sorted by target contacts descending."""
        gm = GroupingManager()

        # Protein 1: binder contacts 2 target residues
        protein1 = _make_mock_protein(
            ["A", "A", "B"],
            [1, 2, 10],
            [[0, 0, 0], [0, 1, 0], [3, 0.5, 0]],
        )
        # Protein 2: binder contacts 1 target residue
        protein2 = _make_mock_protein(
            ["A", "A", "B"],
            [1, 2, 10],
            [[0, 0, 0], [0, 100, 0], [3, 0, 0]],  # B:10 only near A:1
        )
        gm.register_protein("/path/more_contacts.pdb", protein1)
        gm.register_protein("/path/less_contacts.pdb", protein2)

        results = gm.find_binders_contacting_residues(
            [("A", 1), ("A", 2)], distance_cutoff=4.0
        )
        assert len(results) == 2
        # First result should have more target contacts
        assert results[0][2] >= results[1][2]

    def test_unregistered_file_path_skipped(self, two_chain_protein):
        """Test that unregistered file paths in file_paths are skipped."""
        gm = GroupingManager()
        gm.register_protein("/path/protein1.pdb", two_chain_protein)

        results = gm.find_binders_contacting_residues(
            [("A", 1)], distance_cutoff=4.0,
            file_paths=["/path/nonexistent.pdb"]
        )
        assert len(results) == 0
