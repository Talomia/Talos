import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('persistence-service');

/*
 * ==========================================
 * Types matching the Supabase schema
 * ==========================================
 */

export interface ProjectRecord {
  id: string;
  user_id: string;
  url_id: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  project_id: string;
  user_id: string;
  messages: any[];
  updated_at: string;
}

export interface SnapshotRecord {
  project_id: string;
  user_id: string;
  chat_index: string;
  files: Record<string, any>;
  summary: string | null;
  updated_at: string;
}

export interface ProfileRecord {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Chat item as returned to the client (matches the existing ChatHistoryItem shape).
 */
export interface ChatItem {
  id: string;
  urlId: string;
  description: string;
  messages: any[];
  timestamp: string;
  metadata?: Record<string, any>;
}

/*
 * ==========================================
 * Project (Chat) Operations
 * ==========================================
 */

/**
 * Lists all projects for the authenticated user, ordered by most recent.
 */
export async function listProjects(supabase: SupabaseClient, userId: string): Promise<ChatItem[]> {
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (projectsError) {
    logger.error('Failed to list projects:', projectsError);
    throw new Error(`Failed to list projects: ${projectsError.message}`);
  }

  return (projects || []).map((p: ProjectRecord) => ({
    id: p.id,
    urlId: p.url_id,
    description: p.description || '',
    messages: [], // Don't load messages in list view
    timestamp: p.updated_at,
    metadata: p.metadata,
  }));
}

/**
 * Gets a single project with its messages and optional snapshot.
 */
export async function getProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<{ chat: ChatItem; snapshot?: SnapshotRecord } | null> {
  // Try lookup by ID first, then by url_id
  let { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('id', projectId)
    .single();

  if (error || !project) {
    // Try by url_id
    const result = await supabase.from('projects').select('*').eq('user_id', userId).eq('url_id', projectId).single();

    project = result.data;
    error = result.error;
  }

  if (error || !project) {
    return null;
  }

  // Fetch messages
  const { data: msgData } = await supabase
    .from('messages')
    .select('messages')
    .eq('project_id', project.id)
    .eq('user_id', userId)
    .single();

  // Fetch snapshot
  const { data: snapData } = await supabase
    .from('snapshots')
    .select('*')
    .eq('project_id', project.id)
    .eq('user_id', userId)
    .single();

  return {
    chat: {
      id: project.id,
      urlId: project.url_id,
      description: project.description || '',
      messages: msgData?.messages || [],
      timestamp: project.updated_at,
      metadata: project.metadata,
    },
    snapshot: snapData || undefined,
  };
}

/**
 * Creates or updates a project and its messages.
 */
export async function upsertProject(
  supabase: SupabaseClient,
  userId: string,
  chat: {
    id: string;
    urlId: string;
    description?: string;
    messages: any[];
    metadata?: Record<string, any>;
  },
): Promise<void> {
  // Upsert the project record
  const { error: projectError } = await supabase.from('projects').upsert(
    {
      id: chat.id,
      user_id: userId,
      url_id: chat.urlId,
      description: chat.description || '',
      metadata: chat.metadata || {},
    },
    { onConflict: 'id,user_id' },
  );

  if (projectError) {
    logger.error('Failed to upsert project:', projectError);
    throw new Error(`Failed to save project: ${projectError.message}`);
  }

  // Upsert messages
  const { error: msgError } = await supabase.from('messages').upsert(
    {
      project_id: chat.id,
      user_id: userId,
      messages: chat.messages,
    },
    { onConflict: 'project_id,user_id' },
  );

  if (msgError) {
    logger.error('Failed to upsert messages:', msgError);
    throw new Error(`Failed to save messages: ${msgError.message}`);
  }
}

/**
 * Updates only the project description.
 */
export async function updateProjectDescription(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  description: string,
): Promise<void> {
  const { error } = await supabase.from('projects').update({ description }).eq('id', projectId).eq('user_id', userId);

  if (error) {
    logger.error('Failed to update description:', error);
    throw new Error(`Failed to update description: ${error.message}`);
  }
}

/**
 * Deletes a project and all associated data (messages, snapshots via CASCADE).
 */
export async function deleteProject(supabase: SupabaseClient, userId: string, projectId: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', projectId).eq('user_id', userId);

  if (error) {
    logger.error('Failed to delete project:', error);
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}

/*
 * ==========================================
 * Snapshot Operations
 * ==========================================
 */

/**
 * Gets the snapshot for a project.
 */
export async function getSnapshot(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<SnapshotRecord | null> {
  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Creates or updates a snapshot.
 */
export async function upsertSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshot: {
    projectId: string;
    chatIndex: string;
    files: Record<string, any>;
    summary?: string;
  },
): Promise<void> {
  const { error } = await supabase.from('snapshots').upsert(
    {
      project_id: snapshot.projectId,
      user_id: userId,
      chat_index: snapshot.chatIndex,
      files: snapshot.files,
      summary: snapshot.summary || null,
    },
    { onConflict: 'project_id,user_id' },
  );

  if (error) {
    logger.error('Failed to upsert snapshot:', error);
    throw new Error(`Failed to save snapshot: ${error.message}`);
  }
}

/*
 * ==========================================
 * Profile Operations
 * ==========================================
 */

/**
 * Gets the user's profile.
 */
export async function getProfile(supabase: SupabaseClient, userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (error) {
    logger.error('Failed to get profile:', error);
    return null;
  }

  return data;
}

/**
 * Updates the user's profile.
 */
export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<Pick<ProfileRecord, 'username' | 'bio' | 'avatar_url' | 'settings'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);

  if (error) {
    logger.error('Failed to update profile:', error);
    throw new Error(`Failed to update profile: ${error.message}`);
  }
}
