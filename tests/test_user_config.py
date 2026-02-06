"""Tests for user configuration persistence."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from src.config.user_config import (
    FilterConfig,
    ViewerConfig,
    UserConfig,
    save_config,
    load_config,
    save_filters,
    load_filters,
)


class TestFilterConfig:
    """Tests for FilterConfig dataclass."""

    def test_default(self):
        fc = FilterConfig()
        assert fc.metric_ranges == {}

    def test_with_ranges(self):
        fc = FilterConfig(metric_ranges={"rasa": (0.3, 0.9)})
        assert fc.metric_ranges["rasa"] == (0.3, 0.9)


class TestViewerConfig:
    """Tests for ViewerConfig dataclass."""

    def test_defaults(self):
        vc = ViewerConfig()
        assert vc.cell_size == "large"
        assert vc.color_scheme == "spectrum"
        assert vc.representation == "cartoon"
        assert vc.interface_cutoff == 4.0
        assert vc.dark_mode is False

    def test_custom_values(self):
        vc = ViewerConfig(
            cell_size="small",
            color_scheme="chain",
            representation="stick",
            interface_cutoff=5.5,
            dark_mode=True,
        )
        assert vc.cell_size == "small"
        assert vc.dark_mode is True
        assert vc.interface_cutoff == 5.5


class TestUserConfig:
    """Tests for UserConfig dataclass."""

    def test_defaults(self):
        uc = UserConfig()
        assert isinstance(uc.filters, FilterConfig)
        assert isinstance(uc.viewer, ViewerConfig)
        assert uc.last_folder is None
        assert uc.window_geometry is None


class TestConfigPersistence:
    """Tests for save_config / load_config round-trip."""

    def test_save_load_roundtrip(self, tmp_path):
        """Test that save followed by load preserves all fields."""
        config = UserConfig(
            filters=FilterConfig(metric_ranges={
                "rasa": (0.2, 0.8),
                "plddt": (70.0, None),
            }),
            viewer=ViewerConfig(
                cell_size="small",
                color_scheme="chain",
                representation="stick",
                interface_cutoff=5.0,
                dark_mode=True,
            ),
            last_folder="/home/user/proteins",
            window_geometry={"x": 100, "y": 200, "w": 1024, "h": 768},
        )

        config_file = tmp_path / "config.json"

        with patch("src.config.user_config.FULL_CONFIG_FILE", config_file), \
             patch("src.config.user_config.CONFIG_DIR", tmp_path):
            assert save_config(config) is True
            assert config_file.exists()

            loaded = load_config()

        assert loaded.filters.metric_ranges["rasa"] == (0.2, 0.8)
        assert loaded.filters.metric_ranges["plddt"] == (70.0, None)
        assert loaded.viewer.cell_size == "small"
        assert loaded.viewer.color_scheme == "chain"
        assert loaded.viewer.representation == "stick"
        assert loaded.viewer.interface_cutoff == 5.0
        assert loaded.viewer.dark_mode is True
        assert loaded.last_folder == "/home/user/proteins"
        assert loaded.window_geometry == {"x": 100, "y": 200, "w": 1024, "h": 768}

    def test_load_missing_file_returns_defaults(self, tmp_path):
        """Test that loading a nonexistent config returns defaults."""
        missing = tmp_path / "nonexistent.json"
        with patch("src.config.user_config.FULL_CONFIG_FILE", missing):
            config = load_config()
        assert config.viewer.color_scheme == "spectrum"
        assert config.last_folder is None

    def test_load_corrupt_file_returns_defaults(self, tmp_path):
        """Test that corrupt JSON returns defaults."""
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("not valid json {{{")
        with patch("src.config.user_config.FULL_CONFIG_FILE", bad_file):
            config = load_config()
        assert isinstance(config, UserConfig)
        assert config.viewer.color_scheme == "spectrum"

    def test_save_creates_directory(self, tmp_path):
        """Test that save_config creates the config directory."""
        nested = tmp_path / "a" / "b"
        config_file = nested / "config.json"
        with patch("src.config.user_config.FULL_CONFIG_FILE", config_file), \
             patch("src.config.user_config.CONFIG_DIR", nested):
            result = save_config(UserConfig())
        assert result is True
        assert config_file.exists()


class TestFilterPersistence:
    """Tests for save_filters / load_filters."""

    def test_roundtrip(self, tmp_path):
        fc = FilterConfig(metric_ranges={"rasa": (0.1, 0.9), "plddt": (None, 95.0)})
        filters_file = tmp_path / "filters.json"

        with patch("src.config.user_config.FILTERS_FILE", filters_file), \
             patch("src.config.user_config.CONFIG_DIR", tmp_path):
            assert save_filters(fc) is True
            loaded = load_filters()

        assert loaded is not None
        assert loaded.metric_ranges["rasa"] == (0.1, 0.9)
        assert loaded.metric_ranges["plddt"] == (None, 95.0)

    def test_load_missing_returns_none(self, tmp_path):
        missing = tmp_path / "no_filters.json"
        with patch("src.config.user_config.FILTERS_FILE", missing):
            assert load_filters() is None
