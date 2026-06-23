import { useState, useEffect } from 'react';
import { createScopedLogger } from '~/utils/logger';
import { STORAGE_KEYS } from '~/lib/app-config';

const logger = createScopedLogger('Features');

interface Feature {
  id: string;
  name: string;
  description: string;
  viewed: boolean;
  releaseDate: string;
}

const FEATURE_REGISTRY: Feature[] = [
  {
    id: 'cortex-context-graph',
    name: 'Context Graph',
    description: 'Git-like versioning for AI conversation context with branching and merging',
    viewed: false,
    releaseDate: '2026-06-23',
  },
  {
    id: 'cortex-think-flow',
    name: 'ThinkFlow',
    description: 'Parallel thinking orchestration for multi-path AI reasoning',
    viewed: false,
    releaseDate: '2026-06-23',
  },
  {
    id: 'cloud-sync',
    name: 'Cloud Sync',
    description: 'Cross-device synchronization of projects, settings, and chat history',
    viewed: false,
    releaseDate: '2026-06-23',
  },
];

const getFeatureFlags = (): Feature[] => {
  const viewedIds = getViewedFeatures();
  return FEATURE_REGISTRY.map((feature) => ({
    ...feature,
    viewed: viewedIds.includes(feature.id),
  }));
};

const markFeatureViewed = (featureId: string): void => {
  const viewedIds = getViewedFeatures();

  if (!viewedIds.includes(featureId)) {
    setViewedFeatures([...viewedIds, featureId]);
  }
};

const getViewedFeatures = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.features);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setViewedFeatures = (featureIds: string[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.features, JSON.stringify(featureIds));
  } catch (error) {
    logger.error('Failed to persist viewed features:', error);
  }
};

export const useFeatures = () => {
  const [hasNewFeatures, setHasNewFeatures] = useState(false);
  const [unviewedFeatures, setUnviewedFeatures] = useState<Feature[]>([]);
  const [viewedFeatureIds, setViewedFeatureIds] = useState<string[]>(() => getViewedFeatures());

  useEffect(() => {
    const checkNewFeatures = () => {
      try {
        const features = getFeatureFlags();
        const unviewed = features.filter((feature) => !viewedFeatureIds.includes(feature.id));
        setUnviewedFeatures(unviewed);
        setHasNewFeatures(unviewed.length > 0);
      } catch (error) {
        logger.error('Failed to check for new features:', error);
      }
    };

    checkNewFeatures();
  }, [viewedFeatureIds]);

  const acknowledgeFeature = (featureId: string) => {
    try {
      markFeatureViewed(featureId);

      const newViewedIds = [...viewedFeatureIds, featureId];
      setViewedFeatureIds(newViewedIds);
      setViewedFeatures(newViewedIds);
      setUnviewedFeatures((prev) => {
        const next = prev.filter((f) => f.id !== featureId);
        setHasNewFeatures(next.length > 0);

        return next;
      });
    } catch (error) {
      logger.error('Failed to acknowledge feature:', error);
    }
  };

  const acknowledgeAllFeatures = () => {
    try {
      unviewedFeatures.forEach((feature) => markFeatureViewed(feature.id));

      const newViewedIds = [...viewedFeatureIds, ...unviewedFeatures.map((f) => f.id)];
      setViewedFeatureIds(newViewedIds);
      setViewedFeatures(newViewedIds);
      setUnviewedFeatures([]);
      setHasNewFeatures(false);
    } catch (error) {
      logger.error('Failed to acknowledge all features:', error);
    }
  };

  return { hasNewFeatures, unviewedFeatures, acknowledgeFeature, acknowledgeAllFeatures };
};
