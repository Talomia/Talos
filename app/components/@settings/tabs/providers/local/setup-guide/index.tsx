import React from 'react';
import { Button } from '~/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import SystemRequirementsCard from './SystemRequirementsCard';
import OllamaSetupCard from './OllamaSetupCard';
import LmStudioSetupCard from './LMStudioSetupCard';
import LocalAiSetupCard from './LocalAISetupCard';
import PerformanceCard from './PerformanceCard';
import AlternativesCard from './AlternativesCard';

// Setup Guide Component
function SetupGuide({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="bg-transparent hover:bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all duration-200 p-2"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Local Provider Setup Guide</h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            Complete setup instructions for running AI models locally
          </p>
        </div>
      </div>

      {/* Hardware Requirements Overview */}
      <SystemRequirementsCard />

      {/* Ollama Setup Section */}
      <OllamaSetupCard />

      {/* LM Studio Setup Section */}
      <LmStudioSetupCard />

      {/* LocalAI Setup Section */}
      <LocalAiSetupCard />

      {/* Performance Optimization */}
      <PerformanceCard />

      {/* Alternative Options */}
      <AlternativesCard />
    </div>
  );
}

export default SetupGuide;
