"""Dialog for designating target vs binder chains in a protein structure."""

from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QCheckBox,
    QGroupBox,
    QScrollArea,
    QWidget,
    QFrame,
)


class ChainCheckBox(QWidget):
    """A checkbox widget for a chain with info display."""

    def __init__(
        self,
        chain_id: str,
        num_residues: int,
        is_target: bool = False,
        parent=None,
    ):
        """Initialize the chain checkbox.

        Args:
            chain_id: Chain identifier.
            num_residues: Number of residues in the chain.
            is_target: Whether this chain is pre-selected as target.
            parent: Parent widget.
        """
        super().__init__(parent)
        self._chain_id = chain_id

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 2, 0, 2)
        layout.setSpacing(8)

        self._checkbox = QCheckBox()
        self._checkbox.setChecked(is_target)
        layout.addWidget(self._checkbox)

        self._label = QLabel(f"Chain {chain_id}")
        self._label.setStyleSheet("font-weight: bold;")
        layout.addWidget(self._label)

        self._info = QLabel(f"({num_residues} residues)")
        self._info.setStyleSheet("color: #666;")
        layout.addWidget(self._info)

        layout.addStretch()

    @property
    def chain_id(self) -> str:
        """Get the chain ID."""
        return self._chain_id

    @property
    def is_checked(self) -> bool:
        """Check if this chain is selected as target."""
        return self._checkbox.isChecked()

    def set_checked(self, checked: bool) -> None:
        """Set the checked state."""
        self._checkbox.setChecked(checked)


class TargetDesignationDialog(QDialog):
    """Dialog for user to designate target vs binder chains.

    Shows all chains in the structure and allows the user to select
    which chains are targets (the protein being designed against) and
    which are binders (the designed proteins).

    Example usage:
        dialog = TargetDesignationDialog(
            file_path="/path/to/structure.pdb",
            chains={"A": 350, "B": 120},
            parent=self
        )
        if dialog.exec() == QDialog.DialogCode.Accepted:
            targets = dialog.target_chains
            binders = dialog.binder_chains
            remember = dialog.remember_for_similar
    """

    def __init__(
        self,
        file_path: str,
        chains: dict[str, int],
        preset_targets: list[str] | None = None,
        preset_binders: list[str] | None = None,
        parent=None,
    ):
        """Initialize the target designation dialog.

        Args:
            file_path: Path to the structure file.
            chains: Dict mapping chain IDs to residue counts.
            preset_targets: Pre-selected target chain IDs.
            preset_binders: Pre-selected binder chain IDs.
            parent: Parent widget.
        """
        super().__init__(parent)
        self._file_path = file_path
        self._chains = chains
        self._preset_targets = preset_targets or []
        self._preset_binders = preset_binders or []
        self._target_checkboxes: list[ChainCheckBox] = []
        self._binder_checkboxes: list[ChainCheckBox] = []

        self._init_ui()

    def _init_ui(self):
        """Initialize the UI components."""
        self.setWindowTitle("Designate Target/Binder Chains")
        self.setMinimumWidth(400)
        self.setModal(True)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        # File info
        file_name = Path(self._file_path).name
        file_label = QLabel(f"<b>Structure:</b> {file_name}")
        layout.addWidget(file_label)

        # Chain summary
        chains_str = ", ".join(
            f"{cid} ({count} res)" for cid, count in sorted(self._chains.items())
        )
        chains_label = QLabel(f"<b>Chains found:</b> {chains_str}")
        chains_label.setWordWrap(True)
        layout.addWidget(chains_label)

        # Separator
        separator = QFrame()
        separator.setFrameShape(QFrame.Shape.HLine)
        separator.setFrameShadow(QFrame.Shadow.Sunken)
        layout.addWidget(separator)

        # Instructions
        instructions = QLabel(
            "Select which chains are <b>targets</b> (the receptor/antigen) "
            "and which are <b>binders</b> (the designed protein)."
        )
        instructions.setWordWrap(True)
        layout.addWidget(instructions)

        # Target chains group
        target_group = QGroupBox("Target Chains")
        target_layout = QVBoxLayout(target_group)
        target_layout.setSpacing(2)

        for chain_id, num_residues in sorted(self._chains.items()):
            is_preset = chain_id in self._preset_targets
            checkbox = ChainCheckBox(chain_id, num_residues, is_preset)
            self._target_checkboxes.append(checkbox)
            target_layout.addWidget(checkbox)

        layout.addWidget(target_group)

        # Binder chains group
        binder_group = QGroupBox("Binder Chains")
        binder_layout = QVBoxLayout(binder_group)
        binder_layout.setSpacing(2)

        for chain_id, num_residues in sorted(self._chains.items()):
            is_preset = chain_id in self._preset_binders
            checkbox = ChainCheckBox(chain_id, num_residues, is_preset)
            self._binder_checkboxes.append(checkbox)
            binder_layout.addWidget(checkbox)

        layout.addWidget(binder_group)

        # Auto-select suggestion if exactly 2 chains and no presets
        if len(self._chains) == 2 and not self._preset_targets and not self._preset_binders:
            chain_ids = sorted(self._chains.keys())
            # Assume first chain (usually A) is target, second (usually B) is binder
            self._target_checkboxes[0].set_checked(True)
            self._binder_checkboxes[1].set_checked(True)

        # Remember option
        self._remember_checkbox = QCheckBox("Remember for similar structures")
        self._remember_checkbox.setToolTip(
            "Apply this designation to other structures with the same chain composition"
        )
        layout.addWidget(self._remember_checkbox)

        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()

        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)

        apply_btn = QPushButton("Apply")
        apply_btn.setDefault(True)
        apply_btn.clicked.connect(self._on_apply)
        button_layout.addWidget(apply_btn)

        layout.addLayout(button_layout)

    def _on_apply(self):
        """Handle apply button click."""
        targets = self.target_chains
        binders = self.binder_chains

        # Validate: at least one target and one binder
        if not targets:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(
                self,
                "Validation Error",
                "Please select at least one target chain.",
            )
            return

        if not binders:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(
                self,
                "Validation Error",
                "Please select at least one binder chain.",
            )
            return

        # Warn if a chain is both target and binder
        overlap = set(targets) & set(binders)
        if overlap:
            from PyQt6.QtWidgets import QMessageBox
            result = QMessageBox.warning(
                self,
                "Overlapping Selection",
                f"Chain(s) {', '.join(sorted(overlap))} are selected as both "
                "target and binder. This is unusual. Continue anyway?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if result != QMessageBox.StandardButton.Yes:
                return

        self.accept()

    @property
    def target_chains(self) -> list[str]:
        """Get the selected target chain IDs."""
        return [cb.chain_id for cb in self._target_checkboxes if cb.is_checked]

    @property
    def binder_chains(self) -> list[str]:
        """Get the selected binder chain IDs."""
        return [cb.chain_id for cb in self._binder_checkboxes if cb.is_checked]

    @property
    def remember_for_similar(self) -> bool:
        """Check if the user wants to remember this designation."""
        return self._remember_checkbox.isChecked()

    @property
    def file_path(self) -> str:
        """Get the structure file path."""
        return self._file_path
