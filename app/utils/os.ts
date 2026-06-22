// Helper to detect OS — centralized, checks both platform and userAgent
const nav = typeof navigator !== 'undefined' ? navigator : undefined;
const platform = nav?.platform?.toLowerCase() ?? '';
const ua = nav?.userAgent?.toLowerCase() ?? '';

export const isMac = platform.includes('mac') || ua.includes('mac');
export const isWindows = platform.includes('win') || ua.includes('windows');
export const isLinux = platform.includes('linux') || ua.includes('linux');
