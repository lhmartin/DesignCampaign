"""Data models for protein metrics storage and loading."""

import csv
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)


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

        logger.info(f"Loaded {count} proteins from CSV: {file_path}")
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

        logger.info(f"Loaded {count} proteins from JSON: {file_path}")
        return count

    def load_single_protein_json(
        self,
        file_path: str | Path,
        pdb_file_path: str | None = None,
        num_residues: int | None = None,
    ) -> bool:
        """Load metrics from a single-protein JSON file by scanning for all numeric values.

        Generically scans the JSON file to find:
        - Scalar int/float values -> treated as global metrics
        - Lists of numbers -> if length matches num_residues, treated as per-residue
          metrics (stored as mean/min/max); otherwise stored as list length info

        Args:
            file_path: Path to JSON file.
            pdb_file_path: Optional path to associated PDB file (used for name).
            num_residues: Optional expected residue count for per-residue detection.

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

        # Determine protein name from known keys or filename
        if pdb_file_path:
            name = Path(pdb_file_path).stem
        else:
            name = (
                data.get("sequence_name")
                or data.get("job_id")
                or data.get("name")
                or file_path.stem
            )
            if not isinstance(name, str):
                name = file_path.stem

        # Recursively scan for all numeric values
        metrics: dict[str, float] = {}
        self._scan_json_for_metrics(data, "", metrics, num_residues)

        if not metrics:
            logger.debug(f"No numeric metrics found in {file_path}")
            return False

        logger.info(f"Loaded {len(metrics)} metrics from {file_path.name}: {list(metrics.keys())}")

        protein = ProteinMetrics(
            name=name,
            file_path=pdb_file_path,
            metrics=metrics,
        )
        self.add_protein(protein)
        return True

    def _scan_json_for_metrics(
        self,
        obj: Any,
        prefix: str,
        metrics: dict[str, float],
        num_residues: int | None = None,
        max_depth: int = 4,
    ) -> None:
        """Recursively scan a JSON object for numeric values.

        Args:
            obj: JSON object (dict, list, or scalar).
            prefix: Key prefix for nested values (e.g., "scores.plddt").
            metrics: Output dict to populate with metric_name -> value.
            num_residues: Expected residue count for per-residue detection.
            max_depth: Maximum nesting depth to prevent deep recursion.
        """
        if max_depth <= 0:
            return

        # Skip known non-metric keys
        _skip_keys = {"name", "sequence_name", "job_id", "file_path", "version", "date"}

        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in _skip_keys:
                    continue
                # Build a readable metric name
                metric_key = f"{prefix}.{key}" if prefix else key
                self._scan_json_for_metrics(
                    value, metric_key, metrics, num_residues, max_depth - 1
                )

        elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
            # Scalar numeric value -> global metric
            metrics[prefix] = float(obj)

        elif isinstance(obj, list) and len(obj) > 0:
            # Check if list is all numeric
            if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in obj):
                float_vals = [float(v) for v in obj]
                # Determine if per-residue or some other array
                is_per_residue = (
                    num_residues is not None
                    and len(float_vals) == num_residues
                )
                label = prefix
                if is_per_residue:
                    label = f"{prefix}(per_res)"
                # Store summary statistics for numeric arrays
                metrics[f"{label}_mean"] = sum(float_vals) / len(float_vals)
                metrics[f"{label}_min"] = min(float_vals)
                metrics[f"{label}_max"] = max(float_vals)

            # Check if list is all dicts (e.g. complex_pae_scores chain-pair metrics)
            elif all(isinstance(v, dict) for v in obj):
                self._scan_dict_list_for_metrics(
                    obj, prefix, metrics, num_residues, max_depth - 1
                )

    # Known keys used to label entries in a list of dicts (chain pairs, etc.)
    _LABEL_KEY_PAIRS = [("chain1", "chain2"), ("chain_1", "chain_2")]
    _LABEL_SINGLE_KEYS = ["chain", "name", "label", "id", "type"]

    def _scan_dict_list_for_metrics(
        self,
        items: list[dict],
        prefix: str,
        metrics: dict[str, float],
        num_residues: int | None = None,
        max_depth: int = 3,
    ) -> None:
        """Extract metrics from a list of dicts (e.g. chain-pair scores).

        For each dict, creates labeled metrics using chain pair identifiers
        or list index as a suffix. Also computes aggregate stats (max) for
        each numeric field across all entries.

        Args:
            items: List of dict objects.
            prefix: Key prefix for metric names.
            metrics: Output dict to populate.
            num_residues: Expected residue count for per-residue detection.
            max_depth: Maximum remaining nesting depth.
        """
        if max_depth <= 0 or not items:
            return

        # Collect per-field numeric values for aggregation
        field_values: dict[str, list[float]] = {}

        for idx, item in enumerate(items):
            # Determine a label for this entry
            label = self._get_dict_label(item, idx)
            item_prefix = f"{prefix}.{label}" if prefix else label

            for key, value in item.items():
                # Skip the label keys themselves
                if key in ("chain1", "chain2", "chain_1", "chain_2",
                           "chain", "name", "label", "id", "type"):
                    continue

                metric_key = f"{item_prefix}.{key}" if item_prefix else key

                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    fval = float(value)
                    metrics[metric_key] = fval
                    # Track for aggregation
                    field_values.setdefault(key, []).append(fval)
                elif isinstance(value, dict):
                    self._scan_json_for_metrics(
                        value, metric_key, metrics, num_residues, max_depth - 1
                    )

        # Aggregate stats across all entries (useful for multi-chain complexes)
        if len(items) > 1:
            for field_name, values in field_values.items():
                agg_prefix = f"{prefix}.{field_name}" if prefix else field_name
                metrics[f"{agg_prefix}_max"] = max(values)
                metrics[f"{agg_prefix}_min"] = min(values)
                if len(values) > 0:
                    metrics[f"{agg_prefix}_mean"] = sum(values) / len(values)

    def _get_dict_label(self, item: dict, index: int) -> str:
        """Get a human-readable label for a dict entry in a list.

        Checks for chain pair keys (chain1/chain2) or single label keys,
        falling back to the list index.

        Args:
            item: Dict to label.
            index: Position in the list.

        Returns:
            Label string (e.g. "A_B", "chainA", or "0").
        """
        # Check chain-pair keys
        for k1, k2 in self._LABEL_KEY_PAIRS:
            if k1 in item and k2 in item:
                return f"{item[k1]}_{item[k2]}"

        # Check single label keys
        for key in self._LABEL_SINGLE_KEYS:
            if key in item and isinstance(item[key], str):
                return item[key]

        return str(index)

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
