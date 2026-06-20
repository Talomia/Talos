import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/Button';
import type { VercelProject } from '~/types/vercel';
import type { ProjectAction } from './vercelActions';

interface VercelProjectListProps {
  projects: VercelProject[];
  projectActions: ProjectAction[];
  isProjectActionLoading: boolean;
  onProjectAction: (projectId: string, action: ProjectAction) => void;
}

export function VercelProjectList({
  projects,
  projectActions,
  isProjectActionLoading,
  onProjectAction,
}: VercelProjectListProps) {
  if (!projects.length) {
    return (
      <div className="text-sm text-ui-textSecondary flex items-center gap-2 p-4">
        <div className="i-ph:info w-4 h-4" />
        No projects found in your Vercel account
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <div
          key={project.id}
          className="p-4 rounded-lg border border-ui-borderColor hover:border-ui-borderColorActive/70 transition-colors bg-ui-background-depth-1"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h5 className="text-sm font-medium text-ui-textPrimary flex items-center gap-2">
                <div className="i-ph:globe w-4 h-4 text-ui-borderColorActive" />
                {project.name}
              </h5>
              <ProjectUrl project={project} />

              {/* Project Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-ui-borderColor">
                <DetailCell icon="i-ph:rocket" label="Deployments" value="--" />
                <DetailCell icon="i-ph:globe" label="Domains" value="--" />
                <DetailCell icon="i-ph:users" label="Team" value="--" />
                <DetailCell icon="i-ph:activity" label="Bandwidth" value="--" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DeploymentBadge project={project} />
              {project.framework && (
                <div className="text-xs text-ui-textSecondary px-2 py-1 rounded-md bg-ui-background-depth-2">
                  <span className="flex items-center gap-1">
                    <div className="i-ph:code w-3 h-3" />
                    {project.framework}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://vercel.com/dashboard/${project.id}`, '_blank')}
                className="flex items-center gap-1 text-ui-textPrimary dark:text-ui-textPrimary"
              >
                <div className="i-ph:arrow-square-out w-3 h-3" />
                View
              </Button>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-1 mt-3 pt-3 border-t border-ui-borderColor">
            {projectActions.map((action) => (
              <Button
                key={action.name}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={() => onProjectAction(project.id, action)}
                disabled={isProjectActionLoading}
                className="flex items-center gap-1 text-xs px-2 py-1 text-ui-textPrimary dark:text-ui-textPrimary"
              >
                <div className={`${action.icon} w-2.5 h-2.5`} />
                {action.name}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectUrl({ project }: { project: VercelProject }) {
  if (project.targets?.production?.alias && project.targets.production.alias.length > 0) {
    const displayAlias =
      project.targets.production.alias.find(
        (a: string) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app'),
      ) || project.targets.production.alias[0];

    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-ui-textSecondary">
        <a
          href={`https://${displayAlias}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ui-borderColorActive underline"
        >
          {displayAlias}
        </a>
        <span>•</span>
        <span className="flex items-center gap-1">
          <div className="i-ph:clock w-3 h-3" />
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
    );
  }

  if (project.latestDeployments && project.latestDeployments.length > 0) {
    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-ui-textSecondary">
        <a
          href={`https://${project.latestDeployments[0].url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ui-borderColorActive underline"
        >
          {project.latestDeployments[0].url}
        </a>
        <span>•</span>
        <span className="flex items-center gap-1">
          <div className="i-ph:clock w-3 h-3" />
          {new Date(project.latestDeployments[0].created).toLocaleDateString()}
        </span>
      </div>
    );
  }

  return null;
}

function DeploymentBadge({ project }: { project: VercelProject }) {
  if (!project.latestDeployments || project.latestDeployments.length === 0) {
    return null;
  }

  const state = project.latestDeployments[0].state;

  return (
    <div
      className={classNames(
        'flex items-center gap-1 px-2 py-1 rounded-full text-xs',
        state === 'READY'
          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
          : state === 'ERROR'
            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      )}
    >
      <div
        className={classNames(
          'w-2 h-2 rounded-full',
          state === 'READY' ? 'bg-green-500' : state === 'ERROR' ? 'bg-red-500' : 'bg-yellow-500',
        )}
      />
      {state}
    </div>
  );
}

function DetailCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-ui-textPrimary">
        {/* {label} - This would be fetched from API */}
        {value}
      </div>
      <div className="text-xs text-ui-textSecondary flex items-center justify-center gap-1">
        <div className={`${icon} w-3 h-3`} />
        {label}
      </div>
    </div>
  );
}
