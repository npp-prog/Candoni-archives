// Roles (Users → Role). Keep in sync with firestore.rules and storage.rules.
//   superadmin   the owner: everything, and gives the Admin role
//   admin        everything: approves users, deletes records, Settings
//   records      Records Officer: uploads folders, edits metadata, reads the audit log
//   user         Viewer: searches, previews and downloads
export const ROLE_NAMES = { superadmin: 'Superadmin', admin: 'Admin', records: 'Records Officer', user: 'Viewer' };
export const canUpload = (role) => ['superadmin', 'admin', 'records'].includes(role);
export const isAdminRole = (role) => ['superadmin', 'admin'].includes(role);
export const readsAudit = canUpload;
