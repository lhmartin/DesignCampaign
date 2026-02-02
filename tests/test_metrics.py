"""Tests for protein metrics calculations."""

import pytest
from pathlib import Path

from src.models.protein import Protein
from src.models.metrics import (
    MetricResult,
    calculate_rasa,
    extract_plddt,
    extract_bfactor,
    calculate_metric,
    get_residue_info,
    get_available_metrics,
    AVAILABLE_METRICS,
)


@pytest.fixture
def sample_pdb_path():
    """Get path to sample PDB file."""
    return Path(__file__).parent.parent / "examples" / "sample_proteins" / "1UBQ.pdb"


@pytest.fixture
def protein(sample_pdb_path):
    """Create a Protein instance for testing."""
    return Protein(sample_pdb_path)


class TestMetricResult:
    """Tests for MetricResult dataclass."""

    def test_basic_creation(self):
        """Test basic MetricResult creation."""
        result = MetricResult(
            name="Test",
            description="Test metric",
            values={1: 0.5, 2: 0.8, 3: 0.2},
            min_value=0.2,
            max_value=0.8,
        )
        assert result.name == "Test"
        assert result.description == "Test metric"
        assert len(result.values) == 3
        assert result.min_value == 0.2
        assert result.max_value == 0.8

    def test_normalized_values(self):
        """Test normalized value calculation."""
        result = MetricResult(
            name="Test",
            description="Test",
            values={1: 0.0, 2: 50.0, 3: 100.0},
            min_value=0.0,
            max_value=100.0,
        )
        normalized = result.get_normalized_values()
        assert normalized[1] == pytest.approx(0.0)
        assert normalized[2] == pytest.approx(0.5)
        assert normalized[3] == pytest.approx(1.0)

    def test_normalized_values_zero_range(self):
        """Test normalization when all values are the same."""
        result = MetricResult(
            name="Test",
            description="Test",
            values={1: 5.0, 2: 5.0, 3: 5.0},
            min_value=5.0,
            max_value=5.0,
        )
        normalized = result.get_normalized_values()
        # Should return 0.5 for all values when range is zero
        assert all(v == 0.5 for v in normalized.values())


class TestRASACalculation:
    """Tests for RASA (Relative Accessible Surface Area) calculation."""

    def test_rasa_returns_metric_result(self, protein):
        """Test that calculate_rasa returns a MetricResult."""
        result = protein.calculate_rasa()
        assert isinstance(result, MetricResult)
        assert result.name == "RASA"

    def test_rasa_values_in_range(self, protein):
        """Test that RASA values are between 0 and 1."""
        result = protein.calculate_rasa()
        for res_id, value in result.values.items():
            assert 0.0 <= value <= 1.0, f"RASA for residue {res_id} out of range: {value}"

    def test_rasa_has_residue_coverage(self, protein):
        """Test that RASA is calculated for most residues."""
        result = protein.calculate_rasa()
        num_residues = protein.get_num_residues()
        # Should have values for most residues (some may be missing if non-standard)
        assert len(result.values) > 0
        assert len(result.values) <= num_residues


class TestPLDDTExtraction:
    """Tests for pLDDT extraction from B-factor column."""

    def test_plddt_returns_metric_result(self, protein):
        """Test that get_plddt returns a MetricResult."""
        result = protein.get_plddt()
        assert isinstance(result, MetricResult)
        assert result.name == "pLDDT"

    def test_plddt_has_values(self, protein):
        """Test that pLDDT values are extracted."""
        result = protein.get_plddt()
        # 1UBQ has B-factors (not AlphaFold pLDDT, but still extracted)
        assert len(result.values) > 0


class TestBFactorExtraction:
    """Tests for B-factor extraction."""

    def test_bfactor_returns_metric_result(self, protein):
        """Test that get_bfactor returns a MetricResult."""
        result = protein.get_bfactor()
        assert isinstance(result, MetricResult)
        assert result.name == "B-factor"

    def test_bfactor_values_positive(self, protein):
        """Test that B-factor values are non-negative."""
        result = protein.get_bfactor()
        for res_id, value in result.values.items():
            assert value >= 0.0, f"B-factor for residue {res_id} is negative: {value}"


class TestCalculateMetric:
    """Tests for generic metric calculation function."""

    def test_calculate_rasa_by_name(self, protein):
        """Test calculating RASA by metric name."""
        result = calculate_metric(protein.structure, "rasa")
        assert result.name == "RASA"

    def test_calculate_plddt_by_name(self, protein):
        """Test calculating pLDDT by metric name."""
        result = calculate_metric(protein.structure, "plddt")
        assert result.name == "pLDDT"

    def test_calculate_bfactor_by_name(self, protein):
        """Test calculating B-factor by metric name."""
        result = calculate_metric(protein.structure, "bfactor")
        assert result.name == "B-factor"

    def test_invalid_metric_name_raises(self, protein):
        """Test that invalid metric name raises ValueError."""
        with pytest.raises(ValueError, match="Unknown metric"):
            calculate_metric(protein.structure, "invalid_metric")

    def test_case_insensitive(self, protein):
        """Test that metric names are case-insensitive."""
        result1 = calculate_metric(protein.structure, "RASA")
        result2 = calculate_metric(protein.structure, "rasa")
        assert result1.name == result2.name


class TestGetResidueInfo:
    """Tests for residue information extraction."""

    def test_returns_list(self, protein):
        """Test that get_residue_info returns a list."""
        info = protein.get_residue_info()
        assert isinstance(info, list)

    def test_residue_info_structure(self, protein):
        """Test the structure of residue info dicts."""
        info = protein.get_residue_info()
        assert len(info) > 0
        for res_info in info:
            assert "id" in res_info
            assert "name" in res_info
            assert "chain" in res_info
            assert isinstance(res_info["id"], int)
            assert isinstance(res_info["name"], str)
            assert isinstance(res_info["chain"], str)


class TestAvailableMetrics:
    """Tests for available metrics registry."""

    def test_get_available_metrics(self):
        """Test that available metrics are returned."""
        metrics = get_available_metrics()
        assert isinstance(metrics, list)
        assert "rasa" in metrics
        assert "plddt" in metrics
        assert "bfactor" in metrics

    def test_metrics_registry_structure(self):
        """Test the structure of AVAILABLE_METRICS registry."""
        for metric_id, info in AVAILABLE_METRICS.items():
            assert "name" in info
            assert "description" in info
            assert "calculator" in info
            assert callable(info["calculator"])


class TestProteinMetricMethods:
    """Tests for Protein class metric methods."""

    def test_protein_calculate_rasa(self, protein):
        """Test Protein.calculate_rasa method."""
        result = protein.calculate_rasa()
        assert isinstance(result, MetricResult)
        assert result.name == "RASA"

    def test_protein_get_plddt(self, protein):
        """Test Protein.get_plddt method."""
        result = protein.get_plddt()
        assert isinstance(result, MetricResult)
        assert result.name == "pLDDT"

    def test_protein_get_bfactor(self, protein):
        """Test Protein.get_bfactor method."""
        result = protein.get_bfactor()
        assert isinstance(result, MetricResult)
        assert result.name == "B-factor"

    def test_protein_calculate_metric(self, protein):
        """Test Protein.calculate_metric method."""
        result = protein.calculate_metric("rasa")
        assert isinstance(result, MetricResult)

    def test_protein_get_available_metrics(self):
        """Test Protein.get_available_metrics static method."""
        metrics = Protein.get_available_metrics()
        assert "rasa" in metrics
        assert "plddt" in metrics
        assert "bfactor" in metrics
