# Candoni Archives — Plan & Suggestions

A digital archive for the Municipal Government of Candoni, built on the same stack and design as DMS
(React + Vite, Firebase, Netlify). The Records Officer
uploads scanned archives **by folder**. Each folder becomes a batch with a
minimum set of metadata (DV No., date, payee, amount, and so on), so any document
can be found again in seconds.

---

## 1. Goals

| Goal | How the app meets it |
|------|-----------------------|
| One central place for all archived files | Files are kept in Firebase Storage (`archives/<folder>/<record>/…`) and indexed in Firestore |
| Fast upload of whole folders | Drag-and-drop or "Select folder" uploads every file in it, keeping the subfolder structure |
| Minimum but consistent metadata | Required fields per document type (DV No., Date, Payee, Amount for DVs) are checked before upload |
| Easy retrieval | Full-text search plus filters (type, year, fund, date range, amount range), with inline PDF/image preview |
| Accountability | Login with roles, and an audit log of every upload, edit, view, download and delete |
| Integrity | SHA-256 checksum per file, with duplicate detection |

## 2. Users & roles

Anyone can sign up (email and password, or Google), but an account stays **waiting for approval**
until an administrator approves it and gives it a role. The owner's address
(npp@mgocandoniaccounting.org) becomes the **Superadmin** once verified.

| Role | Can do |
|------|--------|
| **Superadmin** | Everything, and gives the Admin role |
| **Admin** | Everything: approves users, deletes records, Settings |
| **Records Officer** | Uploads folders, edits details, adds files, reads the audit log |
| **Viewer** (e.g. auditors, department heads) | Searches, previews and downloads |

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

**Folder level:** **Main document type** (what the folder is filed as, e.g. DV) · Fiscal year · Month · Fund ·
Box no. · Shelf/location · Remarks

**Record level (each document in the folder):** the uploader **states the type of every document**. It is
the main document (e.g. the DV), or a supporting document. The details it needs follow its own type:

| Document type | Kind | Required |
|---------------|------|----------|
| Disbursement Voucher (DV) | main | DV No., Date, Payee, Amount |
| Payroll | main | Payroll No., Date, Amount |
| Journal Entry Voucher (JEV) | main | JEV No., Date |
| Liquidation Report | main | LR No., Date, Amount |
| Contract / MOA | main | Contract No., Date, Payee |
| Report (Financial / COA) | main | Date, Particulars |
| Obligation Request (OBR / ORS) | supporting | OBR No., Date, Amount |
| Purchase Request | supporting | PR No., Date |
| Request for Quotation | supporting | Date |
| Abstract of Canvass / Bids | supporting | Date |
| Purchase Order | supporting | PO No., Date, Payee |
| Invoice / Billing Statement | supporting | Date, Payee |
| Delivery Receipt | supporting | Date |
| Inspection and Acceptance Report | supporting | Date |
| Official Receipt | supporting | OR No., Date, Payee, Amount |
| Travel Order / Itinerary | supporting | Date |
| Certification | supporting | Date |
| Other supporting document | supporting | none |

Optional for every type: Reference No., Particulars, OBR/ORS No., Check No., Resp. Center.
Amounts are never added up: a DV and its supporting documents carry the same amount.

Administrators change this list in **Administration → Document Types**: add a type, change its name or
required details, hide one no longer used (its records keep it), or remove one no record uses. The standard
list is in `src/lib/doctypes.js`; the office's own is kept in Firestore (`meta/settings.docTypes`). The rules accept any type code of 2–12 capital letters, so adding a type needs no
rules change.

## 5. Architecture

```
Browser (React SPA on Netlify) ──► Firebase Authentication   (sign-in, Google)
                                ──► Cloud Firestore            (users, batches, records, hashes, audit, settings)
                                ──► Cloud Storage for Firebase (the scanned files)
```

- **No server of our own.** Access is enforced by `firestore.rules` and `storage.rules`. Storage reads
  each user's role from Firestore.
- **Search** uses a list of search words kept on each record (`keywords`). Firestore narrows the
  results by one word, year or type, and the browser applies the other filters, so no composite
  indexes are needed.
- **Dashboard figures** use Firestore aggregation queries (count and sum).
- **Duplicates:** each file's SHA-256 is computed in the browser and stored in `hashes/{sha256}`.
- **Same design as DMS:** `src/styles.css` is the DMS stylesheet (trimmed to the rules used here), with the same Inter font, seal,
  icons, sign-in and approval pages. It also follows the DMS conventions: no sample values in
  fields, no description under page titles, and the searchable `Select` for dropdowns.

### Data model

- `batches`: one per uploaded folder (batch details, uploader, counts, status)
- `records`: one per document or transaction (DV No., date, payee, amount…), with its files
- `hashes`: one per file content (finds identical files)
- `folderLocks`: one per folder name + main type + fund (the rules refuse a second such folder)
- `users`: accounts and roles
- `audit`: who did what, when (never changed)
- `meta/settings`: funds

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

- **Backups:** Firebase keeps the data redundantly, but keep your own copy too. Download each
  folder's ZIP (Uploaded Folders → Download ZIP) to an external drive. Phase 2 could add a
  scheduled backup to Google Drive, as DMS does.
- **Scanning standard:** PDF/A, 300 dpi, one PDF per DV including its attachments,
  and a file name of `DVNo_Payee.pdf` (e.g. `100-2026-01-0001_JuanDelaCruz.pdf`), so
  auto-detect fills in most fields.
- **Folder convention:** `FY2026/01-January/100-2026-01-0001/…`
- **Security:** give each person their own account (no shared logins), and deactivate accounts
  of staff who leave. The app signs out after 60 minutes without activity.
- **Data privacy:** DVs contain personal data (RA 10173). Limit Viewer accounts, and use
  the audit log to show who accessed what.
