"""File handling utilities for protein structure files."""

from pathlib import Path

from src.config.settings import SUPPORTED_FORMATS, MAX_FILE_SIZE_WARNING


def get_protein_files(directory: str | Path) -> list[Path]:
    """Scan a directory for supported protein structure files.

    Args:
        directory: Path to the directory to scan.

    Returns:
        List of Path objects for supported protein files, sorted alphabetically.

    Raises:
        FileNotFoundError: If the directory does not exist.
        NotADirectoryError: If the path is not a directory.
    """
    directory = Path(directory)

    if not directory.exists():
        raise FileNotFoundError(f"Directory not found: {directory}")

    if not directory.is_dir():
        raise NotADirectoryError(f"Path is not a directory: {directory}")

    protein_files = []
    for file_path in directory.iterdir():
        if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_FORMATS:
            protein_files.append(file_path)

    return sorted(protein_files, key=lambda p: p.name.lower())


def validate_file_path(file_path: str | Path) -> bool:
    """Check if a file path is valid and readable.

    Args:
        file_path: Path to the file to validate.

    Returns:
        True if the file exists and is readable, False otherwise.
    """
    file_path = Path(file_path)
    return file_path.exists() and file_path.is_file()


def get_file_format(file_path: str | Path) -> str:
    """Detect the file format from the file extension.

    Args:
        file_path: Path to the file.

    Returns:
        The file extension in lowercase (e.g., '.pdb', '.cif').

    Raises:
        ValueError: If the file format is not supported.
    """
    file_path = Path(file_path)
    extension = file_path.suffix.lower()

    if extension not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported file format: {extension}. "
            f"Supported formats: {', '.join(SUPPORTED_FORMATS)}"
        )

    return extension


def read_protein_file(file_path: str | Path) -> str:
    """Read the contents of a protein structure file.

    Args:
        file_path: Path to the protein structure file.

    Returns:
        The file contents as a string.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file format is not supported.
    """
    file_path = Path(file_path)

    if not validate_file_path(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    get_file_format(file_path)  # Validate format

    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def get_file_size(file_path: str | Path) -> int:
    """Get the size of a file in bytes.

    Args:
        file_path: Path to the file.

    Returns:
        File size in bytes.
    """
    return Path(file_path).stat().st_size


def is_file_too_large(file_path: str | Path) -> bool:
    """Check if a file exceeds the recommended size limit.

    Args:
        file_path: Path to the file.

    Returns:
        True if the file exceeds MAX_FILE_SIZE_WARNING, False otherwise.
    """
    return get_file_size(file_path) > MAX_FILE_SIZE_WARNING
