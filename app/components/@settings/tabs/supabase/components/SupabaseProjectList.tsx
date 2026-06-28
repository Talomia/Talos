import { useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/Button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import type { SupabaseProject } from '~/lib/stores/supabase';
import type { SupabaseStats, SupabaseCredentials } from '~/types/supabase';
import { projectActions } from './supabaseActions';
import type { ProjectAction } from './supabaseActions';

interface SupabaseProjectListProps {
  stats?: SupabaseStats;
  token: string;
  credentials?: SupabaseCredentials;
  selectedProjectId: string;
  fetchingStats: boolean;
  fetchingApiKeys: boolean;
  onProjectSelect: (projectId: string) => void;
}

export function SupabaseProjectList({
  stats,
  token,
  credentials,
  selectedProjectId,
  fetchingStats,
  fetchingApiKeys,
  onProjectSelect,
}: SupabaseProjectListProps) {
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isProjectActionLoading, setIsProjectActionLoading] = useState(false);

  const handleProjectAction = async (projectId: string, action: ProjectAction) => {
    if (action.requiresConfirmation) {
      if (!confirm(`Are you sure you want to ${action.name.toLowerCase()}?`)) {
        return;
      }
    }

    setIsProjectActionLoading(true);
    await action.action(projectId, token);
    setIsProjectActionLoading(false);
  };

  if (fetchingStats) {
    return (
      <div className="flex items-center gap-2 text-sm text-ui-textSecondary">
        <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
        Fetching Supabase projects...
      </div>
    );
  }

  return (
    <Collapsible open={isProjectsExpanded} onOpenChange={setIsProjectsExpanded}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 rounded-lg bg-ui-background dark:bg-ui-background-depth-2 border border-ui-borderColor dark:border-ui-borderColor hover:border-ui-borderColorActive/70 dark:hover:border-ui-borderColorActive/70 transition-all duration-200 cursor-pointer">
          <div className="flex items-center gap-2">
            <div className="i-ph:database w-4 h-4 text-ui-item-contentAccent" />
            <span className="text-sm font-medium text-ui-textPrimary">Your Projects ({stats?.totalProjects || 0})</span>
          </div>
          <div
            className={classNames(
              'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-ui-textSecondary',
              isProjectsExpanded ? 'rotate-180' : '',
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="space-y-4 mt-4">
          {/* Supabase Overview Dashboard */}
          {stats?.projects?.length ? (
            <div className="mb-6 p-4 bg-ui-background-depth-1 rounded-lg border border-ui-borderColor">
              <h4 className="text-sm font-medium text-ui-textPrimary mb-3">Supabase Overview</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-ui-textPrimary">{stats.totalProjects}</div>
                  <div className="text-xs text-ui-textSecondary">Total Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-ui-textPrimary">
                    {stats.projects.filter((p: SupabaseProject) => p.status === 'ACTIVE_HEALTHY').length}
                  </div>
                  <div className="text-xs text-ui-textSecondary">Active Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-ui-textPrimary">
                    {new Set(stats.projects.map((p: SupabaseProject) => p.region)).size}
                  </div>
                  <div className="text-xs text-ui-textSecondary">Regions Used</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-ui-textPrimary">
                    {stats.projects.filter((p: SupabaseProject) => p.status !== 'ACTIVE_HEALTHY').length}
                  </div>
                  <div className="text-xs text-ui-textSecondary">Inactive Projects</div>
                </div>
              </div>
            </div>
          ) : null}

          {stats?.projects?.length ? (
            <div className="grid gap-3">
              {stats.projects.map((project: SupabaseProject) => (
                <div
                  key={project.id}
                  className={classNames(
                    'p-4 rounded-lg border transition-colors bg-ui-background-depth-1 cursor-pointer',
                    selectedProjectId === project.id
                      ? 'border-ui-item-contentAccent bg-ui-item-backgroundActive/10'
                      : 'border-ui-borderColor hover:border-ui-borderColorActive/70',
                  )}
                  onClick={() => onProjectSelect(project.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h5 className="text-sm font-medium text-ui-textPrimary flex items-center gap-2">
                        <div className="i-ph:database w-4 h-4 text-ui-borderColorActive" />
                        {project.name}
                      </h5>
                      <div className="flex items-center gap-2 mt-2 text-xs text-ui-textSecondary">
                        <span className="flex items-center gap-1">
                          <div className="i-ph:globe w-3 h-3" />
                          {project.region}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <div className="i-ph:clock w-3 h-3" />
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span
                          className={classNames(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                            project.status === 'ACTIVE_HEALTHY'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : project.status === 'SUSPENDED'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                : project.status === 'INACTIVE'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                                  : 'bg-ui-background-depth-3 text-ui-textPrimary',
                          )}
                        >
                          <div
                            className={classNames(
                              'w-2 h-2 rounded-full',
                              project.status === 'ACTIVE_HEALTHY'
                                ? 'bg-green-500'
                                : project.status === 'SUSPENDED'
                                  ? 'bg-red-500'
                                  : project.status === 'INACTIVE'
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-500',
                            )}
                          />
                          {project.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Project Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-ui-borderColor">
                        <div className="text-center">
                          <div className="text-sm font-semibold text-ui-textPrimary">
                            {project.stats?.database?.tables ?? '--'}
                          </div>
                          <div className="text-xs text-ui-textSecondary flex items-center justify-center gap-1">
                            <div className="i-ph:table w-3 h-3" />
                            Tables
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-semibold text-ui-textPrimary">
                            {project.stats?.storage?.buckets ?? '--'}
                          </div>
                          <div className="text-xs text-ui-textSecondary flex items-center justify-center gap-1">
                            <div className="i-ph:folder w-3 h-3" />
                            Buckets
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-semibold text-ui-textPrimary">
                            {project.stats?.functions?.deployed ?? '--'}
                          </div>
                          <div className="text-xs text-ui-textSecondary flex items-center justify-center gap-1">
                            <div className="i-ph:code w-3 h-3" />
                            Functions
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-semibold text-ui-textPrimary">
                            {project.stats?.database?.size_mb ? `${project.stats.database.size_mb} MB` : '--'}
                          </div>
                          <div className="text-xs text-ui-textSecondary flex items-center justify-center gap-1">
                            <div className="i-ph:database w-3 h-3" />
                            DB Size
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedProjectId === project.id && (
                    <div className="space-y-4 mt-4 pt-4 border-t border-ui-borderColor">
                      <div className="flex flex-wrap items-center gap-1">
                        {projectActions.map((action) => (
                          <Button
                            key={action.name}
                            variant={action.variant || 'outline'}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectAction(project.id, action);
                            }}
                            disabled={isProjectActionLoading || (action.name === 'Get API Keys' && fetchingApiKeys)}
                            className="flex items-center gap-1 text-xs px-2 py-1 text-ui-textPrimary dark:text-ui-textPrimary"
                          >
                            <div className={`${action.icon} w-2.5 h-2.5`} />
                            {action.name === 'Get API Keys' && fetchingApiKeys ? 'Fetching...' : action.name}
                          </Button>
                        ))}
                      </div>

                      {/* Project Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-ui-background-depth-2 p-3 rounded-lg space-y-2">
                          <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2">
                            <div className="i-ph:database w-4 h-4 text-ui-item-contentAccent" />
                            Database Schema
                          </h6>
                          <div className="space-y-1 text-xs text-ui-textSecondary">
                            <div className="flex justify-between">
                              <span>Tables:</span>
                              <span>{project.stats?.database?.tables ?? '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Views:</span>
                              <span>{project.stats?.database?.views ?? '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Functions:</span>
                              <span>{project.stats?.database?.functions ?? '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Size:</span>
                              <span>
                                {project.stats?.database?.size_mb ? `${project.stats.database.size_mb} MB` : '--'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-ui-background-depth-2 p-3 rounded-lg space-y-2">
                          <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2">
                            <div className="i-ph:folder w-4 h-4 text-ui-item-contentAccent" />
                            Storage
                          </h6>
                          <div className="space-y-1 text-xs text-ui-textSecondary">
                            <div className="flex justify-between">
                              <span>Buckets:</span>
                              <span>{project.stats?.storage?.buckets ?? '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Files:</span>
                              <span>{project.stats?.storage?.files ?? '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Used:</span>
                              <span>
                                {project.stats?.storage?.used_gb ? `${project.stats.storage.used_gb} GB` : '--'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Available:</span>
                              <span>
                                {project.stats?.storage?.available_gb
                                  ? `${project.stats.storage.available_gb} GB`
                                  : '--'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {credentials && (
                        <div className="bg-ui-background-depth-2 p-3 rounded-lg space-y-2">
                          <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2">
                            <div className="i-ph:key w-4 h-4 text-ui-item-contentAccent" />
                            Project Credentials
                          </h6>
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-ui-textSecondary">Supabase URL:</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="text"
                                  value={credentials.supabaseUrl || ''}
                                  readOnly
                                  className="flex-1 px-2 py-1 text-xs bg-ui-background border border-ui-borderColor rounded"
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();

                                    if (credentials?.supabaseUrl) {
                                      navigator.clipboard.writeText(credentials.supabaseUrl);
                                      toast.success('URL copied to clipboard');
                                    }
                                  }}
                                  className="w-8 h-8"
                                >
                                  <div className="i-ph:copy w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-ui-textSecondary">Anon Key:</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="password"
                                  value={credentials.anonKey || ''}
                                  readOnly
                                  className="flex-1 px-2 py-1 text-xs bg-ui-background border border-ui-borderColor rounded"
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();

                                    if (credentials?.anonKey) {
                                      navigator.clipboard.writeText(credentials.anonKey);
                                      toast.success('Key copied to clipboard');
                                    }
                                  }}
                                  className="w-8 h-8"
                                >
                                  <div className="i-ph:copy w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-ui-textSecondary flex items-center gap-2 p-4">
              <div className="i-ph:info w-4 h-4" />
              No projects found in your Supabase account
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
