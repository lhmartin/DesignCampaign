"""Tests for metrics store and data models."""

import json
import pytest
from pathlib import Path
import tempfile
import os

from src.models.metrics_store import MetricsStore, ProteinMetrics


class TestProteinMetrics:
    """Tests for ProteinMetrics dataclass."""

    def test_basic_creation(self):
        """Test basic ProteinMetrics creation."""
        pm = ProteinMetrics(name="test_protein")
        assert pm.name == "test_protein"
        assert pm.file_path is None
        assert pm.metrics == {}

    def test_creation_with_metrics(self):
        """Test ProteinMetrics creation with metrics."""
        pm = ProteinMetrics(
            name="test",
            file_path="/path/to/test.pdb",
            metrics={"rasa": 0.5, "plddt": 80.0}
        )
        assert pm.name == "test"
        assert pm.file_path == "/path/to/test.pdb"
        assert pm.metrics["rasa"] == 0.5
        assert pm.metrics["plddt"] == 80.0

    def test_get_metric(self):
        """Test get_metric method."""
        pm = ProteinMetrics(name="test", metrics={"rasa": 0.5})
        assert pm.get_metric("rasa") == 0.5
        assert pm.get_metric("missing") is None
        assert pm.get_metric("missing", 0.0) == 0.0

    def test_set_metric(self):
        """Test set_metric method."""
        pm = ProteinMetrics(name="test")
        pm.set_metric("rasa", 0.75)
        assert pm.metrics["rasa"] == 0.75

    def test_has_metric(self):
        """Test has_metric method."""
        pm = ProteinMetrics(name="test", metrics={"rasa": 0.5})
        assert pm.has_metric("rasa") is True
        assert pm.has_metric("missing") is False

    def test_to_dict(self):
        """Test to_dict method."""
        pm = ProteinMetrics(
            name="test",
            file_path="/path/test.pdb",
            metrics={"rasa": 0.5}
        )
        d = pm.to_dict()
        assert d["name"] == "test"
        assert d["file_path"] == "/path/test.pdb"
        assert d["metrics"]["rasa"] == 0.5

    def test_from_dict(self):
        """Test from_dict class method."""
        data = {
            "name": "test",
            "file_path": "/path/test.pdb",
            "metrics": {"rasa": 0.5}
        }
        pm = ProteinMetrics.from_dict(data)
        assert pm.name == "test"
        assert pm.file_path == "/path/test.pdb"
        assert pm.metrics["rasa"] == 0.5


class TestMetricsStore:
    """Tests for MetricsStore class."""

    @pytest.fixture
    def store(self):
        """Create a MetricsStore instance."""
        return MetricsStore()

    @pytest.fixture
    def populated_store(self):
        """Create a MetricsStore with sample data."""
        store = MetricsStore()
        store.add_protein(ProteinMetrics(
            name="protein1",
            metrics={"rasa": 0.3, "plddt": 70.0}
        ))
        store.add_protein(ProteinMetrics(
            name="protein2",
            metrics={"rasa": 0.6, "plddt": 85.0}
        ))
        store.add_protein(ProteinMetrics(
            name="protein3",
            metrics={"rasa": 0.9, "plddt": 95.0}
        ))
        return store

    def test_empty_store(self, store):
        """Test empty store properties."""
        assert store.count == 0
        assert len(store) == 0
        assert store.protein_names == []
        assert store.metric_names == []

    def test_add_protein(self, store):
        """Test adding a protein."""
        pm = ProteinMetrics(name="test", metrics={"rasa": 0.5})
        store.add_protein(pm)
        assert store.count == 1
        assert "test" in store
        assert "rasa" in store.metric_names

    def test_get_protein(self, store):
        """Test getting a protein."""
        pm = ProteinMetrics(name="test", metrics={"rasa": 0.5})
        store.add_protein(pm)
        retrieved = store.get_protein("test")
        assert retrieved is not None
        assert retrieved.name == "test"
        assert store.get_protein("nonexistent") is None

    def test_remove_protein(self, populated_store):
        """Test removing a protein."""
        assert populated_store.remove_protein("protein1") is True
        assert populated_store.count == 2
        assert "protein1" not in populated_store
        assert populated_store.remove_protein("nonexistent") is False

    def test_clear(self, populated_store):
        """Test clearing all proteins."""
        populated_store.clear()
        assert populated_store.count == 0
        assert populated_store.metric_names == []

    def test_protein_names(self, populated_store):
        """Test protein_names property."""
        names = populated_store.protein_names
        assert len(names) == 3
        assert names == sorted(names)  # Should be sorted
        assert "protein1" in names
        assert "protein2" in names
        assert "protein3" in names

    def test_metric_names(self, populated_store):
        """Test metric_names property."""
        names = populated_store.metric_names
        assert "rasa" in names
        assert "plddt" in names

    def test_iteration(self, populated_store):
        """Test iterating over proteins."""
        proteins = list(populated_store)
        assert len(proteins) == 3

    def test_contains(self, populated_store):
        """Test 'in' operator."""
        assert "protein1" in populated_store
        assert "nonexistent" not in populated_store

    # Filtering tests

    def test_filter_by_name(self, populated_store):
        """Test filtering by name."""
        results = populated_store.filter_by_name("protein1")
        assert len(results) == 1
        assert results[0].name == "protein1"

        # Case insensitive
        results = populated_store.filter_by_name("PROTEIN")
        assert len(results) == 3

        # Partial match
        results = populated_store.filter_by_name("2")
        assert len(results) == 1
        assert results[0].name == "protein2"

    def test_filter_by_metric_range(self, populated_store):
        """Test filtering by metric range."""
        # Min only
        results = populated_store.filter_by_metric_range("rasa", min_val=0.5)
        assert len(results) == 2

        # Max only
        results = populated_store.filter_by_metric_range("rasa", max_val=0.5)
        assert len(results) == 1

        # Both min and max
        results = populated_store.filter_by_metric_range("rasa", min_val=0.4, max_val=0.8)
        assert len(results) == 1
        assert results[0].name == "protein2"

    def test_filter_by_metrics_multiple(self, populated_store):
        """Test filtering by multiple metrics."""
        filters = {
            "rasa": (0.5, None),
            "plddt": (80.0, None),
        }
        results = populated_store.filter_by_metrics(filters)
        assert len(results) == 2

    # Sorting tests

    def test_get_sorted_by_name(self, populated_store):
        """Test sorting by name."""
        results = populated_store.get_sorted("name", ascending=True)
        assert results[0].name == "protein1"
        assert results[2].name == "protein3"

        results = populated_store.get_sorted("name", ascending=False)
        assert results[0].name == "protein3"

    def test_get_sorted_by_metric(self, populated_store):
        """Test sorting by metric."""
        results = populated_store.get_sorted("rasa", ascending=True)
        assert results[0].name == "protein1"  # rasa=0.3
        assert results[2].name == "protein3"  # rasa=0.9

        results = populated_store.get_sorted("rasa", ascending=False)
        assert results[0].name == "protein3"  # rasa=0.9

    # I/O tests

    def test_load_csv(self, store):
        """Test loading from CSV."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("name,rasa,plddt\n")
            f.write("protein1,0.3,70.0\n")
            f.write("protein2,0.6,85.0\n")
            temp_path = f.name

        try:
            count = store.load_csv(temp_path)
            assert count == 2
            assert store.count == 2
            assert "rasa" in store.metric_names
            assert "plddt" in store.metric_names
            p1 = store.get_protein("protein1")
            assert p1.get_metric("rasa") == 0.3
        finally:
            os.unlink(temp_path)

    def test_load_csv_nonexistent(self, store):
        """Test loading from nonexistent CSV."""
        with pytest.raises(FileNotFoundError):
            store.load_csv("/nonexistent/path.csv")

    def test_load_json(self, store):
        """Test loading from JSON."""
        data = {
            "proteins": [
                {"name": "protein1", "metrics": {"rasa": 0.3}},
                {"name": "protein2", "metrics": {"rasa": 0.6}},
            ]
        }
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(data, f)
            temp_path = f.name

        try:
            count = store.load_json(temp_path)
            assert count == 2
            assert store.count == 2
        finally:
            os.unlink(temp_path)

    def test_load_json_array_format(self, store):
        """Test loading from JSON array format."""
        data = [
            {"name": "protein1", "metrics": {"rasa": 0.3}},
            {"name": "protein2", "metrics": {"rasa": 0.6}},
        ]
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(data, f)
            temp_path = f.name

        try:
            count = store.load_json(temp_path)
            assert count == 2
        finally:
            os.unlink(temp_path)

    def test_save_csv(self, populated_store):
        """Test saving to CSV."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            temp_path = f.name

        try:
            populated_store.save_csv(temp_path)

            # Read back and verify
            with open(temp_path, 'r') as f:
                lines = f.readlines()
            assert len(lines) == 4  # Header + 3 proteins
            assert "name" in lines[0]
            assert "rasa" in lines[0]
        finally:
            os.unlink(temp_path)

    def test_save_json(self, populated_store):
        """Test saving to JSON."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = f.name

        try:
            populated_store.save_json(temp_path)

            # Read back and verify
            with open(temp_path, 'r') as f:
                data = json.load(f)
            assert "proteins" in data
            assert len(data["proteins"]) == 3
        finally:
            os.unlink(temp_path)

    def test_get_metric_stats(self, populated_store):
        """Test getting metric statistics."""
        stats = populated_store.get_metric_stats("rasa")
        assert stats["count"] == 3
        assert stats["min"] == 0.3
        assert stats["max"] == 0.9
        assert stats["mean"] == pytest.approx(0.6, rel=0.01)

        # Nonexistent metric
        stats = populated_store.get_metric_stats("nonexistent")
        assert stats["count"] == 0
        assert stats["min"] is None

    def test_roundtrip_csv(self, populated_store):
        """Test saving and loading CSV preserves data."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            temp_path = f.name

        try:
            populated_store.save_csv(temp_path)

            new_store = MetricsStore()
            new_store.load_csv(temp_path)

            assert new_store.count == populated_store.count
            for name in populated_store.protein_names:
                original = populated_store.get_protein(name)
                loaded = new_store.get_protein(name)
                assert loaded is not None
                for metric in original.metrics:
                    assert loaded.get_metric(metric) == pytest.approx(
                        original.get_metric(metric), rel=0.001
                    )
        finally:
            os.unlink(temp_path)

    def test_roundtrip_json(self, populated_store):
        """Test saving and loading JSON preserves data."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = f.name

        try:
            populated_store.save_json(temp_path)

            new_store = MetricsStore()
            new_store.load_json(temp_path)

            assert new_store.count == populated_store.count
            for name in populated_store.protein_names:
                original = populated_store.get_protein(name)
                loaded = new_store.get_protein(name)
                assert loaded is not None
                for metric in original.metrics:
                    assert loaded.get_metric(metric) == original.get_metric(metric)
        finally:
            os.unlink(temp_path)
