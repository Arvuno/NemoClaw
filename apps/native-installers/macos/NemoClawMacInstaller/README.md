# NemoClaw Mac Installer Preview

Experimental macOS SwiftUI shell for the opt-in Mac Installer Preview path.

The app calls the app-facing CLI APIs:

- `nemoclaw native-installer mac assess --json`
- `nemoclaw native-installer mac install --config <json> --json-progress`
- `nemoclaw native-installer mac launch --agent <openclaw|hermes> --json`
- `nemoclaw diagnostics export --output <path>`

Set `NEMOCLAW_MAC_INSTALLER_CLI` to point at a bundled or local `nemoclaw` binary during development.
Release builds should use the payload assembled by `scripts/native-installers/macos/build-preview.sh`.
