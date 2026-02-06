"""Color scheme definitions for protein visualization."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


# Standard amino acid hydrophobicity values (Kyte-Doolittle scale)
HYDROPHOBICITY_SCALE = {
    "ALA": 1.8, "ARG": -4.5, "ASN": -3.5, "ASP": -3.5, "CYS": 2.5,
    "GLN": -3.5, "GLU": -3.5, "GLY": -0.4, "HIS": -3.2, "ILE": 4.5,
    "LEU": 3.8, "LYS": -3.9, "MET": 1.9, "PHE": 2.8, "PRO": -1.6,
    "SER": -0.8, "THR": -0.7, "TRP": -0.9, "TYR": -1.3, "VAL": 4.2,
}

# Chain colors (for multi-chain proteins)
CHAIN_COLORS = [
    "#1f77b4",  # blue
    "#ff7f0e",  # orange
    "#2ca02c",  # green
    "#d62728",  # red
    "#9467bd",  # purple
    "#8c564b",  # brown
    "#e377c2",  # pink
    "#7f7f7f",  # gray
    "#bcbd22",  # olive
    "#17becf",  # cyan
]

# Secondary structure colors (matching 3Dmol.js ssJmol scheme)
SECONDARY_STRUCTURE_COLORS = {
    "helix": "#ff0080",   # magenta/hot pink
    "sheet": "#ffc800",   # golden yellow
    "coil": "#ffffff",    # white
}


@dataclass
class ColorLegendItem:
    """Single item in a color legend."""
    label: str
    color: str


class ColorScheme(ABC):
    """Abstract base class for color schemes."""

    name: str = "base"
    description: str = "Base color scheme"

    @abstractmethod
    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        """Get the 3Dmol.js style specification.

        Args:
            metadata: Optional metadata (e.g., metric values, chain info).

        Returns:
            JavaScript style specification string.
        """
        pass

    @abstractmethod
    def get_legend(self) -> list[ColorLegendItem]:
        """Get the color legend for this scheme.

        Returns:
            List of legend items with labels and colors.
        """
        pass


class SpectrumScheme(ColorScheme):
    """Rainbow coloring from N-terminus to C-terminus."""

    name = "spectrum"
    description = "Rainbow gradient (N→C terminus)"

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        return "{cartoon: {color: 'spectrum'}}"

    def get_legend(self) -> list[ColorLegendItem]:
        return [
            ColorLegendItem("N-terminus", "#0000ff"),
            ColorLegendItem("Middle", "#00ff00"),
            ColorLegendItem("C-terminus", "#ff0000"),
        ]


class ChainScheme(ColorScheme):
    """Different color for each chain."""

    name = "chain"
    description = "Color by chain"

    def __init__(self, chain_ids: list[str] | None = None):
        """Initialize chain color scheme.

        Args:
            chain_ids: Optional list of actual chain IDs for legend.
        """
        self._chain_ids = chain_ids

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        return "{cartoon: {colorscheme: 'chain'}}"

    def get_legend(self, chain_ids: list[str] | None = None) -> list[ColorLegendItem]:
        """Get the color legend for this scheme.

        Args:
            chain_ids: Optional list of chain IDs to display.

        Returns:
            List of legend items with labels and colors.
        """
        chains = chain_ids or self._chain_ids
        if chains:
            return [
                ColorLegendItem(f"Chain {cid}", CHAIN_COLORS[i % len(CHAIN_COLORS)])
                for i, cid in enumerate(chains)
            ]
        return [
            ColorLegendItem(f"Chain {i+1}", color)
            for i, color in enumerate(CHAIN_COLORS[:6])
        ]


class SecondaryStructureScheme(ColorScheme):
    """Color by secondary structure type."""

    name = "secondary_structure"
    description = "Color by secondary structure"

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        return "{cartoon: {colorscheme: 'ssJmol'}}"

    def get_legend(self) -> list[ColorLegendItem]:
        return [
            ColorLegendItem("Helix (α)", SECONDARY_STRUCTURE_COLORS["helix"]),
            ColorLegendItem("Sheet (β)", SECONDARY_STRUCTURE_COLORS["sheet"]),
            ColorLegendItem("Coil", SECONDARY_STRUCTURE_COLORS["coil"]),
        ]


class BFactorScheme(ColorScheme):
    """Color by B-factor (temperature factor)."""

    name = "b_factor"
    description = "Color by B-factor"

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        return "{cartoon: {colorscheme: {prop: 'b', gradient: 'rwb', min: 0, max: 100}}}"

    def get_legend(self) -> list[ColorLegendItem]:
        return [
            ColorLegendItem("Low (0)", "#0000ff"),
            ColorLegendItem("Medium (50)", "#ffffff"),
            ColorLegendItem("High (100)", "#ff0000"),
        ]


class HydrophobicityScheme(ColorScheme):
    """Color by Kyte-Doolittle hydrophobicity."""

    name = "hydrophobicity"
    description = "Color by hydrophobicity"

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        # Use custom coloring via JavaScript
        return """{cartoon: {
            colorfunc: function(atom) {
                var hydro = {
                    'ALA': 1.8, 'ARG': -4.5, 'ASN': -3.5, 'ASP': -3.5, 'CYS': 2.5,
                    'GLN': -3.5, 'GLU': -3.5, 'GLY': -0.4, 'HIS': -3.2, 'ILE': 4.5,
                    'LEU': 3.8, 'LYS': -3.9, 'MET': 1.9, 'PHE': 2.8, 'PRO': -1.6,
                    'SER': -0.8, 'THR': -0.7, 'TRP': -0.9, 'TYR': -1.3, 'VAL': 4.2
                };
                var val = hydro[atom.resn] || 0;
                var norm = (val + 4.5) / 9.0;
                var r = Math.round(255 * norm);
                var b = Math.round(255 * (1 - norm));
                return 'rgb(' + r + ',0,' + b + ')';
            }
        }}"""

    def get_legend(self) -> list[ColorLegendItem]:
        return [
            ColorLegendItem("Hydrophilic (-4.5)", "#0000ff"),
            ColorLegendItem("Neutral (0)", "#800080"),
            ColorLegendItem("Hydrophobic (+4.5)", "#ff0000"),
        ]


class MetricScheme(ColorScheme):
    """Color by arbitrary per-residue metric values."""

    name = "metric"
    description = "Color by metric"

    def __init__(
        self,
        metric_name: str = "metric",
        min_val: float = 0.0,
        max_val: float = 1.0,
        colormap: str = "rwb",
    ):
        """Initialize metric color scheme.

        Args:
            metric_name: Name of the metric (e.g., 'RASA', 'pLDDT').
            min_val: Minimum value for color scale.
            max_val: Maximum value for color scale.
            colormap: Color gradient ('rwb', 'bwr', 'roygb', 'sinebow').
        """
        self.metric_name = metric_name
        self.min_val = min_val
        self.max_val = max_val
        self.colormap = colormap
        self.name = f"metric_{metric_name.lower()}"
        self.description = f"Color by {metric_name}"

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        """Get style spec using per-residue metric values.

        Args:
            metadata: Must contain 'metric_values' dict mapping residue IDs to values.
        """
        if not metadata or "metric_values" not in metadata:
            # Fallback to B-factor coloring
            return "{cartoon: {colorscheme: {prop: 'b', gradient: 'rwb', min: 0, max: 100}}}"

        # Generate JavaScript with color mapping
        values = metadata["metric_values"]
        min_v = self.min_val
        max_v = self.max_val
        range_v = max_v - min_v if max_v != min_v else 1.0

        # Create residue -> color mapping
        js_map = "{"
        for res_id, val in values.items():
            norm = (val - min_v) / range_v
            norm = max(0.0, min(1.0, norm))  # Clamp to [0, 1]
            color = self._value_to_color(norm)
            js_map += f"{res_id}: '{color}',"
        js_map += "}"

        return f"""{{cartoon: {{
            colorfunc: function(atom) {{
                var colorMap = {js_map};
                return colorMap[atom.resi] || '#808080';
            }}
        }}}}"""

    def _value_to_color(self, norm: float) -> str:
        """Convert normalized value [0,1] to hex color.

        Args:
            norm: Normalized value between 0 and 1.

        Returns:
            Hex color string.
        """
        if self.colormap == "rwb":
            # Red-White-Blue: 0=blue, 0.5=white, 1=red
            if norm < 0.5:
                t = norm * 2
                r = int(255 * t)
                g = int(255 * t)
                b = 255
            else:
                t = (norm - 0.5) * 2
                r = 255
                g = int(255 * (1 - t))
                b = int(255 * (1 - t))
        elif self.colormap == "bwr":
            # Blue-White-Red: 0=red, 0.5=white, 1=blue
            if norm < 0.5:
                t = norm * 2
                r = 255
                g = int(255 * t)
                b = int(255 * t)
            else:
                t = (norm - 0.5) * 2
                r = int(255 * (1 - t))
                g = int(255 * (1 - t))
                b = 255
        elif self.colormap == "viridis":
            # Simplified viridis-like: purple -> teal -> yellow
            if norm < 0.5:
                t = norm * 2
                r = int(68 + (32 - 68) * t)
                g = int(1 + (145 - 1) * t)
                b = int(84 + (140 - 84) * t)
            else:
                t = (norm - 0.5) * 2
                r = int(32 + (253 - 32) * t)
                g = int(145 + (231 - 145) * t)
                b = int(140 + (37 - 140) * t)
        else:
            # Default: blue to red
            r = int(255 * norm)
            g = 0
            b = int(255 * (1 - norm))

        return f"#{r:02x}{g:02x}{b:02x}"

    def get_legend(self) -> list[ColorLegendItem]:
        return [
            ColorLegendItem(f"Low ({self.min_val:.1f})", self._value_to_color(0.0)),
            ColorLegendItem("Medium", self._value_to_color(0.5)),
            ColorLegendItem(f"High ({self.max_val:.1f})", self._value_to_color(1.0)),
        ]


class CustomScheme(ColorScheme):
    """Custom per-residue coloring."""

    name = "custom"
    description = "Custom per-residue colors"

    def __init__(self, residue_colors: dict[int, str] | None = None):
        """Initialize custom color scheme.

        Args:
            residue_colors: Dict mapping residue IDs to hex colors.
        """
        self.residue_colors = residue_colors or {}

    def set_residue_color(self, residue_id: int, color: str) -> None:
        """Set color for a specific residue.

        Args:
            residue_id: Residue ID.
            color: Hex color string.
        """
        self.residue_colors[residue_id] = color

    def set_residue_colors(self, colors: dict[int, str]) -> None:
        """Set colors for multiple residues.

        Args:
            colors: Dict mapping residue IDs to hex colors.
        """
        self.residue_colors.update(colors)

    def get_3dmol_style(self, metadata: dict[str, Any] | None = None) -> str:
        if not self.residue_colors:
            return "{cartoon: {color: 'spectrum'}}"

        js_map = "{"
        for res_id, color in self.residue_colors.items():
            js_map += f"{res_id}: '{color}',"
        js_map += "}"

        return f"""{{cartoon: {{
            colorfunc: function(atom) {{
                var colorMap = {js_map};
                return colorMap[atom.resi] || '#808080';
            }}
        }}}}"""

    def get_legend(self) -> list[ColorLegendItem]:
        return [ColorLegendItem("Custom colors", "#808080")]


# Registry of available color schemes
COLOR_SCHEMES: dict[str, type[ColorScheme]] = {
    "spectrum": SpectrumScheme,
    "chain": ChainScheme,
    "secondary_structure": SecondaryStructureScheme,
    "b_factor": BFactorScheme,
    "hydrophobicity": HydrophobicityScheme,
}


def get_color_scheme(name: str, chain_ids: list[str] | None = None) -> ColorScheme:
    """Get a color scheme instance by name.

    Args:
        name: Color scheme name.
        chain_ids: Optional chain IDs for chain scheme legend.

    Returns:
        ColorScheme instance.

    Raises:
        ValueError: If scheme name is not recognized.
    """
    if name not in COLOR_SCHEMES:
        raise ValueError(f"Unknown color scheme: {name}. Available: {list(COLOR_SCHEMES.keys())}")

    scheme_class = COLOR_SCHEMES[name]
    if name == "chain" and chain_ids:
        return scheme_class(chain_ids=chain_ids)
    return scheme_class()


def get_available_schemes() -> list[str]:
    """Get list of available color scheme names.

    Returns:
        List of scheme names.
    """
    return list(COLOR_SCHEMES.keys())
