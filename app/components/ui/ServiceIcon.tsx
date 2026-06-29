import React, { useState, useCallback } from 'react';
import { classNames } from '~/utils/classNames';

interface ServiceIconProps {
  /** URL for the service icon (e.g. from simpleicons CDN). */
  src: string;

  /** Alt text for the icon. */
  alt: string;

  /** UnoCSS icon class to show as fallback (e.g. 'i-ph:github-logo'). */
  fallbackIcon: string;

  /** Extra classes applied to both the img and the fallback span. */
  className?: string;
}

/**
 * Renders a service icon that gracefully degrades to a Phosphor icon
 * if the remote image fails to load.
 *
 * Eliminates the duplicated `onError` + hidden-sibling pattern
 * previously scattered across DeployButton and other components.
 */
export const ServiceIcon: React.FC<ServiceIconProps> = React.memo(
  ({ src, alt, fallbackIcon, className = 'w-5 h-5' }) => {
    const [failed, setFailed] = useState(false);

    const handleError = useCallback(() => setFailed(true), []);

    if (failed) {
      return <div className={classNames(fallbackIcon, className, 'text-ui-textSecondary')} />;
    }

    return (
      <img
        className={className}
        height="24"
        width="24"
        crossOrigin="anonymous"
        src={src}
        alt={alt}
        onError={handleError}
      />
    );
  },
);
