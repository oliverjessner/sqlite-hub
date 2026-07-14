# Find Installed Databases – technical plan

## Architecture

1. Add a `DatabaseDiscoveryService` that scans an explicit allow-list of roots asynchronously, never follows symbolic links, validates the 16-byte SQLite header, normalizes paths, and streams progress through short polling batches.
2. Add Connections API endpoints to start, poll, cancel, inspect, and import a discovery session. Preview databases read-only with a short busy timeout; persist imports through the existing `ConnectionManager` registry without copying or modifying files.
3. Add a Connections discovery modal using the existing modal, state, API, toast, native picker, and action patterns. Keep scan results selectable while polling, and provide search, filters, sorting, details, Finder/path actions, confirmation, and partial-import feedback.
4. Detect existing Connections by canonical path, derive application metadata conservatively from macOS, Windows, and Linux application-data paths, generate collision-free labels, and default discovered app databases to read-only.
5. Cover scanner exclusions, path deduplication, read-only preview, cancellation, selection rules, name collisions, and partial import with temporary test directories only.

## Safety boundaries

- Scan and preview never write to candidate databases.
- Symlinks and SQLite sidecar files are ignored.
- A path is revalidated immediately before import.
- Existing Connection paths cannot be imported again, even if the UI submits them.
- Per-file errors are recorded or skipped without failing the full scan.

## Platform scan profiles

- macOS scans Application Support, Containers, and Group Containers by default; Caches, WebKit, and system Application Support are optional.
- Windows scans Roaming AppData and Local AppData by default; ProgramData is optional. Environment-provided paths take precedence.
- Linux scans the XDG configuration and data directories plus Flatpak application data by default; XDG cache, Snap data, and `/var/lib` are optional.
- Custom directories remain available on every platform.

## Manual test guide

1. Open **Connections** and select **Find Installed Databases**.
2. Start a default scan, verify progress updates, select a result before completion, and cancel/rescan once.
3. Enable optional locations or add a custom folder, then verify extensionless SQLite files appear while `-wal`, `-shm`, `-journal`, symlinks, and invalid `.db` files do not.
4. Toggle **Show already connected databases** and verify those rows are disabled with **Already connected**.
5. Exercise search, filters, sorting, details, **Copy path**, and **Reveal in Finder**.
6. Import multiple results, accept the summary, and verify the Connections list refreshes, imported cards are highlighted, and source files remain unchanged.
7. Delete one selected source before import and verify other databases still import with a partial-success message.
