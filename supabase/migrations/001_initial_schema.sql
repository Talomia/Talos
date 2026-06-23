-- ============================================
-- Talos — Supabase Schema Migration
-- ============================================
-- This migration creates the core tables for
-- server-side persistence of chats, snapshots,
-- user profiles, and settings.
-- ============================================

-- ==========================================
-- 1. PROFILES TABLE
-- ==========================================
-- Extends Supabase auth.users with app-specific profile data.
-- Auto-created on signup via trigger.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  bio TEXT,
  avatar_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 2. PROJECTS TABLE
-- ==========================================
-- A "project" in Talos maps to a chat session
-- where the user builds an application.

CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url_id TEXT NOT NULL,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  PRIMARY KEY (id, user_id),
  UNIQUE (url_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON public.projects(user_id, updated_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects_insert_own" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects_delete_own" ON public.projects
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ==========================================
-- 3. MESSAGES TABLE
-- ==========================================
-- Chat messages stored per-project.
-- Using JSONB array for the full message list
-- (matches the AI SDK Message format).

CREATE TABLE IF NOT EXISTS public.messages (
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id, user_id) REFERENCES public.projects(id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "messages_delete_own" ON public.messages
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ==========================================
-- 4. SNAPSHOTS TABLE
-- ==========================================
-- File tree snapshots for each project.
-- Stores the complete file state at a point in the chat.

CREATE TABLE IF NOT EXISTS public.snapshots (
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_index TEXT DEFAULT '' NOT NULL,
  files JSONB DEFAULT '{}'::jsonb NOT NULL,
  summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id, user_id) REFERENCES public.projects(id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_own" ON public.snapshots
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "snapshots_insert_own" ON public.snapshots
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "snapshots_update_own" ON public.snapshots
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "snapshots_delete_own" ON public.snapshots
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ==========================================
-- 5. UPDATED_AT TRIGGER
-- ==========================================
-- Automatically updates `updated_at` on row modification.

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply to all tables
DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.projects;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.messages;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.snapshots;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- 6. SECURITY HARDENING
-- ==========================================
-- Revoke anon access on all tables (only authenticated users should access via RLS)
-- This prevents GraphQL schema exposure to unauthenticated users.

REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.snapshots FROM anon;

-- Revoke direct EXECUTE on internal functions from all API roles.
-- handle_new_user: only called by auth.users trigger (SECURITY DEFINER)
-- update_updated_at: only called by BEFORE UPDATE triggers

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
