/**
 * Central Application Configuration
 * ==================================
 * The ONLY place where product-specific naming is defined.
 * All other files import from here — no hardcoded brand names anywhere.
 *
 * To rebrand: change values here. Everything else follows automatically.
 */

/*
 * ---------------------------------------------------------------------------
 * XML Tags — used for LLM ↔ Parser communication
 * ---------------------------------------------------------------------------
 */
export const ARTIFACT_TAG_OPEN = '<artifact';
export const ARTIFACT_TAG_CLOSE = '</artifact>';
export const ACTION_TAG_OPEN = '<action';
export const ACTION_TAG_CLOSE = '</action>';
export const QUICK_ACTIONS_TAG_OPEN = '<quick-actions>';
export const QUICK_ACTIONS_TAG_CLOSE = '</quick-actions>';
export const QUICK_ACTION_ELEMENT = 'quick-action';
export const MODIFICATIONS_TAG = 'file_modifications';

/*
 * ---------------------------------------------------------------------------
 * CSS Class Names — used in rendered markdown / chat messages
 * ---------------------------------------------------------------------------
 */
export const CSS_CLASS_ARTIFACT = '__codeArtifact__';
export const CSS_CLASS_THOUGHT = '__assistantThought__';
export const CSS_CLASS_QUICK_ACTION = '__quickAction__';

/*
 * ---------------------------------------------------------------------------
 * Storage Keys — localStorage key names
 * ---------------------------------------------------------------------------
 */
export const STORAGE_KEYS = {
  theme: 'app_theme',
  userProfile: 'app_user_profile',
  profile: 'app_profile',
  tabConfiguration: 'app_tab_configuration',
  deletedPaths: 'app_deleted_paths',
  readLogs: 'app_read_logs',
  currentModel: 'app_current_model',
  currentProvider: 'app_current_provider',
  projectType: 'app_project_type',
  gitInfo: 'app_git_info',
  pinnedChats: 'app_pinned_chats',
  feedback: 'app_feedback',
  githubConnection: 'github_connection',
  gitlabConnection: 'gitlab_connection',
  netlifyConnection: 'netlify_connection',
  vercelConnection: 'vercel_connection',
  isDebugMode: 'app_debug_mode',
  errorLogs: 'app_error_logs',
  lastAcknowledgedUpdate: 'app_last_acknowledged_update',
  features: 'app_features',
} as const;

/*
 * ---------------------------------------------------------------------------
 * Window Globals
 * ---------------------------------------------------------------------------
 */
export const WINDOW_WORKBENCH_STORE = '__workbench_store';

/*
 * ---------------------------------------------------------------------------
 * Deployment
 * ---------------------------------------------------------------------------
 */
export const DEPLOY_PREFIX = 'app';

/*
 * ---------------------------------------------------------------------------
 * Config Folder (template convention)
 * ---------------------------------------------------------------------------
 */
export const CONFIG_FOLDER = '.config';
