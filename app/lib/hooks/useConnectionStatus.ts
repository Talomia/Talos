import { useState, useEffect, useRef, useCallback } from 'react';
import { checkConnection } from '~/lib/api/connection';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UseConnectionStatus');

const ACKNOWLEDGED_CONNECTION_ISSUE_KEY = 'app_acknowledged_connection_issue';

type ConnectionIssueType = 'disconnected' | 'high-latency' | null;

const getAcknowledgedIssue = (): string | null => {
  try {
    return localStorage.getItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
  } catch {
    return null;
  }
};

export const useConnectionStatus = () => {
  const [hasConnectionIssues, setHasConnectionIssues] = useState(false);
  const [currentIssue, setCurrentIssue] = useState<ConnectionIssueType>(null);
  const [acknowledgedIssue, setAcknowledgedIssue] = useState<string | null>(() => getAcknowledgedIssue());
  const isMountedRef = useRef(true);
  const acknowledgedRef = useRef(acknowledgedIssue);
  acknowledgedRef.current = acknowledgedIssue;

  const checkStatus = useCallback(async () => {
    try {
      const status = await checkConnection();
      const issue = !status.connected ? 'disconnected' : status.latency > 1000 ? 'high-latency' : null;

      if (!isMountedRef.current) {
        return;
      }

      setCurrentIssue(issue);

      // Only show issues if they're new or different from the acknowledged one
      setHasConnectionIssues(issue !== null && issue !== acknowledgedRef.current);
    } catch (error) {
      logger.error('Failed to check connection:', error);

      if (!isMountedRef.current) {
        return;
      }

      // Show connection issues if we can't even check the status
      setCurrentIssue('disconnected');
      setHasConnectionIssues(true);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // Check immediately and then every 10 seconds
    checkStatus();

    const interval = setInterval(checkStatus, 10 * 1000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [checkStatus]);

  const acknowledgeIssue = () => {
    setAcknowledgedIssue(currentIssue);
    setHasConnectionIssues(false);

    try {
      if (currentIssue) {
        localStorage.setItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY, currentIssue);
      } else {
        localStorage.removeItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
      }
    } catch {
      // localStorage may be unavailable
    }
  };

  const resetAcknowledgment = () => {
    setAcknowledgedIssue(null);

    try {
      localStorage.removeItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
    } catch {
      // localStorage may be unavailable
    }

    checkStatus();
  };

  return { hasConnectionIssues, currentIssue, acknowledgeIssue, resetAcknowledgment };
};
