# Candoni Archives

The digital archive for the MGO Candoni accounting office. The Records Officer uploads
scanned archives **by folder** and adds a minimum set of metadata (DV No., date, payee,
amount…). Staff can then search, preview and download any document.

See **[docs/PLAN.md](docs/PLAN.md)** for the full plan, metadata standard and roadmap.

## Features

- **Folder upload wizard** (drag and drop or *Select folder*):
  1. Select folder: preview of the files and folders; system files are skipped
  2. Folder details: document type, fiscal year, month, fund, box no., shelf location
  3. Group files: each subfolder, each file, or the whole folder becomes one record
  4. Fill in metadata: an editable grid, **pre-filled from file names**
     (e.g. `100-2026-01-0001_Juan Dela Cruz_12,500.00.pdf`), with required fields in red,
     fill-down, paste from Excel, and arrow/Enter navigation
  5. Upload: progress bar, duplicate warnings (same DV No. or identical file), retry of failed files
- **Search**: full-text search (DV No., payee, particulars, file names) plus filters by type, year,
  fund, date and amount. Sortable results, totals, and **CSV export**.
- **Record view**: metadata, inline PDF and image preview, download, metadata editing,
  adding missing files, and history.
- **Dashboard**: totals, records by type and year, recent uploads.
- **Roles**: Admin, Records Officer (upload and edit), Viewer (search and view).
- **Audit log**: every login, upload, view, download, edit, export and delete.
- **Integrity**: a SHA-256 checksum for every file, plus detection of duplicate files.

## Requirements

- Node.js **22.13 or newer** (it uses the built-in SQLite, so no database server is needed)

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

On first start the app creates the user **admin** with password **admin123**, or the value of
`ADMIN_PASSWORD` if it is set. You are asked to change the password after logging in. Then open
**Users** and create an account for the Records Officer.

### Settings (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database location |
| `STORAGE_DIR` | `./storage` | Where archived files are kept |
| `MAX_FILE_MB` | `200` | Maximum size per file |
| `ADMIN_PASSWORD` | `admin123` | Password for the first admin account |
| `SECURE_COOKIE` | off | Set to `1` when served over HTTPS |

### Backups

Everything lives in two folders: `data/` (database) and `storage/` (files). Back up both
every day, for example to an external drive plus one offsite copy.

## Development

```bash
npm run dev   # restarts on file changes
npm test      # end-to-end API test
```

```
server.js          Express API (auth, batches, records, files, audit, users)
src/db.js          SQLite schema + full-text index
src/auth.js        Password hashing, sessions, roles
src/doctypes.js    Document types and required metadata (edit to customise)
public/            Single-page frontend (no build step)
test/              API tests
docs/PLAN.md       Plan and suggestions
```
