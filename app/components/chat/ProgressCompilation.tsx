import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import type { ProgressAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [progressList, setProgressList] = React.useState<ProgressAnnotation[]>([]);
  const [expanded, setExpanded] = useState(true);
  React.useEffect(() => {
    if (!data || data.length === 0) {
      setProgressList([]);
      return;
    }

    const progressMap = new Map<string, ProgressAnnotation>();
    data.forEach((x) => {
      const existingProgress = progressMap.get(x.label);

      if (existingProgress && existingProgress.status === 'complete') {
        return;
      }

      progressMap.set(x.label, x);
    });

    const newData = Array.from(progressMap.values());
    newData.sort((a, b) => a.order - b.order);
    setProgressList(newData);
  }, [data]);

  if (progressList.length === 0) {
    return <></>;
  }

  return (
    <AnimatePresence>
      <div
        className={classNames(
          'bg-ui-background-depth-2',
          'border border-ui-borderColor',
          'shadow-lg rounded-lg  relative w-full max-w-chat mx-auto z-prompt',
          'p-1',
        )}
      >
        <div
          className={classNames('bg-ui-item-backgroundAccent', 'p-1 rounded-lg text-ui-item-contentAccent', 'flex ')}
        >
          <div className="flex-1">
            <AnimatePresence>
              {expanded ? (
                <motion.div
                  className="actions"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: '0px' }}
                  transition={{ duration: 0.15 }}
                >
                  {progressList.map((x, i) => {
                    return <ProgressItem key={i} progress={x} />;
                  })}
                </motion.div>
              ) : (
                <ProgressItem progress={progressList.slice(-1)[0]} />
              )}
            </AnimatePresence>
          </div>
          <motion.button
            initial={{ width: 0 }}
            animate={{ width: 'auto' }}
            exit={{ width: 0 }}
            transition={{ duration: 0.15, ease: cubicEasingFn }}
            className=" p-1 rounded-lg bg-ui-item-backgroundAccent hover:bg-ui-artifacts-backgroundHover"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className={expanded ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'}></div>
          </motion.button>
        </div>
      </div>
    </AnimatePresence>
  );
}

const ProgressItem = ({ progress }: { progress: ProgressAnnotation }) => {
  return (
    <motion.div
      className={classNames('flex items-center text-sm gap-3 py-0.5')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-1.5">
        {progress.status === 'in-progress' ? (
          <div className="i-svg-spinners:90-ring-with-bg" />
        ) : progress.status === 'complete' ? (
          <div className="i-ph:check text-green-500" />
        ) : null}
      </div>
      {progress.icon && <span className="text-xs">{progress.icon}</span>}
      <span className="flex-1">{progress.message}</span>
      {progress.duration != null && (
        <span className="text-[10px] text-ui-textTertiary tabular-nums ml-auto">
          {progress.duration < 1000 ? `${progress.duration}ms` : `${(progress.duration / 1000).toFixed(1)}s`}
        </span>
      )}
    </motion.div>
  );
};
