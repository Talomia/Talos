// DEPRECATED: This file is dead code. The phantom 'appDB' database it opened
// was never meaningfully used. All consumers now use useHistoryDB from
// ~/lib/hooks/useHistoryDB which opens the correct 'appHistory' database.
//
// This file should be deleted. It only remains because the deletion command
// was not approved during the automated fix.
//
// Re-export useHistoryDB as useIndexedDB for any straggling imports:
export { useHistoryDB as useIndexedDB } from '~/lib/hooks/useHistoryDB';
