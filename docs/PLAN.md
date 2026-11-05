# Candoni Archives — Plan & Suggestions

A digital archive for the MGO Candoni accounting office. The Records Officer
uploads scanned archives **by folder**. Each folder becomes a batch with a
minimum set of metadata (DV No., date, payee, amount, and so on), so any document
can be found again in seconds.

---

## 1. Goals

| Goal | How the app meets it |
|------|-----------------------|
| One central place for all archived files | Files are stored on the server under `storage/<year>/<type>/<batch>/…` and indexed in SQLite |
| Fast upload of whole folders | Drag-and-drop or "Select folder" uploads every file in it, keeping the subfolder structure |
| Minimum but consistent metadata | Required fields per document type (DV No., Date, Payee, Amount for DVs) are checked before upload |
| Easy retrieval | Full-text search plus filters (type, year, fund, date range, amount range), with inline PDF/image preview |
| Accountability | Login with roles, and an audit log of every upload, edit, view, download and delete |
| Integrity | SHA-256 checksum per file, with duplicate detection |

## 2. Users & roles

| Role | Can do |
|------|--------|
| **Admin** | Everything, plus manage users and delete records |
| **Records Officer** | Upload folders, edit metadata |
| **Viewer** (e.g. auditors, department heads) | Search, preview, download |

## 3. Folder upload workflow (interactive wizard)

1. **Select folder.** Drag a folder onto the drop zone or click *Select folder*.
   The app shows a preview: number of files, total size, and file types. Unsupported
   or hidden files (`Thumbs.db`, `.DS_Store`) are skipped automatically.
2. **Batch details** (apply to the whole folder): document type, fiscal year,
   month, fund, box no., shelf location, remarks.
3. **Group into records.** Choose how files become records:
   - *Each subfolder = one record* (e.g. `DV 100-2026-01-0001/` holding the DV, ORS,
     and supporting documents), or
   - *Each file = one record*, or
   - *Whole folder = one record*.
4. **Fill in metadata** in an editable grid. The app **pre-fills** values it
   can read from file and folder names:
   - DV No. pattern `100-2026-01-0001` (Fund-Year-Month-Series)
   - dates such as `2026-01-15`
   - amounts such as `12,500.00`

   Missing required fields are highlighted in red. *Fill down* copies a value
   to every row below it.
5. **Upload.** Files are sent one by one with a progress bar. A failed file can
   be retried without restarting the batch. Duplicates (same SHA-256 already in the
   archive) and duplicate DV numbers are reported.

## 4. Minimum metadata

**Batch level (folder):** Document type · Fiscal year · Month · Fund · Box no. · Shelf/location · Remarks

**Record level (per document)**, by type:

| Document type | Required | Optional |
|---------------|----------|----------|
| Disbursement Voucher (DV) | DV No., Date, Payee, Amount | Particulars, ORS/OBR No., Check No., Responsibility Center |
| Payroll | Reference No., Date, Amount | Particulars (period, office) |
| Purchase Order / Purchase Request | PO/PR No., Date, Payee/Supplier | Amount, Particulars |
| ORS / OBR | ORS No., Date, Amount | Payee, Particulars |
| Journal Entry Voucher (JEV) | JEV No., Date | Amount, Particulars |
| Liquidation Report | Reference No., Date, Amount | Payee, Particulars |
| Official Receipt | OR No., Date, Payee, Amount | Particulars |
| Contract / MOA | Reference No., Date, Payee | Amount, Particulars |
| Report (Financial / COA) | Title (in Particulars), Date | — |
| Other | Reference No. | everything else |

The list of types and required fields lives in one place
(`src/doctypes.js`), so the office can change it easily.

## 5. Architecture

```
Browser (vanilla JS SPA)  ──HTTP/JSON──►  Node.js + Express  ──►  SQLite (data/archives.db)
   folder picker / grid                     auth, API, audit        └─► storage/ (files on disk)
```

- **No build step** and no external database server, so it runs on any office PC
  or small server with Node.js 22+.
- **SQLite FTS5** full-text index over DV No., payee, particulars, and file names.
- **Files** are never served from a guessable path. Downloads go through the API
  after a permission check, and only PDFs and images are previewed inline.

### Data model

- `batches`: one per uploaded folder (batch metadata, uploader, time)
- `records`: one per document/transaction (DV No., date, payee, amount…)
- `files`: physical files (original path in folder, stored path, size, SHA-256)
- `users`, `sessions`: authentication
- `audit_log`: who did what, when

## 6. Screens

1. **Dashboard:** totals (records, files, storage), records by type and by year, recent uploads.
2. **Upload Folder:** the 5-step wizard above.
3. **Search:** search box plus filters, a sortable results table, CSV export.
4. **Record detail:** metadata (editable by officers), file list with preview and download, history.
5. **Batches:** list of uploaded folders, with drill-down to their records.
6. **Audit log** (admin).
7. **Users** (admin).

## 7. Roadmap / suggestions

**Phase 1 (included now)**
- Folder upload wizard, metadata grid with auto-detect, search and filters, preview,
  roles, audit log, duplicate detection, CSV export.

**Phase 2 (recommended next)**
- **OCR** of scanned PDFs (e.g. `ocrmypdf`/Tesseract) so the *contents* of a DV are searchable.
- **CSV/Excel metadata import:** the officer prepares a spreadsheet (DV No., payee, amount…)
  and the app matches rows to files by DV No.
- **Barcode/QR cover sheet** per box, to link physical boxes and digital records.
- **Retention schedule:** flag records past their retention period (per the NAP General
  Records Disposition Schedule) for disposal review.
- **Request/borrow log** for physical folders.

**Phase 3**
- Integration with the accounting system (match DVs against the disbursement register).
- Approval workflow (upload → verify → publish).
- Offsite/cloud backup sync.

## 8. Operational suggestions

- **Backups:** back up `data/` and `storage/` every day (e.g. a scheduled copy to an
  external drive plus one offsite copy). Test a restore every quarter.
- **Scanning standard:** PDF/A, 300 dpi, one PDF per DV including its attachments,
  and a file name of `DVNo_Payee.pdf` (e.g. `100-2026-01-0001_JuanDelaCruz.pdf`), so
  auto-detect fills in most fields.
- **Folder convention:** `FY2026/01-January/100-2026-01-0001/…`
- **Security:** run it on the office LAN only, or behind HTTPS if exposed. Change the
  default admin password on first login. Give each person their own account; no shared
  logins.
- **Data privacy:** DVs contain personal data (RA 10173). Limit Viewer accounts, and use
  the audit log to show who accessed what.
