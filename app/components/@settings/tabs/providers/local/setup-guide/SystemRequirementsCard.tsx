import React from 'react';
import { CardContent } from '~/components/ui/Card';
import { Shield } from 'lucide-react';
import { HARDWARE_SPECS } from './setupGuideData';

// Hardware Requirements Overview
function SystemRequirementsCard() {
  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 shadow-sm rounded-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">System Requirements</h3>
            <p className="text-sm text-bolt-elements-textSecondary">Recommended hardware for optimal performance</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          {HARDWARE_SPECS.map((spec) => (
            <div key={spec.label} className="space-y-2">
              <div className="flex items-center gap-2">
                <spec.icon className={`w-4 h-4 ${spec.iconColor}`} />
                <span className="font-medium text-bolt-elements-textPrimary">{spec.label}</span>
              </div>
              <p className="text-bolt-elements-textSecondary">{spec.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </div>
  );
}

export default SystemRequirementsCard;
