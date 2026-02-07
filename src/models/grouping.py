"""Data model for structure grouping and target designation."""

import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from scipy.spatial import cKDTree

if TYPE_CHECKING:
    from src.models.protein import Protein

logger = logging.getLogger(__name__)


# Cache version - increment when hash algorithm changes
CACHE_VERSION = 1


@dataclass
class StructureGroup:
    """A group of structures sharing a common property.

    Attributes:
        id: Unique group ID.
        name: Display name for the group.
        group_type: Type of grouping ("sequence", "target", or "custom").
        key: Grouping key (sequence hash, target designation hash, or custom key).
        members: File paths of member structures.
        metadata: Additional info (chain composition, sequence preview, etc.).
        is_custom: Whether this is a user-created custom group.
    """

    id: str
    name: str
    group_type: str  # "sequence", "target", or "custom"
    key: str
    members: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    is_custom: bool = False

    @property
    def count(self) -> int:
        """Get the number of members in the group."""
        return len(self.members)

    def add_member(self, file_path: str) -> bool:
        """Add a member to the group.

        Args:
            file_path: Path to the structure file.

        Returns:
            True if added (was not already a member).
        """
        if file_path not in self.members:
            self.members.append(file_path)
            return True
        return False

    def remove_member(self, file_path: str) -> bool:
        """Remove a member from the group.

        Args:
            file_path: Path to the structure file.

        Returns:
            True if removed (was a member).
        """
        if file_path in self.members:
            self.members.remove(file_path)
            return True
        return False


@dataclass
class SequenceHashCache:
    """Cached sequence hash for a protein file.

    Attributes:
        file_path: Path to the protein file.
        mtime: File modification time when hash was computed.
        hash_key: The computed sequence hash.
        chains: List of chain IDs.
        num_residues: Total number of residues.
        sequence_preview: First 30 characters of sequence.
    """

    file_path: str
    mtime: float
    hash_key: str
    chains: list[str]
    num_residues: int
    sequence_preview: str
    version: int = CACHE_VERSION


@dataclass
class TargetDesignation:
    """User designation of target vs binder chains for a structure.

    Attributes:
        file_path: Path to the structure file.
        target_chains: Chain IDs designated as target.
        binder_chains: Chain IDs designated as binder.
    """

    file_path: str
    target_chains: list[str] = field(default_factory=list)
    binder_chains: list[str] = field(default_factory=list)

    def get_target_sequence_key(self, protein: "Protein") -> str | None:
        """Get a sequence key for the target chains.

        Args:
            protein: Protein instance to get sequence from.

        Returns:
            Hash of target chain sequences, or None if no targets designated.
        """
        if not self.target_chains:
            return None

        sequence = protein.get_sequence()
        target_seqs = []

        for chain in sorted(self.target_chains):
            chain_seq = "".join(
                r["one_letter"]
                for r in sequence
                if r["chain"] == chain
            )
            if chain_seq:
                target_seqs.append(f"{chain}:{chain_seq}")

        if not target_seqs:
            return None

        combined = "|".join(target_seqs)
        return hashlib.md5(combined.encode()).hexdigest()[:12]


class GroupingManager:
    """Manages structure groups and target designations.

    Provides methods for:
    - Grouping proteins by exact sequence match
    - Grouping proteins by designated target sequences
    - Managing target/binder designations
    - Finding binders that contact specific target residues
    - Creating custom named groups
    - Searching structures by chain sequence
    """

    def __init__(self):
        """Initialize the grouping manager."""
        self._sequence_groups: dict[str, StructureGroup] = {}
        self._target_groups: dict[str, StructureGroup] = {}
        self._custom_groups: dict[str, StructureGroup] = {}
        self._designations: dict[str, TargetDesignation] = {}
        self._proteins: dict[str, "Protein"] = {}  # Cache for loaded proteins
        self._hash_cache: dict[str, SequenceHashCache] = {}  # Sequence hash cache
        self._chain_index: dict[str, set[str]] = {}  # chain_hash -> set of file_paths

    def clear(self) -> None:
        """Clear all groups and designations."""
        self._sequence_groups.clear()
        self._target_groups.clear()
        self._custom_groups.clear()
        self._designations.clear()
        self._proteins.clear()
        self._hash_cache.clear()
        self._chain_index.clear()

    def register_protein(self, file_path: str, protein: "Protein") -> None:
        """Register a protein for grouping.

        Args:
            file_path: Path to the protein file.
            protein: Loaded Protein instance.
        """
        self._proteins[file_path] = protein

    def unregister_protein(self, file_path: str) -> None:
        """Unregister a protein.

        Args:
            file_path: Path to the protein file to unregister.
        """
        self._proteins.pop(file_path, None)
        # Also remove from hash cache and chain index
        if file_path in self._hash_cache:
            cached = self._hash_cache.pop(file_path)
            # Remove from chain index
            for chain_hash in self._get_chain_hashes_from_cache(cached):
                if chain_hash in self._chain_index:
                    self._chain_index[chain_hash].discard(file_path)

    def _get_chain_hashes_from_cache(self, cache: SequenceHashCache) -> list[str]:
        """Get individual chain hashes from cached data.

        This is used for chain index cleanup.
        """
        # The cache stores the full hash, not individual chains
        # We'd need to recompute from protein, so just return empty for cleanup
        return []

    def _get_cache_path(self, file_path: str) -> Path:
        """Get the cache file path for a protein file.

        Args:
            file_path: Path to the protein file.

        Returns:
            Path to the cache file (.seqhash.json).
        """
        p = Path(file_path)
        return p.parent / f".{p.name}.seqhash.json"

    def _load_hash_cache(self, file_path: str) -> SequenceHashCache | None:
        """Load cached sequence hash for a file.

        Args:
            file_path: Path to the protein file.

        Returns:
            Cached hash data if valid, None otherwise.
        """
        # Check memory cache first
        if file_path in self._hash_cache:
            cached = self._hash_cache[file_path]
            # Verify file hasn't changed
            try:
                mtime = Path(file_path).stat().st_mtime
                if cached.mtime == mtime and cached.version == CACHE_VERSION:
                    return cached
            except OSError:
                pass

        # Check disk cache
        cache_path = self._get_cache_path(file_path)
        if cache_path.exists():
            try:
                with open(cache_path, "r") as f:
                    data = json.load(f)

                # Verify cache version and mtime
                mtime = Path(file_path).stat().st_mtime
                if (
                    data.get("version") == CACHE_VERSION
                    and data.get("mtime") == mtime
                ):
                    cached = SequenceHashCache(
                        file_path=file_path,
                        mtime=data["mtime"],
                        hash_key=data["hash_key"],
                        chains=data["chains"],
                        num_residues=data["num_residues"],
                        sequence_preview=data["sequence_preview"],
                        version=data["version"],
                    )
                    self._hash_cache[file_path] = cached
                    return cached
            except (json.JSONDecodeError, KeyError, OSError) as e:
                logger.debug(f"Failed to load hash cache for {file_path}: {e}")

        return None

    def _save_hash_cache(self, cache: SequenceHashCache) -> None:
        """Save sequence hash cache to disk.

        Args:
            cache: Cache data to save.
        """
        # Store in memory cache
        self._hash_cache[cache.file_path] = cache

        # Save to disk
        cache_path = self._get_cache_path(cache.file_path)
        try:
            data = {
                "version": cache.version,
                "mtime": cache.mtime,
                "hash_key": cache.hash_key,
                "chains": cache.chains,
                "num_residues": cache.num_residues,
                "sequence_preview": cache.sequence_preview,
            }
            with open(cache_path, "w") as f:
                json.dump(data, f)
        except OSError as e:
            logger.debug(f"Failed to save hash cache for {cache.file_path}: {e}")

    def get_or_compute_sequence_hash(
        self, file_path: str, protein: "Protein | None" = None
    ) -> tuple[str, dict] | None:
        """Get or compute sequence hash for a file.

        Uses caching to avoid recomputing for unchanged files.

        Args:
            file_path: Path to the protein file.
            protein: Optional loaded Protein instance.

        Returns:
            Tuple of (hash_key, metadata_dict) or None if failed.
        """
        # Try cache first
        cached = self._load_hash_cache(file_path)
        if cached is not None:
            return cached.hash_key, {
                "chains": cached.chains,
                "num_residues": cached.num_residues,
                "sequence_preview": cached.sequence_preview,
            }

        # Need to compute - load protein if not provided
        if protein is None:
            if file_path in self._proteins:
                protein = self._proteins[file_path]
            else:
                # Caller should load the protein
                return None

        # Compute hash
        try:
            hash_key = self._get_sequence_key(protein)
            chains = protein.get_chains()
            num_residues = protein.get_num_residues()
            preview = self._get_sequence_preview(protein)
            mtime = Path(file_path).stat().st_mtime

            # Save to cache
            cache = SequenceHashCache(
                file_path=file_path,
                mtime=mtime,
                hash_key=hash_key,
                chains=chains,
                num_residues=num_residues,
                sequence_preview=preview,
            )
            self._save_hash_cache(cache)

            return hash_key, {
                "chains": chains,
                "num_residues": num_residues,
                "sequence_preview": preview,
            }
        except Exception as e:
            logger.warning(f"Failed to compute sequence hash for {file_path}: {e}")
            return None

    def _index_chain_sequence(
        self, file_path: str, protein: "Protein", chain_id: str
    ) -> str:
        """Index a single chain's sequence and return its hash.

        Args:
            file_path: Path to the protein file.
            protein: Loaded Protein instance.
            chain_id: Chain ID to index.

        Returns:
            Hash of the chain sequence.
        """
        sequence = protein.get_sequence()
        chain_seq = "".join(
            r["one_letter"] for r in sequence if r["chain"] == chain_id
        )
        chain_hash = hashlib.md5(f"{chain_id}:{chain_seq}".encode()).hexdigest()[:12]

        # Add to chain index
        if chain_hash not in self._chain_index:
            self._chain_index[chain_hash] = set()
        self._chain_index[chain_hash].add(file_path)

        return chain_hash

    def find_structures_with_chain_sequence(
        self,
        reference_protein: "Protein",
        chain_id: str,
        file_paths: list[str] | None = None,
    ) -> list[str]:
        """Find structures that have a chain with the same sequence.

        Args:
            reference_protein: Protein with the reference chain.
            chain_id: Chain ID to match.
            file_paths: Optional list of file paths to search (uses all registered if None).

        Returns:
            List of file paths with matching chain sequence.
        """
        # Get reference chain sequence
        sequence = reference_protein.get_sequence()
        chain_seq = "".join(
            r["one_letter"] for r in sequence if r["chain"] == chain_id
        )
        if not chain_seq:
            return []

        target_hash = hashlib.md5(f"{chain_id}:{chain_seq}".encode()).hexdigest()[:12]

        # Check chain index first
        if target_hash in self._chain_index:
            matches = list(self._chain_index[target_hash])
            if file_paths is not None:
                matches = [p for p in matches if p in file_paths]
            return matches

        # Fall back to scanning registered proteins
        matches = []
        search_paths = file_paths if file_paths is not None else list(self._proteins.keys())

        for file_path in search_paths:
            protein = self._proteins.get(file_path)
            if protein is None:
                continue

            seq = protein.get_sequence()
            for test_chain in protein.get_chains():
                test_seq = "".join(r["one_letter"] for r in seq if r["chain"] == test_chain)
                if test_seq == chain_seq:
                    matches.append(file_path)
                    break

        return matches

    def _get_sequence_key(self, protein: "Protein") -> str:
        """Generate a unique key based on exact chain sequences.

        Args:
            protein: Protein instance.

        Returns:
            Hash string representing the protein's chain sequences.
        """
        sequence = protein.get_sequence()

        # Group residues by chain
        chains: dict[str, list[str]] = {}
        for res in sequence:
            chain = res["chain"]
            if chain not in chains:
                chains[chain] = []
            chains[chain].append(res["one_letter"])

        # Create sorted key from (chain_id, sequence) pairs
        chain_seqs = []
        for chain_id in sorted(chains.keys()):
            seq = "".join(chains[chain_id])
            chain_seqs.append(f"{chain_id}:{seq}")

        combined = "|".join(chain_seqs)
        return hashlib.md5(combined.encode()).hexdigest()[:12]

    def _get_sequence_preview(self, protein: "Protein", max_len: int = 30) -> str:
        """Get a short preview of the sequence for display.

        Args:
            protein: Protein instance.
            max_len: Maximum length of preview.

        Returns:
            Truncated sequence string.
        """
        sequence = protein.get_sequence()
        seq_str = "".join(r["one_letter"] for r in sequence[:max_len])
        if len(sequence) > max_len:
            seq_str += "..."
        return seq_str

    def compute_sequence_groups(
        self, proteins: list[tuple[str, "Protein"]]
    ) -> list[StructureGroup]:
        """Group proteins by exact chain sequences.

        Args:
            proteins: List of (file_path, Protein) tuples.

        Returns:
            List of StructureGroup instances.
        """
        self._sequence_groups.clear()

        # Map sequence keys to protein file paths
        key_to_paths: dict[str, list[str]] = {}
        key_metadata: dict[str, dict] = {}

        for file_path, protein in proteins:
            self._proteins[file_path] = protein
            key = self._get_sequence_key(protein)

            if key not in key_to_paths:
                key_to_paths[key] = []
                # Store metadata from first protein
                chains = protein.get_chains()
                num_residues = protein.get_num_residues()
                preview = self._get_sequence_preview(protein)
                key_metadata[key] = {
                    "chains": chains,
                    "num_residues": num_residues,
                    "sequence_preview": preview,
                }

            key_to_paths[key].append(file_path)

        # Create groups
        groups = []
        for i, (key, paths) in enumerate(sorted(key_to_paths.items())):
            metadata = key_metadata[key]
            chain_str = ", ".join(metadata["chains"])
            name = f"Sequence Group {i + 1} ({len(paths)} structures)"

            group = StructureGroup(
                id=f"seq_{key}",
                name=name,
                group_type="sequence",
                key=key,
                members=paths,
                metadata={
                    **metadata,
                    "chain_str": chain_str,
                },
            )
            self._sequence_groups[key] = group
            groups.append(group)

        logger.debug(f"Computed {len(groups)} sequence groups from {len(proteins)} proteins")
        return groups

    def compute_target_groups(self) -> list[StructureGroup]:
        """Group proteins by designated target sequence.

        Only includes proteins with target designations.

        Returns:
            List of StructureGroup instances grouped by target.
        """
        self._target_groups.clear()

        # Map target sequence keys to protein file paths
        key_to_paths: dict[str, list[str]] = {}
        key_metadata: dict[str, dict] = {}

        for file_path, designation in self._designations.items():
            if file_path not in self._proteins:
                continue

            protein = self._proteins[file_path]
            target_key = designation.get_target_sequence_key(protein)

            if not target_key:
                continue

            if target_key not in key_to_paths:
                key_to_paths[target_key] = []
                # Store metadata from first protein
                key_metadata[target_key] = {
                    "target_chains": designation.target_chains.copy(),
                }

            key_to_paths[target_key].append(file_path)

        # Create groups
        groups = []
        for i, (key, paths) in enumerate(sorted(key_to_paths.items())):
            metadata = key_metadata[key]
            target_str = ", ".join(metadata["target_chains"])
            name = f"Target {target_str} ({len(paths)} binders)"

            group = StructureGroup(
                id=f"target_{key}",
                name=name,
                group_type="target",
                key=key,
                members=paths,
                metadata=metadata,
            )
            self._target_groups[key] = group
            groups.append(group)

        logger.debug(f"Computed {len(groups)} target groups from {len(self._designations)} designations")
        return groups

    def set_target_designation(
        self,
        file_path: str,
        target_chains: list[str],
        binder_chains: list[str],
    ) -> None:
        """Set which chains are target vs binder for a structure.

        Args:
            file_path: Path to the structure file.
            target_chains: Chain IDs designated as target.
            binder_chains: Chain IDs designated as binder.
        """
        self._designations[file_path] = TargetDesignation(
            file_path=file_path,
            target_chains=target_chains.copy(),
            binder_chains=binder_chains.copy(),
        )
        logger.debug(
            f"Set designation for {file_path}: "
            f"targets={target_chains}, binders={binder_chains}"
        )

    def get_target_designation(self, file_path: str) -> TargetDesignation | None:
        """Get target designation for a structure.

        Args:
            file_path: Path to the structure file.

        Returns:
            TargetDesignation if exists, None otherwise.
        """
        return self._designations.get(file_path)

    def remove_target_designation(self, file_path: str) -> None:
        """Remove target designation for a structure.

        Args:
            file_path: Path to the structure file.
        """
        self._designations.pop(file_path, None)

    def has_designation(self, file_path: str) -> bool:
        """Check if a structure has a target designation.

        Args:
            file_path: Path to the structure file.

        Returns:
            True if designation exists.
        """
        return file_path in self._designations

    def find_binders_contacting_residues(
        self,
        target_residues: list[tuple[str, int]],
        distance_cutoff: float = 4.0,
        file_paths: list[str] | None = None,
        min_target_contacts: int = 1,
    ) -> list[tuple[str, list[int], int]]:
        """Find binders that contact specific target residues.

        Uses KD-tree for efficient O(n log n) spatial queries instead of
        O(n*m) nested loops.

        If a structure has an explicit target/binder designation, that is used.
        Otherwise, chains mentioned in target_residues are treated as target
        chains and all other chains as potential binder chains.

        Args:
            target_residues: List of (chain_id, residue_id) tuples for target residues.
            distance_cutoff: Maximum distance (Angstroms) for contact.
            file_paths: Optional list of file paths to search. If None, searches
                all registered proteins.
            min_target_contacts: Minimum number of distinct target residues that
                must be contacted for a binder to be included in results.

        Returns:
            List of (file_path, [contacting_binder_residue_ids], target_residues_contacted)
            tuples, sorted by target residues contacted (descending), then by
            binder contact count.
        """
        if not target_residues:
            return []

        # Determine which chains the user specified as target
        specified_target_chains = set(chain_id for chain_id, _ in target_residues)

        # Determine which files to search
        search_paths = file_paths if file_paths is not None else list(self._proteins.keys())

        results: list[tuple[str, list[int], int]] = []

        for file_path in search_paths:
            if file_path not in self._proteins:
                continue

            protein = self._proteins[file_path]
            structure = protein.structure

            # Determine target/binder chains for this structure
            designation = self._designations.get(file_path)
            if designation:
                target_chains = set(designation.target_chains)
                binder_chains = set(designation.binder_chains)
            else:
                # Infer from the specified residues: chains in the query are
                # target, all other chains in the structure are binders
                all_chains = set(structure.chain_id)
                target_chains = specified_target_chains & all_chains
                binder_chains = all_chains - target_chains

            if not binder_chains:
                continue

            # Build per-target-residue coordinate arrays for tracking
            # which target residues are individually contacted
            per_target: list[tuple[tuple[str, int], np.ndarray]] = []
            all_target_coords_list = []
            for chain_id, res_id in target_residues:
                if chain_id not in target_chains:
                    continue

                mask = (
                    (structure.chain_id == chain_id) &
                    (structure.res_id == res_id)
                )
                atoms = structure[mask]
                if len(atoms) > 0:
                    coords = atoms.coord
                    per_target.append(((chain_id, res_id), coords))
                    all_target_coords_list.append(coords)

            if not all_target_coords_list:
                continue

            # Get binder atoms
            binder_mask = np.isin(structure.chain_id, list(binder_chains))
            binder_atoms = structure[binder_mask]

            if len(binder_atoms) == 0:
                continue

            binder_coords = binder_atoms.coord
            binder_tree = cKDTree(binder_coords)

            # Check which target residues are contacted by any binder atom
            contacted_target_residues = set()
            for target_key, target_coords in per_target:
                target_tree = cKDTree(target_coords)
                pairs = binder_tree.query_ball_tree(target_tree, distance_cutoff)
                if any(close for close in pairs):
                    contacted_target_residues.add(target_key)

            if len(contacted_target_residues) < min_target_contacts:
                continue

            # Collect binder residues that have contacts (using combined targets)
            all_target_coords = np.vstack(all_target_coords_list)
            all_target_tree = cKDTree(all_target_coords)
            pairs = binder_tree.query_ball_tree(all_target_tree, distance_cutoff)

            contacting_residues = set()
            for binder_idx, close_indices in enumerate(pairs):
                if close_indices:
                    contacting_residues.add(int(binder_atoms[binder_idx].res_id))

            if contacting_residues:
                results.append((
                    file_path,
                    sorted(contacting_residues),
                    len(contacted_target_residues),
                ))

        # Sort by target residues contacted (desc), then binder contacts (desc)
        results.sort(key=lambda x: (x[2], len(x[1])), reverse=True)
        return results

    def get_sequence_groups(self) -> list[StructureGroup]:
        """Get cached sequence groups.

        Returns:
            List of computed sequence groups.
        """
        return list(self._sequence_groups.values())

    def get_target_groups(self) -> list[StructureGroup]:
        """Get cached target groups.

        Returns:
            List of computed target groups.
        """
        return list(self._target_groups.values())

    @property
    def designation_count(self) -> int:
        """Get number of structures with target designations."""
        return len(self._designations)

    @property
    def registered_count(self) -> int:
        """Get number of registered proteins."""
        return len(self._proteins)

    def compute_binder_subgroups(self, target_group: StructureGroup) -> list[StructureGroup]:
        """Compute sub-groups within a target group by binder chain sequences.

        Structures with identical binder sequences (same complex, different
        folding models) are grouped together.

        Args:
            target_group: A target group to sub-divide.

        Returns:
            List of StructureGroup instances for each unique binder sequence.
            Groups with only 1 member are still returned for display purposes.
        """
        # Get target designation to know which chains are binders
        binder_hash_to_paths: dict[str, list[str]] = {}
        binder_hash_preview: dict[str, str] = {}

        for file_path in target_group.members:
            designation = self._designations.get(file_path)
            protein = self._proteins.get(file_path)
            if not designation or not protein:
                # No designation or unloaded - put in a "unknown" bucket
                key = "_undesignated"
                binder_hash_to_paths.setdefault(key, []).append(file_path)
                continue

            # Hash the binder chain sequences
            sequence = protein.get_sequence()
            binder_seqs = []
            for chain in sorted(designation.binder_chains):
                chain_seq = "".join(
                    r["one_letter"] for r in sequence if r["chain"] == chain
                )
                if chain_seq:
                    binder_seqs.append(f"{chain}:{chain_seq}")

            if not binder_seqs:
                key = "_no_binder"
                binder_hash_to_paths.setdefault(key, []).append(file_path)
                continue

            combined = "|".join(binder_seqs)
            binder_hash = hashlib.md5(combined.encode()).hexdigest()[:12]
            binder_hash_to_paths.setdefault(binder_hash, []).append(file_path)

            if binder_hash not in binder_hash_preview:
                # Store a preview of the first binder chain sequence
                first_seq = binder_seqs[0].split(":", 1)[1] if binder_seqs else ""
                preview = first_seq[:20] + ("..." if len(first_seq) > 20 else "")
                binder_hash_preview[binder_hash] = preview

        # Create sub-groups
        subgroups = []
        for i, (key, paths) in enumerate(sorted(binder_hash_to_paths.items())):
            preview = binder_hash_preview.get(key, "")
            if key.startswith("_"):
                name = f"Ungrouped ({len(paths)})"
            elif len(paths) > 1:
                name = f"Binder {preview} ({len(paths)} models)"
            else:
                # Single member - no sub-group label needed
                name = f"Binder {preview}"

            subgroup = StructureGroup(
                id=f"{target_group.id}_sub_{key}",
                name=name,
                group_type="binder_subgroup",
                key=key,
                members=paths,
                metadata={"binder_preview": preview},
            )
            subgroups.append(subgroup)

        return subgroups

    # Custom group management

    def create_custom_group(
        self,
        name: str,
        members: list[str] | None = None,
        metadata: dict | None = None,
    ) -> StructureGroup:
        """Create a new custom group.

        Args:
            name: Display name for the group.
            members: Initial member file paths.
            metadata: Optional metadata dict.

        Returns:
            The created StructureGroup.
        """
        import uuid

        group_id = f"custom_{uuid.uuid4().hex[:8]}"
        group = StructureGroup(
            id=group_id,
            name=name,
            group_type="custom",
            key=group_id,
            members=members.copy() if members else [],
            metadata=metadata.copy() if metadata else {},
            is_custom=True,
        )
        self._custom_groups[group_id] = group
        logger.debug(f"Created custom group '{name}' with {len(group.members)} members")
        return group

    def get_custom_groups(self) -> list[StructureGroup]:
        """Get all custom groups.

        Returns:
            List of custom StructureGroup instances.
        """
        return list(self._custom_groups.values())

    def get_custom_group(self, group_id: str) -> StructureGroup | None:
        """Get a custom group by ID.

        Args:
            group_id: The group ID.

        Returns:
            The StructureGroup or None if not found.
        """
        return self._custom_groups.get(group_id)

    def rename_custom_group(self, group_id: str, new_name: str) -> bool:
        """Rename a custom group.

        Args:
            group_id: The group ID.
            new_name: New display name.

        Returns:
            True if renamed successfully.
        """
        group = self._custom_groups.get(group_id)
        if group:
            group.name = new_name
            return True
        return False

    def delete_custom_group(self, group_id: str) -> bool:
        """Delete a custom group.

        Args:
            group_id: The group ID.

        Returns:
            True if deleted successfully.
        """
        if group_id in self._custom_groups:
            del self._custom_groups[group_id]
            logger.debug(f"Deleted custom group {group_id}")
            return True
        return False

    def add_to_custom_group(self, group_id: str, file_paths: list[str]) -> int:
        """Add files to a custom group.

        Args:
            group_id: The group ID.
            file_paths: List of file paths to add.

        Returns:
            Number of files actually added (not already members).
        """
        group = self._custom_groups.get(group_id)
        if not group:
            return 0

        added = 0
        for path in file_paths:
            if group.add_member(path):
                added += 1
        return added

    def remove_from_custom_group(self, group_id: str, file_paths: list[str]) -> int:
        """Remove files from a custom group.

        Args:
            group_id: The group ID.
            file_paths: List of file paths to remove.

        Returns:
            Number of files actually removed.
        """
        group = self._custom_groups.get(group_id)
        if not group:
            return 0

        removed = 0
        for path in file_paths:
            if group.remove_member(path):
                removed += 1
        return removed

    def auto_detect_targets(
        self,
        proteins: list[tuple[str, "Protein"]] | None = None,
        min_frequency: float = 0.5,
    ) -> dict[str, TargetDesignation]:
        """Auto-detect target chains by finding shared chain sequences.

        Heuristic: chains whose sequence appears in many structures are targets,
        chains unique to a single structure are binders.

        Args:
            proteins: Optional list of (file_path, Protein) tuples. If None, uses registered proteins.
            min_frequency: Minimum fraction of structures a chain must appear in to be considered target (0-1).

        Returns:
            Dict of file_path -> TargetDesignation for detected targets.
        """
        # Build protein list
        if proteins is not None:
            for file_path, protein in proteins:
                self._proteins[file_path] = protein
            protein_items = proteins
        else:
            protein_items = list(self._proteins.items())

        if len(protein_items) < 2:
            logger.debug("auto_detect_targets: need at least 2 structures")
            return {}

        # Step 1: Compute per-chain sequence hashes for every structure
        # chain_seq_hash -> list of (file_path, chain_id)
        chain_occurrences: dict[str, list[tuple[str, str]]] = {}
        structure_chains: dict[str, dict[str, str]] = {}  # file_path -> {chain_id -> seq_hash}

        for file_path, protein in protein_items:
            sequence = protein.get_sequence()
            chains_map: dict[str, str] = {}

            for chain_id in protein.get_chains():
                chain_seq = "".join(
                    r["one_letter"] for r in sequence if r["chain"] == chain_id
                )
                if not chain_seq:
                    continue
                seq_hash = hashlib.md5(chain_seq.encode()).hexdigest()[:12]
                chains_map[chain_id] = seq_hash

                if seq_hash not in chain_occurrences:
                    chain_occurrences[seq_hash] = []
                chain_occurrences[seq_hash].append((file_path, chain_id))

            structure_chains[file_path] = chains_map

        total_structures = len(protein_items)
        threshold = max(2, int(total_structures * min_frequency))

        # Step 2: Find chain sequences that appear across many structures
        target_hashes = set()
        for seq_hash, occurrences in chain_occurrences.items():
            unique_structures = len(set(fp for fp, _ in occurrences))
            if unique_structures >= threshold:
                target_hashes.add(seq_hash)

        if not target_hashes:
            logger.debug(
                f"auto_detect_targets: no chain sequence found in >= {threshold} of {total_structures} structures"
            )
            return {}

        logger.info(
            f"auto_detect_targets: found {len(target_hashes)} target chain sequence(s) "
            f"(threshold: {threshold}/{total_structures})"
        )

        # Step 3: Create designations for each structure
        designations: dict[str, TargetDesignation] = {}
        for file_path, chains_map in structure_chains.items():
            target_chains = []
            binder_chains = []
            for chain_id, seq_hash in chains_map.items():
                if seq_hash in target_hashes:
                    target_chains.append(chain_id)
                else:
                    binder_chains.append(chain_id)

            if target_chains and binder_chains:
                designation = TargetDesignation(
                    file_path=file_path,
                    target_chains=sorted(target_chains),
                    binder_chains=sorted(binder_chains),
                )
                designations[file_path] = designation
                self._designations[file_path] = designation

        logger.info(
            f"auto_detect_targets: created {len(designations)} designations "
            f"({len(target_hashes)} target sequences, {total_structures} structures)"
        )
        return designations

    def create_group_from_chain_search(
        self,
        name: str,
        reference_protein: "Protein",
        chain_id: str,
        file_paths: list[str] | None = None,
    ) -> StructureGroup | None:
        """Create a custom group from structures with matching chain sequence.

        Args:
            name: Display name for the group.
            reference_protein: Protein with the reference chain.
            chain_id: Chain ID to match.
            file_paths: Optional list of file paths to search.

        Returns:
            The created StructureGroup or None if no matches found.
        """
        matches = self.find_structures_with_chain_sequence(
            reference_protein, chain_id, file_paths
        )

        if not matches:
            return None

        # Get chain sequence info for metadata
        sequence = reference_protein.get_sequence()
        chain_seq = "".join(
            r["one_letter"] for r in sequence if r["chain"] == chain_id
        )

        metadata = {
            "source_chain": chain_id,
            "chain_length": len(chain_seq),
            "sequence_preview": chain_seq[:30] + ("..." if len(chain_seq) > 30 else ""),
        }

        return self.create_custom_group(name, matches, metadata)
