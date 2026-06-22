import { memo, useEffect, useRef, useState } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

import styles from './CodeBlock.module.scss';

const logger = createScopedLogger('CodeBlock');

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme = 'dark-plus', disableCopy = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copied, setCopied] = useState(false);

    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const copyToClipboard = () => {
      if (copied) {
        return;
      }

      navigator.clipboard.writeText(code).catch(() => {
        // Clipboard API may fail without permissions
      });

      setCopied(true);

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    };

    useEffect(() => {
      return () => {
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
      };
    }, []);

    useEffect(() => {
      let effectiveLanguage = language;

      if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
        logger.warn(`Unsupported language '${language}', falling back to plaintext`);
        effectiveLanguage = 'plaintext';
      }

      logger.trace(`Language = ${effectiveLanguage}`);

      const processCode = async () => {
        setHTML(await codeToHtml(code, { lang: effectiveLanguage, theme }));
      };

      processCode();
    }, [code, language, theme]);

    const displayLanguage = language && language !== 'plaintext' ? language.toLowerCase() : null;

    return (
      <div className={classNames('relative group text-left', className)}>
        {/* Header bar with language label and copy button */}
        {(displayLanguage || !disableCopy) && (
          <div
            className={classNames(
              styles.CodeBlockHeader,
              'flex items-center justify-between px-3 py-1.5 text-xs',
              'bg-gray-800/80 dark:bg-gray-900/80 border-b border-gray-700/50',
              'rounded-t-md',
            )}
          >
            <span className="text-gray-400 font-mono select-none">{displayLanguage || ''}</span>
            {!disableCopy && (
              <button
                className={classNames(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded text-gray-400 transition-colors',
                  'hover:text-gray-200 hover:bg-gray-700/50',
                  copied && 'text-green-400 hover:text-green-400',
                )}
                title="Copy Code"
                onClick={() => copyToClipboard()}
              >
                <div className={copied ? 'i-ph:check' : 'i-ph:clipboard-text-duotone'} />
                <span className="text-[11px]">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            )}
          </div>
        )}
        <div
          className={classNames(styles.CodeBlockContent, {
            'rounded-t-md': !displayLanguage && disableCopy,
            'rounded-b-md': true,
          })}
          dangerouslySetInnerHTML={{ __html: html ?? '' }}
        />
      </div>
    );
  },
);
