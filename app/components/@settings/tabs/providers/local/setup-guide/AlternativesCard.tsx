import React from 'react';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';

import { LOCAL_ALTERNATIVES, CLOUD_ALTERNATIVES } from './setupGuideData';

// Alternative Options
function AlternativesCard() {
  return (
    <Card className="bg-bolt-elements-background-depth-2 shadow-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center ring-1 ring-orange-500/30">
            <div className="i-ph:wifi-high w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">Alternative Options</h3>
            <p className="text-sm text-bolt-elements-textSecondary">Other local AI solutions and cloud alternatives</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary">Other Local Solutions</h4>
            <div className="space-y-3">
              {LOCAL_ALTERNATIVES.map((tool) => (
                <div key={tool.name} className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`${tool.icon} w-4 h-4 ${tool.iconColor}`} />
                    <span className="font-medium text-bolt-elements-textPrimary">{tool.name}</span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">{tool.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary">Cloud Alternatives</h4>
            <div className="space-y-3">
              {CLOUD_ALTERNATIVES.map((tool) => (
                <div key={tool.name} className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`${tool.icon} w-4 h-4 ${tool.iconColor}`} />
                    <span className="font-medium text-bolt-elements-textPrimary">{tool.name}</span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">{tool.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AlternativesCard;
