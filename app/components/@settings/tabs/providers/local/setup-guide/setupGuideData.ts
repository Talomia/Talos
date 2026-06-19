export interface HardwareSpec {
  icon: string;
  iconColor: string;
  label: string;
  description: string;
}

export const HARDWARE_SPECS: HardwareSpec[] = [
  { icon: 'i-ph:cpu', iconColor: 'text-green-500', label: 'CPU', description: '8+ cores, modern architecture' },
  { icon: 'i-ph:database', iconColor: 'text-blue-500', label: 'RAM', description: '16GB minimum, 32GB+ recommended' },
  { icon: 'i-ph:monitor', iconColor: 'text-purple-500', label: 'GPU', description: 'NVIDIA RTX 30xx+ or AMD RX 6000+' },
];

export interface CodeModelCommands {
  comment: string;
  commands: string[];
}

export const CODE_MODEL_COMMANDS: CodeModelCommands = {
  comment: '# Latest Llama 3.2 for coding',
  commands: [
    'ollama pull llama3.2:3b',
    'ollama pull codellama:13b',
    'ollama pull deepseek-coder-v2',
    'ollama pull qwen2.5-coder:7b',
  ],
};

export const GENERAL_MODEL_COMMANDS: CodeModelCommands = {
  comment: '# Latest general models',
  commands: ['ollama pull llama3.2:3b', 'ollama pull mistral:7b', 'ollama pull phi3.5:3.8b', 'ollama pull qwen2.5:7b'],
};

export interface AlternativeTool {
  icon: string;
  iconColor: string;
  name: string;
  description: string;
}

export const LOCAL_ALTERNATIVES: AlternativeTool[] = [
  {
    icon: 'i-ph:package',
    iconColor: 'text-blue-500',
    name: 'Jan.ai',
    description: 'Modern interface with built-in model marketplace',
  },
  {
    icon: 'i-ph:terminal',
    iconColor: 'text-green-500',
    name: 'Oobabooga',
    description: 'Advanced text generation web UI with extensions',
  },
  {
    icon: 'i-ph:plug',
    iconColor: 'text-purple-500',
    name: 'KoboldAI',
    description: 'Focus on creative writing and storytelling',
  },
];

export const CLOUD_ALTERNATIVES: AlternativeTool[] = [
  {
    icon: 'i-ph:globe',
    iconColor: 'text-orange-500',
    name: 'OpenRouter',
    description: 'Access to 100+ models through unified API',
  },
  {
    icon: 'i-ph:hard-drives',
    iconColor: 'text-red-500',
    name: 'Together AI',
    description: 'Fast inference with open-source models',
  },
  {
    icon: 'i-ph:activity',
    iconColor: 'text-pink-500',
    name: 'Groq',
    description: 'Ultra-fast LPU inference for Llama models',
  },
];
