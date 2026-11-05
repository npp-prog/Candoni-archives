# Candoni Archives

The digital archive of the Municipal Government of Candoni. The Records Officer uploads scanned
records **by folder**, with the minimum details of each one (DV No., date, payee, amount…).
Everyone approved can then search, preview and download them.

Built like **DMS**: React + Vite, Firebase (Authentication, Firestore, Storage) and Netlify.
It uses the same design: the DMS stylesheet (trimmed to what this app uses), Inter font, municipal seal, icons and sign-in flow.
See [docs/PLAN.md](docs/PLAN.md) for the plan, metadata standard and roadmap.

## What it does

- **Upload Folder** (Records Officer, Admin), a 5-step wizard:
  1. *Select folder*: drop a folder or choose one; subfolders are kept, system files left out.
  2. *Folder details*: document type, fiscal year, month, fund, box no., shelf/location.
  3. *Group files*: each subfolder, each top-level subfolder, each file, or the whole folder becomes one record.
  4. *Fill in details*: a grid **pre-filled from file names** (`100-2026-01-0001_Payee Name_12,500.00.pdf`).
     Required fields show in red. You can fill down, paste rows from Excel, and move down with Enter.
  5. *Upload*: progress bar, 3 files at a time, retry of failed files. It warns when a DV No. is
     already archived or a file is identical to one in the archive (SHA-256).
- **Search Archives**: by reference no., payee, particulars, OBR/check no. or file name, with
  filters for type, year, fund, date and amount, sortable columns, totals and CSV export.
- **Record page**: details, PDF/image preview, download, editing (Records Officer), adding
  missing files, and history.
- **Uploaded Folders**: each upload with where its paper is filed, its records, and a ZIP download.
- **Dashboard**: totals (records, files, storage, amount), records by type and year, recent uploads.
- **Users**: new accounts wait for approval. Roles: Superadmin (owner), Admin, Records Officer and Viewer.
- **Audit Log**: who uploaded, viewed, downloaded, edited or deleted what. It is never changed.
- **Settings**: the list of funds.

| Role | Search / view / download | Upload, edit details | Delete | Users, Settings | Audit log |
|------|:-:|:-:|:-:|:-:|:-:|
| Viewer | ✓ | | | | |
| Records Officer | ✓ | ✓ | | | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Superadmin (npp@mgocandoniaccounting.org) | ✓ | ✓ | ✓ | ✓ (also gives Admin) | ✓ |

## Setting it up (once)

The Firebase config of the **candoni-archives** project is already in `src/firebase-config.js`.
These steps are done in the Firebase console and on Netlify:

### 1. Firebase Authentication
Firebase console → **Authentication** → Get started → **Sign-in method**:
- enable **Email/Password**
- enable **Google**

Then **Settings → Authorized domains** → add your Netlify address (e.g. `candoni-archives.netlify.app`)
and any custom domain.

### 2. Firestore Database
**Firestore Database** → Create database (production mode; region e.g. `asia-southeast1`).
Then **Rules** → replace everything with the contents of [`firestore.rules`](firestore.rules) → **Publish**.

No indexes need to be created: every query uses Firestore's automatic indexes.

### 3. Storage
**Storage** → Get started (Storage needs the Blaze plan; usage within the free quota costs nothing).
Then **Rules** → replace everything with [`storage.rules`](storage.rules) → **Publish**. When Firebase
asks to let Storage rules read Firestore (the roles are kept there), click **Allow**.

**Downloads and ZIPs** need the bucket to allow the browser to fetch files (CORS). In the Google Cloud
console, open **Cloud Shell** (the `>_` button at the top) and run:

```bash
echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
gsutil cors set cors.json gs://candoni-archives.firebasestorage.app
```

Without this, previews still work, and Download opens the file in a new tab instead.

*Shortcut for steps 2–3 (rules only):* `npx firebase-tools login`, then `npm run deploy:rules`.

### 4. Netlify
Netlify → **Add new site → Import an existing project** → GitHub → `npp-prog/Candoni-archives`.
The build settings come from `netlify.toml` (build `npm run build`, publish `dist`). Deploy.
Every push to the branch redeploys.

### 5. First sign-in
Open the site and use **Continue with Google** with **npp@mgocandoniaccounting.org**. You become the
superadmin, already approved. (If you sign up with email and password instead, open the verification
link first.) Others then sign up and wait under **Users → Waiting for approval**. Give the Records
Officer the *Records Officer* role.

## Keeping storage costs low (optional): Coldline for older files

Archived files are rarely opened after they are uploaded. A **lifecycle rule** on the Storage bucket moves
each file to the cheaper **Coldline** storage class 90 days after it was uploaded. The app needs no change:
Coldline files open and download like any other.

| | Standard | Coldline |
|---|---|---|
| Storing | about $0.020–0.026 per GB a month | about $0.004–0.005 per GB a month |
| Opening or downloading | no extra fee | about $0.02 per GB extra |
| Minimum time | none | 90 days (deleting earlier is billed as 90 days) |
| 1 TB stored | about $20–27 a month | about $4–7 a month |

Prices are approximate; see Google Cloud Storage pricing for the current figures.

**In the Google Cloud console** (console.cloud.google.com, project **candoni-archives**):

1. Menu (☰) → **Cloud Storage** → **Buckets** → **candoni-archives.firebasestorage.app**.
2. **Lifecycle** tab → **Add a rule**.
3. Action: **Set storage class to Coldline** → Continue.
4. Conditions: **Age** `90` days (counted from the upload, not the date on the DV), **Storage class matches**
   `Standard`, **Object name matches prefix** `archives/` → Continue → **Create**.

**Or in Cloud Shell** (the `>_` button at the top of the console), with [`lifecycle.json`](lifecycle.json)
from this repository:

```bash
gcloud storage buckets update gs://candoni-archives.firebasestorage.app --lifecycle-file=lifecycle.json
```

The rule runs about once a day; files show **Coldline** in the bucket's Storage class column within a day.
To undo it, delete the rule in the Lifecycle tab (files already moved stay in Coldline, which is harmless).
Set a budget alert too (Billing → **Budgets & alerts**), so unusual download costs are noticed early.

## Running it on your computer

```bash
npm install
npm run local      # Firebase emulators + demo accounts + app at http://localhost:5173 (needs Java 21+)
```

Demo accounts (local only): `npp@mgocandoniaccounting.org / admin123` (superadmin),
`records@archives.local / records123` (Records Officer), `viewer@archives.local / viewer123` (Viewer),
`new@archives.local / new12345` (waiting for approval).

`npm run dev` runs the app against the real Firebase project instead.

## Tests

```bash
npm test                       # metadata parsing, search words, CSV (no Firebase needed)
npm run emulators              # in another terminal
node scripts/seed-local.mjs && npm run test:rules   # every role against firestore.rules and storage.rules
npm run build
```

## Where things are

```
src/firebase-config.js   the Firebase project's web config
src/lib/api.js           everything that reads or writes Firestore and Storage
src/lib/names.js         reading DV No./date/payee/amount from names, checks, search words, CSV
src/lib/doctypes.js      document types and their required details (edit to customise)
src/pages/Upload.jsx     the folder upload wizard
src/styles.css           the DMS design (only the rules this app uses); src/archives.css: archive-specific parts
firestore.rules          who may read and write what (keep roles in sync with src/lib/roles.js)
storage.rules            the files: read by approved users, uploaded by the Records Officer, deleted by admins
netlify.toml             build, SPA redirect, headers
lifecycle.json           optional Storage rule: files to Coldline 90 days after upload (see above)
```

### Data

| Collection | One document per | Holds |
|------------|------------------|-------|
| `users` | account | name, email, role, active |
| `batches` | uploaded folder | type, fiscal year, month, fund, box no., location, counts, status |
| `records` | document / transaction | DV No., date, payee, amount, particulars…, its files, search words |
| `hashes` | file content (SHA-256) | the record that holds it (duplicate check) |
| `audit` | action | who, what, when |
| `meta/settings` | | funds |

Files: Storage `archives/{folder}/{record}/{path in the uploaded folder}`.
