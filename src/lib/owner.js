// The owner's account: it becomes the superadmin, already approved, once Firebase has verified the
// address (Continue with Google, or the email verification link). Keep in sync with firestore.rules.
export const OWNER_EMAILS = ['npp@mgocandoniaccounting.org'];
export const isOwnerEmail = (email) => OWNER_EMAILS.includes(String(email || '').toLowerCase());
