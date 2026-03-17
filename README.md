# DesignCampaign

An open-source tool to view, select, and filter protein drug design campaigns.

## Download

Pre-built installers are available on the [Releases page](https://github.com/lhmartin/DesignCampaign/releases).

| Platform | File |
|----------|------|
| Windows (installer) | `DesignCampaign-Windows-Setup-*.exe` |
| Windows (portable) | `DesignCampaign-Windows-Portable-*.exe` |
| macOS | `DesignCampaign-macOS-*.dmg` |
| Linux | `DesignCampaign-Linux-*.AppImage` or `*.deb` |

### First-run security warnings

The app is not code-signed. Your OS will warn you the first time you open it.

**macOS** — Right-click the `.app` inside the DMG → **Open** → click **"Open Anyway"** in the dialog.
If you've already dismissed the warning, go to **System Settings → Privacy & Security** and click **"Open Anyway"** next to the DesignCampaign entry.

**Windows** — Click **"More info"** in the SmartScreen popup, then **"Run anyway"**.

## Development

```bash
cd designcampaign-web
npm install
npm run dev        # Electron + Vite dev server
npm test           # Vitest unit tests
npm run typecheck  # TypeScript check
```

### Release a new version

```bash
cd designcampaign-web
npm version patch             # bumps version, commits, creates git tag
git push && git push --tags   # GitHub Actions builds all platforms (~10 min)
```

Then review the draft release on GitHub and click **Publish**.
