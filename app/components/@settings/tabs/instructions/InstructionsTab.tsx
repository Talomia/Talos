import { memo, useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';

const MAX_INSTRUCTIONS_LENGTH = 4000;
const STORAGE_KEY = 'customInstructions';

const EXAMPLE_INSTRUCTIONS = [
  'Always use TypeScript with strict mode',
  'Prefer Tailwind CSS for styling',
  'Write all comments in Spanish',
  'Use functional components with hooks, never class components',
];

const InstructionsTab = memo(() => {
  const [instructions, setInstructions] = useState('');
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      setInstructions(stored);
    }
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, instructions);
    setSaved(true);
    toast.success('Custom instructions saved');
  }, [instructions]);

  const handleChange = useCallback((value: string) => {
    if (value.length <= MAX_INSTRUCTIONS_LENGTH) {
      setInstructions(value);
      setSaved(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setInstructions('');
    localStorage.removeItem(STORAGE_KEY);
    setSaved(true);
    toast.info('Custom instructions cleared');
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-ui-textPrimary">Custom Instructions</h3>
        <p className="text-sm text-ui-textSecondary mt-1">
          Set persistent instructions that will be included with every message you send. These help the AI understand
          your preferences, coding style, and project requirements.
        </p>
      </div>

      {/* Textarea */}
      <div className="space-y-2">
        <textarea
          value={instructions}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter your custom instructions here..."
          className="w-full h-48 px-3 py-2 text-sm rounded-lg border border-ui-borderColor bg-ui-background-depth-2 text-ui-textPrimary placeholder-ui-textTertiary resize-none focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-colors"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ui-textTertiary">
            {instructions.length}/{MAX_INSTRUCTIONS_LENGTH} characters
          </span>
          {!saved && <span className="text-xs text-amber-500">Unsaved changes</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saved}
          className="px-4 py-2 text-sm rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save Instructions
        </button>
        <button
          onClick={handleClear}
          disabled={!instructions}
          className="px-4 py-2 text-sm rounded-lg border border-ui-borderColor text-ui-textSecondary hover:bg-ui-background-depth-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Examples */}
      <div>
        <h4 className="text-sm font-medium text-ui-textPrimary mb-2">Example Instructions</h4>
        <div className="space-y-1.5">
          {EXAMPLE_INSTRUCTIONS.map((example) => (
            <button
              key={example}
              onClick={() => {
                const separator = instructions.trim() ? '\n' : '';
                handleChange(instructions + separator + example);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg border border-ui-borderColor/50 text-ui-textSecondary hover:bg-ui-background-depth-3 hover:text-ui-textPrimary transition-colors"
            >
              <div className="i-ph:plus-circle shrink-0" />
              <span>{example}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default InstructionsTab;
