import { memo } from 'react';
import type { Highlighter } from 'shiki';
import type { DiffBlock } from './diffProcessing';
import { lineNumberStyles, lineContentStyles, diffLineStyles, changeColorStyles } from './diffViewStyles';

// Componente otimizado para renderização de linhas de código
export const CodeLine = memo(
  ({
    lineNumber,
    content,
    type,
    highlighter,
    language,
    block,
    theme,
  }: {
    lineNumber: number;
    content: string;
    type: 'added' | 'removed' | 'unchanged';
    highlighter: Highlighter;
    language: string;
    block: DiffBlock;
    theme: string;
  }) => {
    const bgColor = diffLineStyles[type];

    const renderContent = () => {
      if (type === 'unchanged' || !block.charChanges) {
        const highlightedCode = highlighter
          ? highlighter
              .codeToHtml(content, { lang: language, theme: theme === 'dark' ? 'github-dark' : 'github-light' })
              .replace(/<\/?pre[^>]*>/g, '')
              .replace(/<\/?code[^>]*>/g, '')
          : content;
        return <span dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
      }

      return (
        <>
          {block.charChanges.map((change, index) => {
            const changeClass = changeColorStyles[change.type];

            const highlightedCode = highlighter
              ? highlighter
                  .codeToHtml(change.value, {
                    lang: language,
                    theme: theme === 'dark' ? 'github-dark' : 'github-light',
                  })
                  .replace(/<\/?pre[^>]*>/g, '')
                  .replace(/<\/?code[^>]*>/g, '')
              : change.value;

            return <span key={index} className={changeClass} dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
          })}
        </>
      );
    };

    return (
      <div className="flex group min-w-fit">
        <div className={lineNumberStyles}>{lineNumber + 1}</div>
        <div className={`${lineContentStyles} ${bgColor}`}>
          <span className="mr-2 text-bolt-elements-textTertiary">
            {type === 'added' && <span className="text-green-700 dark:text-green-500">+</span>}
            {type === 'removed' && <span className="text-red-700 dark:text-red-500">-</span>}
            {type === 'unchanged' && ' '}
          </span>
          {renderContent()}
        </div>
      </div>
    );
  },
);
