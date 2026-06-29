import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { sanitizeRepoName } from '~/components/deploy/deployUtils';

/**
 * UnoCSS safelist — these classes are composed dynamically via `brandColor` prop.
 * Keep them here so UnoCSS can detect them statically.
 * @unocss-include bg-purple-500 bg-orange-500 text-purple-500 text-orange-500
 * @unocss-include text-purple-600 text-orange-600 text-purple-400 text-orange-400
 * @unocss-include focus:ring-purple-500 focus:ring-orange-500
 */

interface UserInfoCardProps {
  avatarUrl: string;
  displayName: string;
  username: string;
  brandColor: string;
  providerIcon: string;

  /** Extra avatar rendering (e.g. GitLab fallback handling). If provided, replaces default img. */
  renderAvatar?: () => React.ReactNode;
}

function UserInfoCard({ avatarUrl, displayName, username, brandColor, providerIcon, renderAvatar }: UserInfoCardProps) {
  return (
    <div className="flex items-center gap-3 mb-6 p-4 bg-ui-background-depth-2 dark:bg-ui-background-depth-3 rounded-lg border border-ui-borderColor dark:border-ui-borderColor-dark">
      <div className="relative">
        {renderAvatar ? renderAvatar() : <img src={avatarUrl} alt={username} className="w-10 h-10 rounded-full" />}
        <div
          className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-${brandColor}-500 flex items-center justify-center text-white`}
        >
          <div className={`${providerIcon} w-3 h-3`} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark">{displayName}</p>
        <p className="text-sm text-ui-textSecondary dark:text-ui-textSecondary-dark">@{username}</p>
      </div>
    </div>
  );
}

interface RepoNameInputProps {
  repoName: string;
  brandColor: string;
  onChange: (value: string) => void;

  /** Whether to show the sanitized-name preview below the input */
  showSanitizedPreview?: boolean;

  /** Max length for the input field */
  maxLength?: number;
}

function RepoNameInput({
  repoName,
  brandColor,
  onChange,
  showSanitizedPreview = false,
  maxLength,
}: RepoNameInputProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="repoName" className="text-sm text-ui-textSecondary dark:text-ui-textSecondary-dark">
        Repository Name
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-textTertiary dark:text-ui-textTertiary-dark">
          <span className="i-ph:git-branch w-4 h-4" />
        </div>
        <input
          id="repoName"
          type="text"
          value={repoName}
          onChange={(e) => onChange(e.target.value)}
          placeholder="my-awesome-project"
          className={`w-full pl-10 px-4 py-2 rounded-lg bg-ui-background-depth-2 dark:bg-ui-background-depth-3 border border-ui-borderColor dark:border-ui-borderColor-dark text-ui-textPrimary dark:text-ui-textPrimary-dark placeholder-ui-textTertiary dark:placeholder-ui-textTertiary-dark focus:outline-none focus:ring-2 focus:ring-${brandColor}-500`}
          required
          maxLength={maxLength}
          pattern={maxLength ? '[a-zA-Z0-9\\-_\\s]+' : undefined}
          title={
            maxLength ? 'Repository name can contain letters, numbers, hyphens, underscores, and spaces' : undefined
          }
        />
      </div>
      {showSanitizedPreview && repoName && sanitizeRepoName(repoName) !== repoName && (
        <p className="text-xs text-ui-textSecondary dark:text-ui-textSecondary-dark mt-1">
          Will be created as:{' '}
          <span className={`font-mono text-${brandColor}-600 dark:text-${brandColor}-400`}>
            {sanitizeRepoName(repoName)}
          </span>
        </p>
      )}
    </div>
  );
}

interface PrivateRepoCheckboxProps {
  isPrivate: boolean;
  brandColor: string;
  onChange: (checked: boolean) => void;
}

function PrivateRepoCheckbox({ isPrivate, brandColor, onChange }: PrivateRepoCheckboxProps) {
  return (
    <div className="p-3 bg-ui-background-depth-2 dark:bg-ui-background-depth-3 rounded-lg border border-ui-borderColor dark:border-ui-borderColor-dark">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="private"
          checked={isPrivate}
          onChange={(e) => onChange(e.target.checked)}
          className={`rounded border-ui-borderColor dark:border-ui-borderColor-dark text-${brandColor}-500 focus:ring-${brandColor}-500 dark:bg-ui-background-depth-3`}
        />
        <label htmlFor="private" className="text-sm text-ui-textPrimary dark:text-ui-textPrimary-dark">
          Make repository private
        </label>
      </div>
      <p className="text-xs text-ui-textTertiary dark:text-ui-textTertiary-dark mt-2 ml-6">
        Private repositories are only visible to you and people you share them with
      </p>
    </div>
  );
}

interface DeploymentFormShellProps {
  isOpen: boolean;
  onClose: () => void;
  brandColor: string;
  providerIcon: string;
  providerName: string;

  /** User info for the header card */
  avatarUrl: string;
  displayName: string;
  username: string;

  /** Optional custom avatar rendering (e.g. GitLab CORS fallback) */
  renderAvatar?: () => React.ReactNode;

  /** Repo name input */
  repoName: string;
  onRepoNameChange: (value: string) => void;

  /** Whether to show sanitized name preview (GitHub uses it) */
  showSanitizedPreview?: boolean;

  /** Max length for repo name (GitHub uses 100) */
  repoNameMaxLength?: number;

  /** Private checkbox */
  isPrivate: boolean;
  onPrivateChange: (checked: boolean) => void;

  /** Form submission */
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;

  /** Slot for provider-specific content between repo name and private checkbox */
  children?: React.ReactNode;
}

/**
 * Shared deployment form layout with dialog shell, header, user card,
 * repo name input, private checkbox, and submit/cancel buttons.
 * Provider-specific content (e.g. repo list) is injected via children.
 */
export function DeploymentFormShell({
  isOpen,
  onClose,
  brandColor,
  providerIcon,
  providerName,
  avatarUrl,
  displayName,
  username,
  renderAvatar,
  repoName,
  onRepoNameChange,
  showSanitizedPreview = false,
  repoNameMaxLength,
  isPrivate,
  onPrivateChange,
  isLoading,
  onSubmit,
  children,
}: DeploymentFormShellProps) {
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
            className="w-[90vw] md:w-[500px]"
          >
            <Dialog.Content
              className="bg-white dark:bg-ui-background-depth-1 rounded-lg border border-ui-borderColor dark:border-ui-borderColor-dark shadow-xl"
              aria-describedby="push-dialog-description"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`w-10 h-10 rounded-xl bg-ui-background-depth-3 flex items-center justify-center text-${brandColor}-500`}
                  >
                    <div className={`${providerIcon} w-5 h-5`} />
                  </motion.div>
                  <div>
                    <Dialog.Title className="text-lg font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark">
                      Deploy to {providerName}
                    </Dialog.Title>
                    <p
                      id="push-dialog-description"
                      className="text-sm text-ui-textSecondary dark:text-ui-textSecondary-dark"
                    >
                      Deploy your code to a new or existing {providerName} repository
                    </p>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      onClick={onClose}
                      className="ml-auto p-2 rounded-lg transition-all duration-200 ease-in-out bg-transparent text-ui-textTertiary hover:text-ui-textPrimary dark:text-ui-textTertiary-dark dark:hover:text-ui-textPrimary-dark hover:bg-ui-background-depth-2 dark:hover:bg-ui-background-depth-3 focus:outline-none focus:ring-2 focus:ring-ui-borderColor dark:focus:ring-ui-borderColor-dark"
                    >
                      <span className="i-ph:x block w-5 h-5" aria-hidden="true" />
                      <span className="sr-only">Close dialog</span>
                    </button>
                  </Dialog.Close>
                </div>

                {/* User Info Card */}
                <UserInfoCard
                  avatarUrl={avatarUrl}
                  displayName={displayName}
                  username={username}
                  brandColor={brandColor}
                  providerIcon={providerIcon}
                  renderAvatar={renderAvatar}
                />

                {/* Form */}
                <form onSubmit={onSubmit} className="space-y-4">
                  <RepoNameInput
                    repoName={repoName}
                    brandColor={brandColor}
                    onChange={onRepoNameChange}
                    showSanitizedPreview={showSanitizedPreview}
                    maxLength={repoNameMaxLength}
                  />

                  {/* Provider-specific content (repo list, etc.) */}
                  {children}

                  <PrivateRepoCheckbox isPrivate={isPrivate} brandColor={brandColor} onChange={onPrivateChange} />

                  {/* Action buttons */}
                  <div className="pt-4 flex gap-2">
                    <motion.button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg bg-ui-background-depth-2 dark:bg-ui-background-depth-3 text-ui-textSecondary dark:text-ui-textSecondary-dark hover:bg-ui-background-depth-3 dark:hover:bg-ui-background-depth-4 text-sm border border-ui-borderColor dark:border-ui-borderColor-dark"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="submit"
                      disabled={isLoading}
                      className={classNames(
                        `flex-1 px-4 py-2 bg-${brandColor}-500 text-white rounded-lg hover:bg-${brandColor}-600 text-sm inline-flex items-center justify-center gap-2`,
                        isLoading ? 'opacity-50 cursor-not-allowed' : '',
                      )}
                      whileHover={!isLoading ? { scale: 1.02 } : {}}
                      whileTap={!isLoading ? { scale: 0.98 } : {}}
                    >
                      {isLoading ? (
                        <>
                          <div className="i-ph:spinner-gap animate-spin w-4 h-4" />
                          Deploying...
                        </>
                      ) : (
                        <>
                          <div className={`${providerIcon} w-4 h-4`} />
                          Deploy to {providerName}
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              </div>
            </Dialog.Content>
          </motion.div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
