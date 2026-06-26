import { AnimatePresence, motion } from 'framer-motion';
import type { LlmErrorAlertType } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: LlmErrorAlertType;
  clearAlert: () => void;
  onRetry?: () => void;
}

export default function LlmErrorAlert({ alert, clearAlert, onRetry }: Props) {
  const { title, description, provider, errorType } = alert;

  const getErrorIcon = () => {
    switch (errorType) {
      case 'authentication':
        return 'i-ph:key-duotone';
      case 'rate_limit':
        return 'i-ph:clock-duotone';
      case 'quota':
        return 'i-ph:warning-circle-duotone';
      case 'network':
        return 'i-ph:wifi-slash-duotone';
      default:
        return 'i-ph:warning-duotone';
    }
  };

  const getErrorMessage = () => {
    switch (errorType) {
      case 'authentication':
        return `Authentication failed with ${provider}. Please check your API key.`;
      case 'rate_limit':
        return `Rate limit exceeded for ${provider}. Please wait a moment before retrying.`;
      case 'quota':
        return `Quota exceeded for ${provider}. Please check your account limits.`;
      case 'network':
        return `Network error while communicating with ${provider}. Check your connection and try again.`;
      default:
        return 'An error occurred while processing your request.';
    }
  };

  const canRetry = errorType !== 'authentication' && errorType !== 'quota';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border border-ui-borderColor bg-ui-background-depth-2 p-4 mb-2"
      >
        <div className="flex items-start">
          <motion.div
            className="flex-shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={`${getErrorIcon()} text-xl text-ui-button-danger-text`}></div>
          </motion.div>

          <div className="ml-3 flex-1">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium text-ui-textPrimary"
            >
              {title}
            </motion.h3>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-sm text-ui-textSecondary"
            >
              <p>{getErrorMessage()}</p>

              {description && (
                <div className="text-xs text-ui-textSecondary p-2 bg-ui-background-depth-3 rounded mt-4 mb-4">
                  Error Details: {description}
                </div>
              )}
            </motion.div>

            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex gap-2">
                {canRetry && onRetry && (
                  <button
                    onClick={() => {
                      clearAlert();
                      onRetry();
                    }}
                    className={classNames(
                      'px-3 py-1.5 rounded-md text-sm font-medium',
                      'bg-ui-button-primary-background',
                      'hover:bg-ui-button-primary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ui-button-primary-background',
                      'text-ui-button-primary-text',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <div className="i-ph:arrow-clockwise text-sm" />
                      Retry
                    </span>
                  </button>
                )}
                <button
                  onClick={clearAlert}
                  className={classNames(
                    'px-2 py-1.5 rounded-md text-sm font-medium',
                    'bg-ui-button-secondary-background',
                    'hover:bg-ui-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ui-button-secondary-background',
                    'text-ui-button-secondary-text',
                  )}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
