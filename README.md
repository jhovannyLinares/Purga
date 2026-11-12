# Purga

Purga indexes the files in the folders you choose, finds what you no longer need and warns you before things expire.
Nothing is deleted without your decision, and what is deleted goes to the Windows Recycle Bin.

Current version: **0.1.0** · Windows 10/11 · personal app, MIT License.

## What it does

### Watched folders

Add folders (File › Add folder). Purga checks them in the background, comparing size and date without opening files,
and keeps the index up to date while it runs (`ReadDirectoryChangesW`, no administrator rights). A disconnected drive
puts its files on hold instead of losing them. A file is tracked by drive + File ID, so its mark survives renaming and
moving on the same drive.

| What Purga reads | Where it comes from |
| --- | --- |
| Origin | The browser's download mark (`Zone.Identifier`), Outlook attachment folders, WhatsApp and Telegram names, screenshots, Downloads. Without evidence it says «Unknown» |
| Last opened | Windows «Recent» items; without them, the last modification. The screen says which one it used |
| Extensions | A global filter and one per folder: «all but the marked ones» or «only the marked ones». A file with a mark, note or expiry is kept even when it falls out of the filter |

### Marks and batches

| Mark | What happens |
| --- | --- |
| Unreviewed | The default; rules may propose something |
| Keep | Rules never touch it; an optional expiry date warns 60, 30, 7 and 1 days before |
| Delete | Goes to the Recycle Bin when you confirm |
| Delete on {date} | Goes to the Recycle Bin on that day, after checking it is the same file, with a notice the day before |
| Review on {date} | Goes back to Unreviewed on that day, with a notice |
| Archived | Only a mark: the file stays where it is and leaves the rules and the daily view |

Every action is a batch with **Undo** (it restores the marks and takes the files out of the Recycle Bin). A folder can
have its own mark (keep everything, delete what is older than N days, review every N days, sort photos by date) with
a simulation before saving. Free tags, a note per file, and export/import of marks as JSON matched by content hash.

### Cleanup proposals

Rules only propose; each one can be switched off, its threshold edited and simulated.

| Rule | Proposes |
| --- | --- |
| Temporary download | Browser, WhatsApp or Telegram files unopened for 30 days |
| Forgotten draft | Draft names unopened for 60 days |
| Draft tag | Tags `_draft`, `_v1`, `copy`, `(1)`, `final_final` names |
| Older version | Older versions of the same file in the same folder, after 30 days |
| Exact duplicate | Every copy but one, checked by full hash; the one outside Downloads and temporary folders is kept |
| Application leftover | `~$*`, `.tmp`, `.crdownload`, `.part` older than 7 days |
| Old installer | `.exe` and `.msi` in Downloads older than 30 days |

Rejecting a proposal keeps it away until the file changes.

### Photos

Similar photos (64-bit perceptual hash, Hamming distance ≤ 8) are grouped and the best one is proposed to keep: more
pixels, less compression (format and JPEG quality), original EXIF, sharper, older. Photos can be moved or copied to
`{destination}\YYYY\YYYY-MM-DD` (or by year or month), by hand or automatically for a folder; photos without a reliable
date are proposed instead of moved.

### Before deleting

Preview shows each file without opening its program: whole images, PDFs in the Chromium viewer, Office through the
Windows thumbnail, the first 40 lines of text, the contents of a `.zip`, an executable's publisher, version and
signature (it never runs). In the confirmation every file can be taken out of the batch. On drives without a Recycle
Bin (USB, network) deleting asks you to type the number of files, and scheduled deletions there never run on their own.

### File Explorer and tray

Right-click › Show more options › **Schedule deletion with Purga…** (registered under `HKCU`, no administrator rights).
Several files selected together become one dialog and one batch. Closing the window leaves Purga in the tray for the
daily pass and the notices; it can start with Windows.

### Help and diagnostics

Help › User guide (F1), Good to know, Release notes, Log and About (versions, what it depends on, where it saves).
Everything is in Spanish and English and follows the Windows theme (or the one you pick).

## Install

Run `Purga Setup 0.1.0.exe`. It installs per user in `%LOCALAPPDATA%\Programs\Purga`, without administrator rights,
with shortcuts on the desktop and the Start menu. The installer is not signed: Windows SmartScreen may show «Windows
protected your PC»; choose **More info › Run anyway**.

Uninstalling removes the right-click entry and the start-with-Windows entry, and asks whether to delete your data in
`%APPDATA%\Purga` (index, marks, notes, settings).

## Build from source

Requires Node.js 24 and Windows. Python 3 with Playwright only for the screen tests.

| Command | What it does |
| --- | --- |
| `npm install` | Dependencies (if Electron did not download: `node node_modules/electron/install.js`) |
| `npm run dev` | Opens the app with hot reload |
| `npm test` | Integration tests: index, marks, Recycle Bin, rules, photos, search, Win32 |
| `npm run typecheck` | Type check |
| `npm run e2e` | Screen tests: the flow between screens and the layout (no clipped text, menus and dialogs inside the window) in both themes and at 1100×700 and 1280×800 |
| `npm run e2e:pack` | The flow test against the packaged app |
| `npm run icon` | Generates `build/icon.ico` from `resources/logo.png` |
| `npm run dist` | Builds the installer in `dist/` |

## Architecture

```
renderer (React)  ──IPC (zod)──>  main (window, tray, notices, preview, right-click)
                                     │
                                     └──>  backend (utilityProcess): SQLite index, disk, rules, photos, Recycle Bin
```

| Folder | Contents |
| --- | --- |
| `src/shared/` | IPC contracts (zod), model, rules, filters, photos, texts in both languages, user guide |
| `src/main/` | Hardened window, splash screen, tray, Windows notices, preview, File Explorer verb, backend client |
| `src/backend/` | SQLite index (`node:sqlite`), folder reconciliation and watching, origin, marks and batches, Recycle Bin, scheduler, rules, duplicates, photos, search, Win32 through koffi |
| `src/renderer/` | Interface with the family design (`familia.css` + `tokens.css`) |
| `resources/` | Logos and the Recycle Bin script |
| `tests/` | Integration tests and screen tests (Playwright over CDP) |
| `build/` | Icon, its generator and the installer script |

## Security

- The window runs with `contextIsolation`, `sandbox`, no Node, a strict CSP and no navigation.
- Every IPC message is validated with zod in main and again in the backend; files are referred to by their index id,
  never by a path sent from the interface.
- External processes (PowerShell, `reg.exe`) run without a shell and with their arguments as an array.
- The log stores the operation, the file id and the original message; Purga handles no passwords or tokens.
