# Candoni Archives: conventions for changes

- **Git:** work on a branch and push only that branch. Never push to, merge into or open a merge
  to `main` unless the owner asks for it in so many words: the owner moves changes to `main`.
- **Design:** the DMS design (`src/styles.css`, trimmed to the rules used here; `src/archives.css` for
  archive-only parts). Dropdowns use `src/components/Select.jsx`, never a bare `<select>`.
- **No example data in fields:** no "e.g. …" placeholders or sample values; a placeholder may only say
  what to do ("Search…"). Explanations go in help text under the field.
- **No description under page titles.**
- **Roles:** keep `src/lib/roles.js`, `firestore.rules` and `storage.rules` in sync. Rules changes
  are published by `.github/workflows/publish-rules.yml` when they reach `main` (once its secret is set).
- **Folder identity:** `folderLockId` (src/lib/names.js) and `folderKeyOf` (firestore.rules) must stay
  identical: name (capitals and ASCII spaces ignored), main type, fund.
- **Tests:** `npm test`; rules: `npm run emulators`, `node scripts/seed-local.mjs`, `npm run test:rules`;
  build: `npm run build`.
