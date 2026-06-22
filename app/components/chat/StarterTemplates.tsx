import React from 'react';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

interface TemplateCardProps {
  template: Template;
  index: number;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, index }) => (
  <a
    href={`/git?url=https://github.com/${template.githubRepo}.git`}
    data-state="closed"
    data-discover="true"
    className="landing-fade-in-up group flex-shrink-0 w-[140px] flex flex-col items-center gap-2 p-3 rounded-xl border border-ui-borderColor bg-ui-background-depth-2 hover:border-ui-borderColorActive transition-all duration-200 hover:shadow-sm"
    style={{ animationDelay: `${0.35 + index * 0.04}s` }}
  >
    <div
      className={`${template.icon} w-8 h-8 text-4xl group-hover:scale-110 transition-transform duration-200`}
      title={template.label}
    />
    <span className="text-xs font-medium text-ui-textPrimary text-center leading-tight">{template.label}</span>
  </a>
);

const StarterTemplates: React.FC = () => {
  return (
    <div className="flex flex-col items-center gap-3 mt-2 w-full max-w-2xl mx-auto px-4 lg:px-0">
      <span
        className="landing-fade-in-up text-sm text-ui-textTertiary flex items-center gap-1.5"
        style={{ animationDelay: '0.32s' }}
      >
        <span className="i-ph:rocket text-base" />
        or start with a template
      </span>
      <div className="w-full overflow-x-auto modern-scrollbar pb-2">
        <div className="flex gap-2 justify-center flex-wrap">
          {STARTER_TEMPLATES.map((template, index) => (
            <TemplateCard key={template.name} template={template} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StarterTemplates;
