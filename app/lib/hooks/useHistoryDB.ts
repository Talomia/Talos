import { useState, useEffect, useRef } from 'react';
import { openDatabase } from '~/lib/persistence/db';

// Create a custom hook to connect to the history database
export function useHistoryDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    // Clean up phantom 'appDB' database from legacy code
    try {
      indexedDB.deleteDatabase('appDB');
    } catch {
      // Best-effort cleanup — failing to delete the legacy DB is harmless
    }

    let cancelled = false;

    const initDB = async () => {
      try {
        setIsLoading(true);

        const database = await openDatabase();

        if (cancelled) {
          database?.close();
          return;
        }

        dbRef.current = database || null;
        setDb(database || null);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error initializing database'));
          setIsLoading(false);
        }
      }
    };

    initDB();

    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  return { db, isLoading, error };
}
