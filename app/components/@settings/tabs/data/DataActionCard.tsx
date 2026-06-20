import { motion } from 'framer-motion';
import { Button } from '~/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '~/components/ui/Card';
import { classNames } from '~/utils/classNames';

export interface DataActionCardProps {
  /** Icon CSS class (e.g. 'i-ph-download-duotone') */
  icon: string;

  /** Card title text */
  title: string;

  /** Card description text */
  description: string;

  /** Button label when idle */
  buttonLabel: string;

  /** Button label while loading/active */
  loadingLabel: string;

  /** Whether the action is currently in progress */
  isLoading: boolean;

  /** Whether the button should be disabled (in addition to loading state) */
  isDisabled?: boolean;

  /** Click handler for the action button */
  onClick: () => void;

  /** Icon color class override — defaults to 'text-accent-500' */
  iconColorClass?: string;

  /** Optional label to show when the button is disabled and not loading */
  disabledLabel?: string;
}

export function DataActionCard({
  icon,
  title,
  description,
  buttonLabel,
  loadingLabel,
  isLoading,
  isDisabled = false,
  onClick,
  iconColorClass = 'text-accent-500',
  disabledLabel,
}: DataActionCardProps) {
  const disabled = isLoading || isDisabled;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center mb-2">
          <motion.div
            className={classNames(iconColorClass, 'mr-2')}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <div className={classNames(icon, 'w-5 h-5')} />
          </motion.div>
          <CardTitle className="text-lg group-hover:text-ui-item-contentAccent transition-colors">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
          <Button
            onClick={onClick}
            disabled={disabled}
            variant="outline"
            size="sm"
            className={classNames(
              'hover:text-ui-item-contentAccent hover:border-ui-item-backgroundAccent hover:bg-ui-item-backgroundAccent transition-colors w-full justify-center',
              disabled ? 'cursor-not-allowed' : '',
            )}
          >
            {isLoading ? (
              <>
                <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                {loadingLabel}
              </>
            ) : isDisabled && disabledLabel ? (
              disabledLabel
            ) : (
              buttonLabel
            )}
          </Button>
        </motion.div>
      </CardFooter>
    </Card>
  );
}
