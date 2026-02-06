"""Tests for color scheme infrastructure."""

import pytest

from src.config.color_schemes import (
    ColorScheme,
    ColorLegendItem,
    SpectrumScheme,
    ChainScheme,
    SecondaryStructureScheme,
    BFactorScheme,
    HydrophobicityScheme,
    MetricScheme,
    CustomScheme,
    get_color_scheme,
    get_available_schemes,
    COLOR_SCHEMES,
    CHAIN_COLORS,
    HYDROPHOBICITY_SCALE,
    SECONDARY_STRUCTURE_COLORS,
)


class TestColorLegendItem:
    """Tests for ColorLegendItem dataclass."""

    def test_creation(self):
        """Test basic creation of ColorLegendItem."""
        item = ColorLegendItem(label="Test", color="#ff0000")
        assert item.label == "Test"
        assert item.color == "#ff0000"


class TestSpectrumScheme:
    """Tests for SpectrumScheme color scheme."""

    def test_name(self):
        """Test scheme name."""
        scheme = SpectrumScheme()
        assert scheme.name == "spectrum"

    def test_description(self):
        """Test scheme description."""
        scheme = SpectrumScheme()
        assert "N" in scheme.description and "C" in scheme.description

    def test_get_3dmol_style(self):
        """Test 3Dmol.js style generation."""
        scheme = SpectrumScheme()
        style = scheme.get_3dmol_style()
        assert "cartoon" in style
        assert "spectrum" in style

    def test_get_legend(self):
        """Test legend generation."""
        scheme = SpectrumScheme()
        legend = scheme.get_legend()
        assert len(legend) == 3
        assert all(isinstance(item, ColorLegendItem) for item in legend)
        # Check that colors are hex format
        for item in legend:
            assert item.color.startswith("#")


class TestChainScheme:
    """Tests for ChainScheme color scheme."""

    def test_name(self):
        """Test scheme name."""
        scheme = ChainScheme()
        assert scheme.name == "chain"

    def test_get_3dmol_style(self):
        """Test 3Dmol.js style generation."""
        scheme = ChainScheme()
        style = scheme.get_3dmol_style()
        assert "chain" in style

    def test_get_legend(self):
        """Test legend generation."""
        scheme = ChainScheme()
        legend = scheme.get_legend()
        assert len(legend) > 0
        # Check that chain colors are used
        for item in legend:
            assert item.color in CHAIN_COLORS


class TestSecondaryStructureScheme:
    """Tests for SecondaryStructureScheme color scheme."""

    def test_name(self):
        """Test scheme name."""
        scheme = SecondaryStructureScheme()
        assert scheme.name == "secondary_structure"

    def test_get_3dmol_style(self):
        """Test 3Dmol.js style generation."""
        scheme = SecondaryStructureScheme()
        style = scheme.get_3dmol_style()
        assert "ssJmol" in style

    def test_get_legend(self):
        """Test legend generation with ssJmol colors."""
        scheme = SecondaryStructureScheme()
        legend = scheme.get_legend()
        labels = [item.label for item in legend]
        assert "Helix (\u03b1)" in labels
        assert "Sheet (\u03b2)" in labels
        assert "Coil" in labels

    def test_legend_colors_match_constants(self):
        """Test that legend colors match SECONDARY_STRUCTURE_COLORS."""
        scheme = SecondaryStructureScheme()
        legend = scheme.get_legend()
        color_map = {item.label: item.color for item in legend}
        assert color_map["Helix (\u03b1)"] == SECONDARY_STRUCTURE_COLORS["helix"]
        assert color_map["Sheet (\u03b2)"] == SECONDARY_STRUCTURE_COLORS["sheet"]
        assert color_map["Coil"] == SECONDARY_STRUCTURE_COLORS["coil"]

    def test_ssjmol_colors(self):
        """Test that ssJmol colors are correct hex values."""
        assert SECONDARY_STRUCTURE_COLORS["helix"] == "#ff0080"
        assert SECONDARY_STRUCTURE_COLORS["sheet"] == "#ffc800"
        assert SECONDARY_STRUCTURE_COLORS["coil"] == "#ffffff"


class TestBFactorScheme:
    """Tests for BFactorScheme color scheme."""

    def test_name(self):
        """Test scheme name."""
        scheme = BFactorScheme()
        assert scheme.name == "b_factor"

    def test_get_3dmol_style(self):
        """Test 3Dmol.js style generation."""
        scheme = BFactorScheme()
        style = scheme.get_3dmol_style()
        assert "prop" in style
        assert "gradient" in style

    def test_get_legend(self):
        """Test legend generation."""
        scheme = BFactorScheme()
        legend = scheme.get_legend()
        assert len(legend) >= 3  # Low, Medium, High


class TestHydrophobicityScheme:
    """Tests for HydrophobicityScheme color scheme."""

    def test_name(self):
        """Test scheme name."""
        scheme = HydrophobicityScheme()
        assert scheme.name == "hydrophobicity"

    def test_get_3dmol_style(self):
        """Test 3Dmol.js style generation."""
        scheme = HydrophobicityScheme()
        style = scheme.get_3dmol_style()
        assert "colorfunc" in style
        # Should contain hydrophobicity values
        assert "ALA" in style
        assert "ILE" in style

    def test_get_legend(self):
        """Test legend generation."""
        scheme = HydrophobicityScheme()
        legend = scheme.get_legend()
        labels = [item.label.lower() for item in legend]
        # Check for hydrophilic/hydrophobic labels
        assert any("hydrophilic" in l for l in labels)
        assert any("hydrophobic" in l for l in labels)


class TestMetricScheme:
    """Tests for MetricScheme color scheme."""

    def test_default_initialization(self):
        """Test default initialization."""
        scheme = MetricScheme()
        assert scheme.metric_name == "metric"
        assert scheme.min_val == 0.0
        assert scheme.max_val == 1.0

    def test_custom_initialization(self):
        """Test custom initialization."""
        scheme = MetricScheme(
            metric_name="RASA",
            min_val=0.0,
            max_val=1.0,
            colormap="viridis"
        )
        assert scheme.metric_name == "RASA"
        assert scheme.name == "metric_rasa"

    def test_get_3dmol_style_with_metadata(self):
        """Test style generation with metric values."""
        scheme = MetricScheme(metric_name="Test", min_val=0.0, max_val=100.0)
        metadata = {"metric_values": {1: 0.0, 2: 50.0, 3: 100.0}}
        style = scheme.get_3dmol_style(metadata)
        assert "colorfunc" in style
        # Should contain color mapping
        assert "colorMap" in style

    def test_get_3dmol_style_without_metadata(self):
        """Test style generation without metadata (fallback)."""
        scheme = MetricScheme()
        style = scheme.get_3dmol_style(None)
        # Should fall back to B-factor coloring
        assert "prop" in style and "b" in style

    def test_value_to_color_rwb(self):
        """Test value to color conversion for rwb colormap."""
        scheme = MetricScheme(colormap="rwb")
        # Low value should be blue
        color_low = scheme._value_to_color(0.0)
        assert color_low == "#0000ff"
        # High value should be red
        color_high = scheme._value_to_color(1.0)
        assert color_high == "#ff0000"

    def test_get_legend(self):
        """Test legend generation."""
        scheme = MetricScheme(metric_name="Test", min_val=0.0, max_val=100.0)
        legend = scheme.get_legend()
        assert len(legend) >= 3
        # Check that min/max values appear in labels
        labels = [item.label for item in legend]
        assert any("0.0" in l for l in labels)
        assert any("100.0" in l for l in labels)


class TestCustomScheme:
    """Tests for CustomScheme color scheme."""

    def test_default_initialization(self):
        """Test default initialization with no colors."""
        scheme = CustomScheme()
        assert scheme.residue_colors == {}

    def test_initialization_with_colors(self):
        """Test initialization with predefined colors."""
        colors = {1: "#ff0000", 2: "#00ff00"}
        scheme = CustomScheme(residue_colors=colors)
        assert scheme.residue_colors == colors

    def test_set_residue_color(self):
        """Test setting individual residue color."""
        scheme = CustomScheme()
        scheme.set_residue_color(1, "#ff0000")
        assert scheme.residue_colors[1] == "#ff0000"

    def test_set_residue_colors(self):
        """Test setting multiple residue colors."""
        scheme = CustomScheme()
        colors = {1: "#ff0000", 2: "#00ff00", 3: "#0000ff"}
        scheme.set_residue_colors(colors)
        assert scheme.residue_colors == colors

    def test_get_3dmol_style_with_colors(self):
        """Test style generation with custom colors."""
        colors = {1: "#ff0000", 2: "#00ff00"}
        scheme = CustomScheme(residue_colors=colors)
        style = scheme.get_3dmol_style()
        assert "colorfunc" in style
        assert "#ff0000" in style
        assert "#00ff00" in style

    def test_get_3dmol_style_empty_colors(self):
        """Test style generation with no colors (fallback)."""
        scheme = CustomScheme()
        style = scheme.get_3dmol_style()
        assert "spectrum" in style


class TestColorSchemeRegistry:
    """Tests for color scheme registry functions."""

    def test_get_available_schemes(self):
        """Test getting list of available schemes."""
        schemes = get_available_schemes()
        assert isinstance(schemes, list)
        assert "spectrum" in schemes
        assert "chain" in schemes
        assert "secondary_structure" in schemes
        assert "b_factor" in schemes
        assert "hydrophobicity" in schemes

    def test_get_color_scheme_spectrum(self):
        """Test getting spectrum scheme by name."""
        scheme = get_color_scheme("spectrum")
        assert isinstance(scheme, SpectrumScheme)

    def test_get_color_scheme_chain(self):
        """Test getting chain scheme by name."""
        scheme = get_color_scheme("chain")
        assert isinstance(scheme, ChainScheme)

    def test_get_color_scheme_invalid(self):
        """Test that invalid scheme name raises ValueError."""
        with pytest.raises(ValueError, match="Unknown color scheme"):
            get_color_scheme("invalid_scheme")

    def test_color_schemes_registry_complete(self):
        """Test that all registered schemes have correct types."""
        for name, scheme_class in COLOR_SCHEMES.items():
            assert issubclass(scheme_class, ColorScheme)
            instance = scheme_class()
            assert instance.name == name


class TestHydrophobicityScale:
    """Tests for hydrophobicity scale constants."""

    def test_all_amino_acids_present(self):
        """Test that all 20 standard amino acids have values."""
        standard_aa = [
            "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
            "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL"
        ]
        for aa in standard_aa:
            assert aa in HYDROPHOBICITY_SCALE

    def test_value_ranges(self):
        """Test that hydrophobicity values are in expected range."""
        for aa, value in HYDROPHOBICITY_SCALE.items():
            assert -5.0 <= value <= 5.0, f"{aa} value {value} out of expected range"


class TestChainColors:
    """Tests for chain color constants."""

    def test_sufficient_colors(self):
        """Test that there are enough chain colors."""
        assert len(CHAIN_COLORS) >= 10

    def test_valid_hex_colors(self):
        """Test that all chain colors are valid hex colors."""
        for color in CHAIN_COLORS:
            assert color.startswith("#")
            assert len(color) == 7  # #RRGGBB format
