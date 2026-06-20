import React from 'react';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { CODE_MODEL_COMMANDS, GENERAL_MODEL_COMMANDS } from './setupGuideData';

// Ollama Setup Section
function OllamaSetupCard() {
  return (
    <Card className="bg-ui-background-depth-2 shadow-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center ring-1 ring-purple-500/30">
            <div className="i-ph:hard-drives w-6 h-6 text-purple-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-ui-textPrimary">Ollama Setup</h3>
            <p className="text-sm text-ui-textSecondary">
              Most popular choice for running open-source models locally with desktop app
            </p>
          </div>
          <span className="px-3 py-1 bg-purple-500/10 text-purple-500 text-xs font-medium rounded-full">
            Recommended
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Installation Options */}
        <div className="space-y-4">
          <h4 className="font-medium text-ui-textPrimary flex items-center gap-2">
            <div className="i-ph:download w-4 h-4" />
            1. Choose Installation Method
          </h4>

          {/* Desktop App - New and Recommended */}
          <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="i-ph:monitor w-5 h-5 text-green-500" />
              <h5 className="font-medium text-green-500">🆕 Desktop App (Recommended)</h5>
            </div>
            <p className="text-sm text-ui-textSecondary mb-3">
              New user-friendly desktop application with built-in model management and web interface.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-ui-background-depth-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="i-ph:monitor w-4 h-4 text-ui-textPrimary" />
                  <strong className="text-ui-textPrimary">macOS</strong>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border-purple-500/30 hover:border-purple-500/50 transition-all duration-300 gap-2 group shadow-sm hover:shadow-lg hover:shadow-purple-500/20 font-medium"
                  _asChild
                >
                  <a
                    href="https://ollama.com/download/mac"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    <div className="i-ph:download w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 flex-shrink-0" />
                    <span className="flex-1 text-center font-medium">Download Desktop App</span>
                    <div className="i-ph:arrow-square-out w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                  </a>
                </Button>
              </div>
              <div className="p-3 rounded-lg bg-ui-background-depth-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="i-ph:monitor w-4 h-4 text-ui-textPrimary" />
                  <strong className="text-ui-textPrimary">Windows</strong>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border-purple-500/30 hover:border-purple-500/50 transition-all duration-300 gap-2 group shadow-sm hover:shadow-lg hover:shadow-purple-500/20 font-medium"
                  _asChild
                >
                  <a
                    href="https://ollama.com/download/windows"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    <div className="i-ph:download w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 flex-shrink-0" />
                    <span className="flex-1 text-center font-medium">Download Desktop App</span>
                    <div className="i-ph:arrow-square-out w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-1">
                <div className="i-ph:globe w-4 h-4 text-blue-500" />
                <span className="font-medium text-blue-500 text-sm">Built-in Web Interface</span>
              </div>
              <p className="text-xs text-ui-textSecondary">
                Desktop app includes a web interface at{' '}
                <code className="bg-ui-background-depth-4 px-1 rounded">http://localhost:11434</code>
              </p>
            </div>
          </div>

          {/* CLI Installation */}
          <div className="p-4 rounded-lg bg-ui-background-depth-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="i-ph:terminal w-5 h-5 text-ui-textPrimary" />
              <h5 className="font-medium text-ui-textPrimary">Command Line (Advanced)</h5>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-ui-background-depth-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="i-ph:monitor w-4 h-4 text-ui-textPrimary" />
                  <strong className="text-ui-textPrimary">Windows</strong>
                </div>
                <div className="text-xs bg-ui-background-depth-4 p-2 rounded font-mono text-ui-textPrimary">
                  winget install Ollama.Ollama
                </div>
              </div>
              <div className="p-3 rounded-lg bg-ui-background-depth-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="i-ph:monitor w-4 h-4 text-ui-textPrimary" />
                  <strong className="text-ui-textPrimary">macOS</strong>
                </div>
                <div className="text-xs bg-ui-background-depth-4 p-2 rounded font-mono text-ui-textPrimary">
                  brew install ollama
                </div>
              </div>
              <div className="p-3 rounded-lg bg-ui-background-depth-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="i-ph:terminal w-4 h-4 text-ui-textPrimary" />
                  <strong className="text-ui-textPrimary">Linux</strong>
                </div>
                <div className="text-xs bg-ui-background-depth-4 p-2 rounded font-mono text-ui-textPrimary">
                  curl -fsSL https://ollama.com/install.sh | sh
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Model Recommendations */}
        <div className="space-y-4">
          <h4 className="font-medium text-ui-textPrimary flex items-center gap-2">
            <div className="i-ph:package w-4 h-4" />
            2. Download Latest Models
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-ui-background-depth-3">
              <h5 className="font-medium text-ui-textPrimary mb-3 flex items-center gap-2">
                <div className="i-ph:code w-4 h-4 text-green-500" />
                Code &amp; Development
              </h5>
              <div className="space-y-2 text-xs bg-ui-background-depth-4 p-3 rounded font-mono text-ui-textPrimary">
                <div>{CODE_MODEL_COMMANDS.comment}</div>
                {CODE_MODEL_COMMANDS.commands.map((cmd) => (
                  <div key={cmd}>{cmd}</div>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-ui-background-depth-3">
              <h5 className="font-medium text-ui-textPrimary mb-3 flex items-center gap-2">
                <div className="i-ph:terminal w-4 h-4 text-blue-500" />
                General Purpose &amp; Chat
              </h5>
              <div className="space-y-2 text-xs bg-ui-background-depth-4 p-3 rounded font-mono text-ui-textPrimary">
                <div>{GENERAL_MODEL_COMMANDS.comment}</div>
                {GENERAL_MODEL_COMMANDS.commands.map((cmd) => (
                  <div key={cmd}>{cmd}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="i-ph:activity w-4 h-4 text-purple-500" />
                <span className="font-medium text-purple-500">Performance Optimized</span>
              </div>
              <ul className="text-xs text-ui-textSecondary space-y-1">
                <li>• Llama 3.2: 3B - Fastest, 8GB RAM</li>
                <li>• Phi-3.5: 3.8B - Great balance</li>
                <li>• Qwen2.5: 7B - Excellent quality</li>
                <li>• Mistral: 7B - Popular choice</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="i-ph:warning-circle w-4 h-4 text-yellow-500" />
                <span className="font-medium text-yellow-500">Pro Tips</span>
              </div>
              <ul className="text-xs text-ui-textSecondary space-y-1">
                <li>• Start with 3B-7B models for best performance</li>
                <li>• Use quantized versions for faster loading</li>
                <li>• Desktop app auto-manages model storage</li>
                <li>• Web UI available at localhost:11434</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Desktop App Features */}
        <div className="space-y-4">
          <h4 className="font-medium text-ui-textPrimary flex items-center gap-2">
            <div className="i-ph:monitor w-4 h-4" />
            3. Desktop App Features
          </h4>
          <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h5 className="font-medium text-blue-500 mb-3">🖥️ User Interface</h5>
                <ul className="text-sm text-ui-textSecondary space-y-1">
                  <li>• Model library browser</li>
                  <li>• One-click model downloads</li>
                  <li>• Built-in chat interface</li>
                  <li>• System resource monitoring</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium text-blue-500 mb-3">🔧 Management Tools</h5>
                <ul className="text-sm text-ui-textSecondary space-y-1">
                  <li>• Automatic updates</li>
                  <li>• Model size optimization</li>
                  <li>• GPU acceleration detection</li>
                  <li>• Cross-platform compatibility</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="space-y-4">
          <h4 className="font-medium text-ui-textPrimary flex items-center gap-2">
            <div className="i-ph:gear w-4 h-4" />
            4. Troubleshooting &amp; Commands
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
              <h5 className="font-medium text-red-500 mb-2">Common Issues</h5>
              <ul className="text-xs text-ui-textSecondary space-y-1">
                <li>• Desktop app not starting: Restart system</li>
                <li>• GPU not detected: Update drivers</li>
                <li>• Port 11434 blocked: Change port in settings</li>
                <li>• Models not loading: Check available disk space</li>
                <li>• Slow performance: Use smaller models or enable GPU</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <h5 className="font-medium text-green-500 mb-2">Useful Commands</h5>
              <div className="text-xs bg-ui-background-depth-4 p-3 rounded font-mono text-ui-textPrimary space-y-1">
                <div># Check installed models</div>
                <div>ollama list</div>
                <div></div>
                <div># Remove unused models</div>
                <div>ollama rm model_name</div>
                <div></div>
                <div># Check GPU usage</div>
                <div>ollama ps</div>
                <div></div>
                <div># View logs</div>
                <div>ollama logs</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default OllamaSetupCard;
