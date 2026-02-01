"""Tests for file utility functions."""

import tempfile
from pathlib import Path

import pytest

from src.utils.file_utils import (
    get_protein_files,
    validate_file_path,
    get_file_format,
    read_protein_file,
    get_file_size,
    is_file_too_large,
)


class TestGetProteinFiles:
    """Tests for get_protein_files function."""

    def test_finds_pdb_files(self, tmp_path: Path):
        """Test that PDB files are found."""
        (tmp_path / "protein1.pdb").write_text("ATOM...")
        (tmp_path / "protein2.pdb").write_text("ATOM...")

        files = get_protein_files(tmp_path)

        assert len(files) == 2
        assert all(f.suffix == ".pdb" for f in files)

    def test_finds_cif_files(self, tmp_path: Path):
        """Test that CIF files are found."""
        (tmp_path / "protein.cif").write_text("data_...")

        files = get_protein_files(tmp_path)

        assert len(files) == 1
        assert files[0].suffix == ".cif"

    def test_ignores_unsupported_formats(self, tmp_path: Path):
        """Test that unsupported file formats are ignored."""
        (tmp_path / "protein.pdb").write_text("ATOM...")
        (tmp_path / "readme.txt").write_text("text")
        (tmp_path / "data.csv").write_text("a,b,c")

        files = get_protein_files(tmp_path)

        assert len(files) == 1
        assert files[0].name == "protein.pdb"

    def test_returns_sorted_list(self, tmp_path: Path):
        """Test that files are returned sorted alphabetically."""
        (tmp_path / "zebra.pdb").write_text("ATOM...")
        (tmp_path / "alpha.pdb").write_text("ATOM...")
        (tmp_path / "beta.pdb").write_text("ATOM...")

        files = get_protein_files(tmp_path)

        assert [f.name for f in files] == ["alpha.pdb", "beta.pdb", "zebra.pdb"]

    def test_case_insensitive_extension(self, tmp_path: Path):
        """Test that file extensions are matched case-insensitively."""
        (tmp_path / "protein1.PDB").write_text("ATOM...")
        (tmp_path / "protein2.Pdb").write_text("ATOM...")

        files = get_protein_files(tmp_path)

        assert len(files) == 2

    def test_empty_directory(self, tmp_path: Path):
        """Test that empty directory returns empty list."""
        files = get_protein_files(tmp_path)

        assert files == []

    def test_raises_for_nonexistent_directory(self):
        """Test that FileNotFoundError is raised for nonexistent directory."""
        with pytest.raises(FileNotFoundError):
            get_protein_files("/nonexistent/path")

    def test_raises_for_file_path(self, tmp_path: Path):
        """Test that NotADirectoryError is raised for file path."""
        file_path = tmp_path / "test.pdb"
        file_path.write_text("ATOM...")

        with pytest.raises(NotADirectoryError):
            get_protein_files(file_path)


class TestValidateFilePath:
    """Tests for validate_file_path function."""

    def test_valid_file_returns_true(self, tmp_path: Path):
        """Test that existing file returns True."""
        file_path = tmp_path / "test.pdb"
        file_path.write_text("ATOM...")

        assert validate_file_path(file_path) is True

    def test_nonexistent_file_returns_false(self, tmp_path: Path):
        """Test that nonexistent file returns False."""
        file_path = tmp_path / "nonexistent.pdb"

        assert validate_file_path(file_path) is False

    def test_directory_returns_false(self, tmp_path: Path):
        """Test that directory path returns False."""
        assert validate_file_path(tmp_path) is False


class TestGetFileFormat:
    """Tests for get_file_format function."""

    def test_pdb_format(self, tmp_path: Path):
        """Test PDB format detection."""
        file_path = tmp_path / "protein.pdb"
        file_path.write_text("ATOM...")

        assert get_file_format(file_path) == ".pdb"

    def test_cif_format(self, tmp_path: Path):
        """Test CIF format detection."""
        file_path = tmp_path / "protein.cif"
        file_path.write_text("data_...")

        assert get_file_format(file_path) == ".cif"

    def test_uppercase_extension(self, tmp_path: Path):
        """Test that uppercase extensions are normalized."""
        file_path = tmp_path / "protein.PDB"
        file_path.write_text("ATOM...")

        assert get_file_format(file_path) == ".pdb"

    def test_raises_for_unsupported_format(self, tmp_path: Path):
        """Test that ValueError is raised for unsupported format."""
        file_path = tmp_path / "data.txt"
        file_path.write_text("text")

        with pytest.raises(ValueError, match="Unsupported file format"):
            get_file_format(file_path)


class TestReadProteinFile:
    """Tests for read_protein_file function."""

    def test_reads_file_contents(self, tmp_path: Path):
        """Test that file contents are read correctly."""
        content = "ATOM      1  N   ALA A   1       0.000   0.000   0.000\n"
        file_path = tmp_path / "test.pdb"
        file_path.write_text(content)

        result = read_protein_file(file_path)

        assert result == content

    def test_raises_for_nonexistent_file(self, tmp_path: Path):
        """Test that FileNotFoundError is raised for nonexistent file."""
        file_path = tmp_path / "nonexistent.pdb"

        with pytest.raises(FileNotFoundError):
            read_protein_file(file_path)

    def test_raises_for_unsupported_format(self, tmp_path: Path):
        """Test that ValueError is raised for unsupported format."""
        file_path = tmp_path / "data.txt"
        file_path.write_text("text")

        with pytest.raises(ValueError):
            read_protein_file(file_path)


class TestGetFileSize:
    """Tests for get_file_size function."""

    def test_returns_correct_size(self, tmp_path: Path):
        """Test that file size is returned correctly."""
        content = "A" * 100
        file_path = tmp_path / "test.pdb"
        file_path.write_text(content)

        size = get_file_size(file_path)

        assert size == 100


class TestIsFileTooLarge:
    """Tests for is_file_too_large function."""

    def test_small_file_returns_false(self, tmp_path: Path):
        """Test that small file returns False."""
        file_path = tmp_path / "small.pdb"
        file_path.write_text("ATOM...")

        assert is_file_too_large(file_path) is False
