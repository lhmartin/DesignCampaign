"""Data models for protein metrics storage and loading."""

import csv
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator


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
        """Load metrics from a JSON file.

        Expected format:
        {
            "proteins": [
                {"name": "protein1", "metrics": {"metric1": 0.5, ...}},
                ...
            ]
        }
        Or a simple list:
        [
            {"name": "protein1", "metrics": {"metric1": 0.5, ...}},
            ...
        ]

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

        # Handle both formats
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

    def load_single_protein_json(self, file_path: str | Path, pdb_file_path: str | None = None) -> bool:
        """Load metrics from a single-protein JSON file (e.g., Boltz/AF2 output).

        This handles JSON files where metrics like pLDDT_score are at the root level,
        rather than in a nested structure.

        Expected fields (all optional):
        - sequence_name or job_id: Used as protein name if no pdb_file_path provided
        - pLDDT_score: Overall pLDDT score
        - confidence_score: Overall confidence
        - ptm, iptm: PAE/contact scores

        Args:
            file_path: Path to JSON file.
            pdb_file_path: Optional path to associated PDB file (used for name).

        Returns:
            True if successfully loaded, False if not a valid metrics file.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            return False

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return False

        # Must be a dict at root level
        if not isinstance(data, dict):
            return False

        # Check for expected metrics fields
        has_metrics = any(key in data for key in [
            "pLDDT_score", "confidence_score", "ptm", "iptm",
            "complex_plddt", "complex_pde"
        ])
        if not has_metrics:
            return False

        # Determine protein name
        if pdb_file_path:
            name = Path(pdb_file_path).stem
        else:
            name = data.get("sequence_name") or data.get("job_id") or file_path.stem

        # Extract metrics
        metrics = {}
        metric_keys = [
            ("pLDDT_score", "plddt"),
            ("confidence_score", "confidence"),
            ("ptm", "ptm"),
            ("iptm", "iptm"),
            ("complex_plddt", "complex_plddt"),
            ("complex_pde", "complex_pde"),
            ("complex_ipde", "complex_ipde"),
            ("complex_iplddt", "complex_iplddt"),
            ("ligand_iptm", "ligand_iptm"),
            ("protein_iptm", "protein_iptm"),
        ]

        for json_key, metric_name in metric_keys:
            if json_key in data and isinstance(data[json_key], (int, float)):
                metrics[metric_name] = float(data[json_key])

        if not metrics:
            return False

        protein = ProteinMetrics(
            name=name,
            file_path=pdb_file_path,
            metrics=metrics,
        )
        self.add_protein(protein)
        return True

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
