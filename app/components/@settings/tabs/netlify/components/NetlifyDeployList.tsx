import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CloudIcon,
  BuildingLibraryIcon,
  CodeBracketIcon,
  CheckCircleIcon,
  XCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
} from '@heroicons/react/24/outline';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import type { NetlifyDeploy } from '~/types/netlify';

interface NetlifyDeployListProps {
  deploys: NetlifyDeploy[];
  activeSiteId: string;
  isActionLoading: boolean;
  onDeployAction: (siteId: string, deployId: string, action: 'lock' | 'unlock' | 'publish') => void;
}

export default function NetlifyDeployList({
  deploys,
  activeSiteId,
  isActionLoading,
  onDeployAction,
}: NetlifyDeployListProps) {
  if (deploys.length === 0) {
    return null;
  }

  return (
    <div className="bg-bolt-elements-background dark:bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium flex items-center gap-2 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
          <BuildingLibraryIcon className="h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
          Recent Deployments
        </h4>
      </div>
      <div className="space-y-2">
        {deploys.map((deploy) => (
          <div
            key={deploy.id}
            className="bg-bolt-elements-background dark:bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant={deploy.state === 'ready' ? 'default' : deploy.state === 'error' ? 'destructive' : 'outline'}
                  className="flex items-center gap-1"
                >
                  {deploy.state === 'ready' ? (
                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                  ) : deploy.state === 'error' ? (
                    <XCircleIcon className="h-4 w-4 text-red-500" />
                  ) : (
                    <BuildingLibraryIcon className="h-4 w-4 text-bolt-elements-item-contentAccent" />
                  )}
                  <span className="text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                    {deploy.state}
                  </span>
                </Badge>
              </div>
              <span className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                {formatDistanceToNow(new Date(deploy.created_at))} ago
              </span>
            </div>
            {deploy.branch && (
              <div className="mt-2 text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary flex items-center gap-1">
                <CodeBracketIcon className="h-3 w-3 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                <span className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                  Branch: {deploy.branch}
                </span>
              </div>
            )}
            {deploy.deploy_url && (
              <div className="mt-2 text-xs">
                <a
                  href={deploy.deploy_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors text-bolt-elements-link-text hover:text-bolt-elements-link-textHover dark:text-white dark:hover:text-bolt-elements-link-textHover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CloudIcon className="h-3 w-3 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                  <span className="underline decoration-1 underline-offset-2">{deploy.deploy_url}</span>
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDeployAction(activeSiteId, deploy.id, 'publish')}
                disabled={isActionLoading}
                className="flex items-center gap-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
              >
                <BuildingLibraryIcon className="h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                Publish
              </Button>
              {deploy.state === 'ready' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeployAction(activeSiteId, deploy.id, 'lock')}
                  disabled={isActionLoading}
                  className="flex items-center gap-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                >
                  <LockClosedIcon className="h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                  Lock
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeployAction(activeSiteId, deploy.id, 'unlock')}
                  disabled={isActionLoading}
                  className="flex items-center gap-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                >
                  <LockOpenIcon className="h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                  Unlock
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
