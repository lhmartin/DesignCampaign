"""Data models for protein metrics storage and loading."""

import csv
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator


# Boltz JSON format metrics that can be extracted
BOLTZ_METRICS = {
    "pLDDT_score": "Overall pLDDT confidence score",
    "confidence_score": "Overall confidence score",
    "ptm": "Predicted TM-score",
    "iptm": "Interface predicted TM-score",
    "ligand_iptm": "Ligand interface pTM",
    "protein_iptm": "Protein interface pTM",
    "complex_plddt": "Complex pLDDT score",
    "complex_iplddt": "Complex interface pLDDT",
    "complex_pde": "Complex PDE score",
    "complex_ipde": "Complex interface PDE",
}

# Default metrics to import from Boltz format
DEFAULT_BOLTZ_METRICS = ["pLDDT_score", "ptm", "iptm", "confidence_score"]


@dataclass
class ProteinMetrics:
    """Metrics data for a single protein.

    Attributes:
        name: Protein identifier (usually filename without extension).
        file_path: Optional path to the structure file.
        metrics: Dict of metric_name -> value.
    """

    name: str
    file_path: str | None = None
    metrics: dict[str, float] = field(default_factory=dict)

    def get_metric(self, name: str, default: float | None = None) -> float | None:
        """Get a metric value by name.

        Args:
            name: Metric name.
            default: Default value if metric not found.

        Returns:
            Metric value or default.
        """
        return self.metrics.get(name, default)

    def set_metric(self, name: str, value: float) -> None:
        """Set a metric value.

        Args:
            name: Metric name.
            value: Metric value.
        """
        self.metrics[name] = value

    def has_metric(self, name: str) -> bool:
        """Check if a metric exists.

        Args:
            name: Metric name.

        Returns:
            True if metric exists.
        """
        return name in self.metrics

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns:
            Dict with name, file_path, and metrics.
        """
        return {
            "name": self.name,
            "file_path": self.file_path,
            "metrics": self.metrics.copy(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProteinMetrics":
        """Create from dictionary representation.

        Args:
            data: Dict with name, file_path, and metrics.

        Returns:
            ProteinMetrics instance.
        """
        return cls(
            name=data["name"],
            file_path=data.get("file_path"),
            metrics=data.get("metrics", {}),
        )


class MetricsStore:
    """Storage for metrics of multiple proteins.

    Provides loading from CSV/JSON and filtering/sorting capabilities.
    """

    def __init__(self):
        """Initialize empty metrics store."""
        self._proteins: dict[str, ProteinMetrics] = {}
        self._metric_names: set[str] = set()

    def add_protein(self, protein: ProteinMetrics) -> None:
        """Add or update a protein's metrics.

        Args:
            protein: ProteinMetrics instance.
        """
        self._proteins[protein.name] = protein
        self._metric_names.update(protein.metrics.keys())

    def get_protein(self, name: str) -> ProteinMetrics | None:
        """Get a protein by name.

        Args:
            name: Protein name.

        Returns:
            ProteinMetrics or None if not found.
        """
        return self._proteins.get(name)

    def remove_protein(self, name: str) -> bool:
        """Remove a protein from the store.

        Args:
            name: Protein name.

        Returns:
            True if removed, False if not found.
        """
        if name in self._proteins:
            del self._proteins[name]
            self._refresh_metric_names()
            return True
        return False

    def clear(self) -> None:
        """Clear all proteins from the store."""
        self._proteins.clear()
        self._metric_names.clear()

    def _refresh_metric_names(self) -> None:
        """Refresh the set of metric names from all proteins."""
        self._metric_names.clear()
        for protein in self._proteins.values():
            self._metric_names.update(protein.metrics.keys())

    @property
    def protein_names(self) -> list[str]:
        """Get sorted list of protein names."""
        return sorted(self._proteins.keys())

    @property
    def metric_names(self) -> list[str]:
        """Get sorted list of all metric names."""
        return sorted(self._metric_names)

    @property
    def count(self) -> int:
        """Get number of proteins in store."""
        return len(self._proteins)

    def __len__(self) -> int:
        return len(self._proteins)

    def __iter__(self) -> Iterator[ProteinMetrics]:
        return iter(self._proteins.values())

    def __contains__(self, name: str) -> bool:
        return name in self._proteins

    # Filtering methods

    def filter_by_name(self, pattern: str) -> list[ProteinMetrics]:
        """Filter proteins by name pattern (case-insensitive contains).

        Args:
            pattern: Search pattern.

        Returns:
            List of matching proteins.
        """
        pattern_lower = pattern.lower()
        return [
            p for p in self._proteins.values()
            if pattern_lower in p.name.lower()
        ]

    def filter_by_metric_range(
        self,
        metric_name: str,
        min_val: float | None = None,
        max_val: float | None = None,
    ) -> list[ProteinMetrics]:
        """Filter proteins by metric value range.

        Args:
            metric_name: Name of the metric.
            min_val: Minimum value (inclusive), or None for no minimum.
            max_val: Maximum value (inclusive), or None for no maximum.

        Returns:
            List of proteins within the range.
        """
        results = []
        for protein in self._proteins.values():
            value = protein.get_metric(metric_name)
            if value is None:
                continue
            if min_val is not None and value < min_val:
                continue
            if max_val is not None and value > max_val:
                continue
            results.append(protein)
        return results

    def filter_by_metrics(
        self,
        filters: dict[str, tuple[float | None, float | None]],
    ) -> list[ProteinMetrics]:
        """Filter proteins by multiple metric ranges.

        Args:
            filters: Dict of metric_name -> (min_val, max_val) tuples.

        Returns:
            List of proteins matching all filters.
        """
        results = list(self._proteins.values())
        for metric_name, (min_val, max_val) in filters.items():
            results = [
                p for p in results
                if self._matches_range(p.get_metric(metric_name), min_val, max_val)
            ]
        return results

    def _matches_range(
        self,
        value: float | None,
        min_val: float | None,
        max_val: float | None,
    ) -> bool:
        """Check if a value matches a range."""
        if value is None:
            return False
        if min_val is not None and value < min_val:
            return False
        if max_val is not None and value > max_val:
            return False
        return True

    # Sorting methods

    def get_sorted(
        self,
        sort_by: str = "name",
        ascending: bool = True,
    ) -> list[ProteinMetrics]:
        """Get proteins sorted by a column.

        Args:
            sort_by: Column to sort by ('name' or metric name).
            ascending: Sort in ascending order.

        Returns:
            Sorted list of proteins.
        """
        proteins = list(self._proteins.values())

        if sort_by == "name":
            proteins.sort(key=lambda p: p.name.lower(), reverse=not ascending)
        else:
            # Sort by metric value, None values go to end
            def sort_key(p: ProteinMetrics):
                val = p.get_metric(sort_by)
                if val is None:
                    return (1, 0)  # None values sort after real values
                return (0, val)

            proteins.sort(key=sort_key, reverse=not ascending)

        return proteins

    # I/O methods

    def load_csv(self, file_path: str | Path) -> int:
        """Load metrics from a CSV file.

        Expected format:
        - First column is protein name
        - Subsequent columns are metrics
        - First row is header with column names

        Args:
            file_path: Path to CSV file.

        Returns:
            Number of proteins loaded.

        Raises:
            FileNotFoundError: If file doesn't exist.
            ValueError: If CSV format is invalid.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        count = 0
        with open(file_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            if not reader.fieldnames:
                raise ValueError("CSV file has no headers")

            # First column is protein name
            name_col = reader.fieldnames[0]
            metric_cols = reader.fieldnames[1:]

            for row in reader:
                name = row.get(name_col, "").strip()
                if not name:
                    continue

                metrics = {}
                for col in metric_cols:
                    val_str = row.get(col, "").strip()
                    if val_str:
                        try:
                            metrics[col] = float(val_str)
                        except ValueError:
                            pass  # Skip non-numeric values

                protein = ProteinMetrics(name=name, metrics=metrics)
                self.add_protein(protein)
                count += 1

        return count

    def load_json(self, file_path: str | Path) -> int:
        """Load metrics from a JSON file with auto-format detection.

        Supports two formats:
        1. Standard format:
           {"proteins": [{"name": "...", "metrics": {...}}, ...]}
           or [{"name": "...", "metrics": {...}}, ...]

        2. Boltz format (single protein):
           {"sequence_name": "...", "pLDDT_score": ..., ...}

        Args:
            file_path: Path to JSON file.

        Returns:
            Number of proteins loaded.

        Raises:
            FileNotFoundError: If file doesn't exist.
            ValueError: If JSON format is invalid.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Auto-detect format
        if self._is_boltz_format(data):
            return self._load_boltz_data(data, file_path)

        # Handle standard format
        if isinstance(data, dict):
            proteins_data = data.get("proteins", [])
        elif isinstance(data, list):
            proteins_data = data
        else:
            raise ValueError("Invalid JSON format: expected object or array")

        count = 0
        for item in proteins_data:
            if not isinstance(item, dict):
                continue
            name = item.get("name", "").strip()
            if not name:
                continue

            metrics = {}
            metrics_data = item.get("metrics", {})
            if isinstance(metrics_data, dict):
                for k, v in metrics_data.items():
                    if isinstance(v, (int, float)):
                        metrics[k] = float(v)

            protein = ProteinMetrics(
                name=name,
                file_path=item.get("file_path"),
                metrics=metrics,
            )
            self.add_protein(protein)
            count += 1

        return count

    @staticmethod
    def _is_boltz_format(data: Any) -> bool:
        """Check if data is in Boltz JSON format.

        Args:
            data: Parsed JSON data.

        Returns:
            True if data appears to be Boltz format.
        """
        if not isinstance(data, dict):
            return False
        # Boltz format has sequence_name and pLDDT_score
        return "sequence_name" in data and "pLDDT_score" in data

    def _load_boltz_data(
        self,
        data: dict,
        file_path: Path,
        metrics_to_extract: list[str] | None = None,
    ) -> int:
        """Load metrics from Boltz format data.

        Args:
            data: Parsed Boltz JSON data.
            file_path: Path to the JSON file.
            metrics_to_extract: List of metric names to extract, or None for defaults.

        Returns:
            Number of proteins loaded (0 or 1).
        """
        if metrics_to_extract is None:
            metrics_to_extract = DEFAULT_BOLTZ_METRICS

        name = data.get("sequence_name", "").strip()
        if not name:
            # Fall back to filename without extension
            name = file_path.stem

        metrics = {}
        for metric_name in metrics_to_extract:
            if metric_name in data:
                value = data[metric_name]
                if isinstance(value, (int, float)):
                    metrics[metric_name] = float(value)

        # Also extract chain-specific PTM scores if available
        chains_ptm = data.get("chains_ptm", {})
        if isinstance(chains_ptm, dict):
            for chain_id, ptm_value in chains_ptm.items():
                if isinstance(ptm_value, (int, float)):
                    metrics[f"ptm_chain_{chain_id}"] = float(ptm_value)

        # Get associated PDB file path if available
        pdb_file = data.get("file")
        if pdb_file and isinstance(pdb_file, str):
            # Check if local file exists
            local_pdb = file_path.parent / f"{name}.pdb"
            if local_pdb.exists():
                pdb_file = str(local_pdb)

        protein = ProteinMetrics(
            name=name,
            file_path=pdb_file if pdb_file else None,
            metrics=metrics,
        )
        self.add_protein(protein)
        return 1

    def load_boltz_json(
        self,
        file_path: str | Path,
        metrics_to_extract: list[str] | None = None,
    ) -> int:
        """Load metrics from a single Boltz JSON file.

        Args:
            file_path: Path to Boltz JSON file.
            metrics_to_extract: List of metric names to extract, or None for defaults.

        Returns:
            Number of proteins loaded (0 or 1).

        Raises:
            FileNotFoundError: If file doesn't exist.
            ValueError: If not a valid Boltz JSON file.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not self._is_boltz_format(data):
            raise ValueError(f"Not a valid Boltz JSON file: {file_path}")

        return self._load_boltz_data(data, file_path, metrics_to_extract)

    def load_boltz_folder(
        self,
        folder_path: str | Path,
        metrics_to_extract: list[str] | None = None,
    ) -> int:
        """Load metrics from all Boltz JSON files in a folder.

        Args:
            folder_path: Path to folder containing Boltz JSON files.
            metrics_to_extract: List of metric names to extract, or None for defaults.

        Returns:
            Number of proteins loaded.

        Raises:
            FileNotFoundError: If folder doesn't exist.
        """
        folder_path = Path(folder_path)
        if not folder_path.exists():
            raise FileNotFoundError(f"Folder not found: {folder_path}")
        if not folder_path.is_dir():
            raise ValueError(f"Not a directory: {folder_path}")

        count = 0
        for json_file in folder_path.glob("*.json"):
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if self._is_boltz_format(data):
                    count += self._load_boltz_data(data, json_file, metrics_to_extract)
            except (json.JSONDecodeError, IOError):
                # Skip files that can't be read
                continue

        return count

    @staticmethod
    def get_boltz_metrics_info() -> dict[str, str]:
        """Get information about available Boltz metrics.

        Returns:
            Dict mapping metric names to descriptions.
        """
        return BOLTZ_METRICS.copy()

    @staticmethod
    def get_default_boltz_metrics() -> list[str]:
        """Get default list of metrics to extract from Boltz files.

        Returns:
            List of metric names.
        """
        return DEFAULT_BOLTZ_METRICS.copy()

    @staticmethod
    def detect_boltz_metrics(file_path: str | Path) -> list[str]:
        """Detect available metrics in a Boltz JSON file.

        Args:
            file_path: Path to Boltz JSON file.

        Returns:
            List of available metric names.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            return []

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError):
            return []

        if not isinstance(data, dict):
            return []

        available = []
        for metric_name in BOLTZ_METRICS:
            if metric_name in data and isinstance(data[metric_name], (int, float)):
                available.append(metric_name)

        # Also check for chain-specific PTM
        chains_ptm = data.get("chains_ptm", {})
        if isinstance(chains_ptm, dict):
            for chain_id in chains_ptm:
                available.append(f"ptm_chain_{chain_id}")

        return available

    def save_csv(self, file_path: str | Path) -> None:
        """Save metrics to a CSV file.

        Args:
            file_path: Path to output CSV file.
        """
        file_path = Path(file_path)
        metric_names = self.metric_names

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            # Header
            writer.writerow(["name"] + metric_names)

            # Data rows
            for protein in self.get_sorted("name"):
                row = [protein.name]
                for metric in metric_names:
                    val = protein.get_metric(metric)
                    row.append(f"{val:.4f}" if val is not None else "")
                writer.writerow(row)

    def save_json(self, file_path: str | Path) -> None:
        """Save metrics to a JSON file.

        Args:
            file_path: Path to output JSON file.
        """
        file_path = Path(file_path)

        data = {
            "proteins": [p.to_dict() for p in self.get_sorted("name")]
        }

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_metric_stats(self, metric_name: str) -> dict[str, float | None]:
        """Get statistics for a metric across all proteins.

        Args:
            metric_name: Name of the metric.

        Returns:
            Dict with 'min', 'max', 'mean', 'count' keys.
        """
        values = [
            p.get_metric(metric_name)
            for p in self._proteins.values()
            if p.has_metric(metric_name)
        ]

        if not values:
            return {"min": None, "max": None, "mean": None, "count": 0}

        return {
            "min": min(values),
            "max": max(values),
            "mean": sum(values) / len(values),
            "count": len(values),
        }
