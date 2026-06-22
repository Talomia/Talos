import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';

/**
 * Provider-specific configuration for deployment dialogs.
 */
export interface DeploymentProviderConfig {
  /** Provider display name, e.g. "GitHub", "GitLab" */
  name: string;

  /** Icon class for the provider logo, e.g. "i-ph:github-logo" */
  logoIcon: string;

  /** Primary brand color, e.g. "purple", "orange" */
  brandColor: string;
}

// --- Shared Dialog Shell ---

interface DialogShellProps {
  isOpen: boolean;
  onClose: () => void;
  width?: string;
  maxHeight?: boolean;
  children: React.ReactNode;
  ariaDescribedBy?: string;
  title: string;
}

/**
 * Shared dialog shell with consistent overlay, animation, and styling.
 * Used by all deployment dialog states (success, auth required, main form).
 */
export function DialogShell({
  isOpen,
  onClose,
  width = 'md:w-[600px]',
  maxHeight = true,
  children,
  ariaDescribedBy,
  title,
}: DialogShellProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
        <div className="fixed inset-0 flex items-center justify-center z-[9999]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`w-[90vw] ${width} ${maxHeight ? 'max-h-[85vh] overflow-y-auto' : ''}`}
          >
            <Dialog.Content
              className="bg-white dark:bg-ui-background-depth-1 rounded-lg border border-ui-borderColor dark:border-ui-borderColor-dark shadow-xl"
              aria-describedby={ariaDescribedBy}
            >
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              {children}
            </Dialog.Content>
          </motion.div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// --- Close Button ---

interface CloseButtonProps {
  onClick: () => void;

  /** If true, uses absolute positioning for top-right corner */
  absolute?: boolean;
}

export function DialogCloseButton({ onClick, absolute = false }: CloseButtonProps) {
  return (
    <Dialog.Close asChild>
      <button
        onClick={onClick}
        className={`${absolute ? 'absolute right-0 top-0 ' : ''}p-2 rounded-lg transition-all duration-200 ease-in-out bg-transparent text-ui-textTertiary hover:text-ui-textPrimary dark:text-ui-textTertiary-dark dark:hover:text-ui-textPrimary-dark hover:bg-ui-background-depth-2 dark:hover:bg-ui-background-depth-3 focus:outline-none focus:ring-2 focus:ring-ui-borderColor dark:focus:ring-ui-borderColor-dark`}
      >
        <span className="i-ph:x block w-5 h-5" aria-hidden="true" />
        <span className="sr-only">Close dialog</span>
      </button>
    </Dialog.Close>
  );
}

// --- Success Dialog ---

interface DeploymentSuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  provider: DeploymentProviderConfig;
  repoUrl: string;
  pushedFiles: { path: string; size: number }[];
  formatSize?: (size: number) => string;
}

/**
 * Shared success dialog shown after a successful deployment to any provider.
 * Displays repo URL with copy button, pushed files list, and action buttons.
 */
export function DeploymentSuccessDialog({
  isOpen,
  onClose,
  provider,
  repoUrl,
  pushedFiles,
  formatSize = (s) => `${(s / 1024).toFixed(1)} KB`,
}: DeploymentSuccessDialogProps) {
  const bgClass = `bg-${provider.brandColor}-500`;
  const hoverBgClass = `hover:bg-${provider.brandColor}-600`;

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Successfully pushed to ${provider.name}`}
      ariaDescribedBy="success-dialog-description"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
              <div className="i-ph:check-circle w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark">
                Successfully pushed to {provider.name}
              </h3>
              <p
                id="success-dialog-description"
                className="text-sm text-ui-textSecondary dark:text-ui-textSecondary-dark"
              >
                Your code is now available on {provider.name}
              </p>
            </div>
          </div>
          <DialogCloseButton onClick={onClose} />
        </div>

        {/* Repository URL */}
        <div className="bg-ui-background-depth-2 dark:bg-ui-background-depth-3 rounded-lg p-4 text-left border border-ui-borderColor dark:border-ui-borderColor-dark">
          <p className="text-sm font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark mb-2 flex items-center gap-2">
            <span className={`${provider.logoIcon} w-4 h-4 text-${provider.brandColor}-500`} />
            Repository URL
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-ui-background-depth-1 dark:bg-ui-background-depth-4 px-3 py-2 rounded border border-ui-borderColor dark:border-ui-borderColor-dark text-ui-textPrimary dark:text-ui-textPrimary-dark font-mono">
              {repoUrl}
            </code>
            <motion.button
              onClick={() => {
                navigator.clipboard.writeText(repoUrl).catch(() => {
                  /* clipboard permission denied */
                });
                toast.success('URL copied to clipboard');
              }}
              className="p-2 text-ui-textSecondary hover:text-ui-textPrimary dark:text-ui-textSecondary-dark dark:hover:text-ui-textPrimary-dark bg-ui-background-depth-1 dark:bg-ui-background-depth-4 rounded-lg border border-ui-borderColor dark:border-ui-borderColor-dark"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="i-ph:copy w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Pushed Files */}
        <div className="bg-ui-background-depth-2 dark:bg-ui-background-depth-3 rounded-lg p-4 border border-ui-borderColor dark:border-ui-borderColor-dark">
          <p className="text-sm font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark mb-2 flex items-center gap-2">
            <span className={`i-ph:files w-4 h-4 text-${provider.brandColor}-500`} />
            Pushed Files ({pushedFiles.length})
          </p>
          <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
            {pushedFiles.slice(0, 100).map((file) => (
              <div
                key={file.path}
                className="flex items-center justify-between py-1.5 text-sm text-ui-textPrimary dark:text-ui-textPrimary-dark border-b border-ui-borderColor/30 dark:border-ui-borderColor-dark/30 last:border-0"
              >
                <span className="font-mono truncate flex-1 text-xs">{file.path}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-ui-background-depth-3 dark:bg-ui-background-depth-4 text-ui-textSecondary dark:text-ui-textSecondary-dark ml-2">
                  {formatSize(file.size)}
                </span>
              </div>
            ))}
            {pushedFiles.length > 100 && (
              <div className="py-2 text-center text-xs text-ui-textSecondary dark:text-ui-textSecondary-dark">
                +{pushedFiles.length - 100} more files
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <motion.a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-4 py-2 rounded-lg ${bgClass} text-white ${hoverBgClass} text-sm inline-flex items-center gap-2`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={`${provider.logoIcon} w-4 h-4`} />
            View Repository
          </motion.a>
          <motion.button
            onClick={() => {
              navigator.clipboard.writeText(repoUrl).catch(() => {
                /* clipboard permission denied */
              });
              toast.success('URL copied to clipboard');
            }}
            className="px-4 py-2 rounded-lg bg-ui-background-depth-2 dark:bg-ui-background-depth-3 text-ui-textSecondary dark:text-ui-textSecondary-dark hover:bg-ui-background-depth-3 dark:hover:bg-ui-background-depth-4 text-sm inline-flex items-center gap-2 border border-ui-borderColor dark:border-ui-borderColor-dark"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="i-ph:copy w-4 h-4" />
            Copy URL
          </motion.button>
          <motion.button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-ui-background-depth-2 dark:bg-ui-background-depth-3 text-ui-textSecondary dark:text-ui-textSecondary-dark hover:bg-ui-background-depth-3 dark:hover:bg-ui-background-depth-4 text-sm border border-ui-borderColor dark:border-ui-borderColor-dark"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Close
          </motion.button>
        </div>
      </div>
    </DialogShell>
  );
}

// --- Connection Required Dialog ---

interface ConnectionRequiredDialogProps {
  isOpen: boolean;
  onClose: () => void;
  provider: DeploymentProviderConfig;
  onConnect: () => void;

  /** Optional extra content to render (e.g., embedded auth dialog) */
  children?: React.ReactNode;
}

/**
 * Shared "not connected" dialog prompting users to connect their account.
 */
export function ConnectionRequiredDialog({
  isOpen,
  onClose,
  provider,
  onConnect,
  children,
}: ConnectionRequiredDialogProps) {
  const bgClass = `bg-${provider.brandColor}-500`;
  const hoverBgClass = `hover:bg-${provider.brandColor}-600`;

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      width="md:w-[500px]"
      maxHeight={false}
      title={`${provider.name} Connection Required`}
      ariaDescribedBy="connection-required-description"
    >
      <div className="p-6">
        <div className="relative text-center space-y-4">
          <DialogCloseButton onClick={onClose} absolute />
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
            className={`mx-auto w-16 h-16 rounded-xl bg-ui-background-depth-3 flex items-center justify-center text-${provider.brandColor}-500`}
          >
            <div className={`${provider.logoIcon} w-8 h-8`} />
          </motion.div>
          <h3 className="text-lg font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark">
            {provider.name} Connection Required
          </h3>
          <p
            id="connection-required-description"
            className="text-sm text-ui-textSecondary dark:text-ui-textSecondary-dark max-w-md mx-auto"
          >
            To deploy your code to {provider.name}, you need to connect your {provider.name} account first.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <motion.button
              className="px-4 py-2 rounded-lg bg-ui-background-depth-2 dark:bg-ui-background-depth-3 text-ui-textSecondary dark:text-ui-textSecondary-dark text-sm hover:bg-ui-background-depth-3 dark:hover:bg-ui-background-depth-4 border border-ui-borderColor dark:border-ui-borderColor-dark"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
            >
              Close
            </motion.button>
            <motion.button
              onClick={onConnect}
              className={`px-4 py-2 rounded-lg ${bgClass} text-white text-sm ${hoverBgClass} inline-flex items-center gap-2`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={`${provider.logoIcon} w-4 h-4`} />
              Connect {provider.name} Account
            </motion.button>
          </div>
        </div>
      </div>
      {children}
    </DialogShell>
  );
}
