import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { authStore, signIn, signUp, signInWithOAuth, signOut, isAuthenticated, currentUser } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'login' | 'signup';

export function AuthDialog({ isOpen, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const auth = useStore(authStore);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    if (mode === 'signup') {
      const result = await signUp(email, password);

      if (result.success) {
        if (result.confirmEmail) {
          setSuccessMessage('Check your email for a confirmation link!');
        } else {
          onClose();
        }
      } else {
        setLocalError(result.error || 'Signup failed');
      }
    } else {
      const result = await signIn(email, password);

      if (result.success) {
        onClose();
      } else {
        setLocalError(result.error || 'Login failed');
      }
    }
  };

  const handleOAuth = async (provider: string) => {
    const result = await signInWithOAuth(provider);

    if (!result.success) {
      setLocalError(result.error || 'OAuth failed');
    }
  };

  if (!isOpen) {
    return null;
  }

  const error = localError || auth.error;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={classNames(
            'relative w-full max-w-md mx-4 rounded-xl shadow-2xl',
            'bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor',
            'p-6',
          )}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-bolt-elements-textPrimary">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-sm text-bolt-elements-textSecondary mt-1">
              {mode === 'login' ? 'Sign in to your Recurrsive account' : 'Start building with Recurrsive'}
            </p>
          </div>

          {/* OAuth Buttons */}
          <div className="flex flex-col gap-2 mb-4">
            <button
              onClick={() => handleOAuth('github')}
              className={classNames(
                'flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg',
                'border border-bolt-elements-borderColor',
                'text-bolt-elements-textPrimary text-sm font-medium',
                'hover:bg-bolt-elements-background-depth-2 transition-colors',
              )}
            >
              <div className="i-ph:github-logo w-5 h-5" />
              Continue with GitHub
            </button>
            <button
              onClick={() => handleOAuth('google')}
              className={classNames(
                'flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg',
                'border border-bolt-elements-borderColor',
                'text-bolt-elements-textPrimary text-sm font-medium',
                'hover:bg-bolt-elements-background-depth-2 transition-colors',
              )}
            >
              <div className="i-ph:google-logo w-5 h-5" />
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-bolt-elements-borderColor" />
            <span className="text-xs text-bolt-elements-textTertiary">or</span>
            <div className="flex-1 h-px bg-bolt-elements-borderColor" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className={classNames(
                'w-full px-3 py-2.5 rounded-lg text-sm',
                'bg-bolt-elements-prompt-background',
                'border border-bolt-elements-borderColor',
                'text-bolt-elements-textPrimary',
                'placeholder-bolt-elements-textTertiary',
                'focus:outline-none focus:ring-2 focus:ring-accent-500/50',
              )}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className={classNames(
                'w-full px-3 py-2.5 rounded-lg text-sm',
                'bg-bolt-elements-prompt-background',
                'border border-bolt-elements-borderColor',
                'text-bolt-elements-textPrimary',
                'placeholder-bolt-elements-textTertiary',
                'focus:outline-none focus:ring-2 focus:ring-accent-500/50',
              )}
            />
            {mode === 'signup' && (
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                minLength={6}
                className={classNames(
                  'w-full px-3 py-2.5 rounded-lg text-sm',
                  'bg-bolt-elements-prompt-background',
                  'border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary',
                  'placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-2 focus:ring-accent-500/50',
                )}
              />
            )}

            {error && <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}

            {successMessage && (
              <div className="text-sm text-green-500 bg-green-500/10 rounded-lg px-3 py-2">{successMessage}</div>
            )}

            <button
              type="submit"
              disabled={auth.isLoading}
              className={classNames(
                'w-full px-4 py-2.5 rounded-lg text-sm font-medium',
                'bg-accent-500 text-white',
                'hover:bg-accent-600 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {auth.isLoading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="text-center mt-4">
            <span className="text-sm text-bolt-elements-textSecondary">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setLocalError(null);
                  setSuccessMessage(null);
                }}
                className="text-accent-500 hover:text-accent-400 font-medium"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * User avatar/auth button for the header.
 * Shows login button when unauthenticated, avatar when authenticated.
 */
export function AuthButton() {
  const [showDialog, setShowDialog] = useState(false);
  const authenticated = useStore(isAuthenticated);
  const user = useStore(currentUser);
  const [showDropdown, setShowDropdown] = useState(false);

  if (authenticated && user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors"
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name || 'User'} className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center text-white text-xs font-bold">
              {(user.name || user.email || '?')[0].toUpperCase()}
            </div>
          )}
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg shadow-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 py-1">
              <div className="px-3 py-2 border-b border-bolt-elements-borderColor">
                <p className="text-sm font-medium text-bolt-elements-textPrimary truncate">{user.name || 'User'}</p>
                <p className="text-xs text-bolt-elements-textTertiary truncate">{user.email}</p>
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  setShowDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 flex items-center gap-2"
              >
                <div className="i-ph:sign-out w-4 h-4" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className={classNames(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
          'bg-accent-500/10 text-accent-500',
          'hover:bg-accent-500/20 transition-colors',
        )}
      >
        <div className="i-ph:user w-4 h-4" />
        Sign in
      </button>
      <AuthDialog isOpen={showDialog} onClose={() => setShowDialog(false)} />
    </>
  );
}
