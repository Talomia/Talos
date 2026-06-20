import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--ui-terminal-cursorColor'),
    cursorAccent: cssVar('--ui-terminal-cursorColorAccent'),
    foreground: cssVar('--ui-terminal-textColor'),
    background: cssVar('--ui-terminal-backgroundColor'),
    selectionBackground: cssVar('--ui-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--ui-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--ui-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--ui-terminal-color-black'),
    red: cssVar('--ui-terminal-color-red'),
    green: cssVar('--ui-terminal-color-green'),
    yellow: cssVar('--ui-terminal-color-yellow'),
    blue: cssVar('--ui-terminal-color-blue'),
    magenta: cssVar('--ui-terminal-color-magenta'),
    cyan: cssVar('--ui-terminal-color-cyan'),
    white: cssVar('--ui-terminal-color-white'),
    brightBlack: cssVar('--ui-terminal-color-brightBlack'),
    brightRed: cssVar('--ui-terminal-color-brightRed'),
    brightGreen: cssVar('--ui-terminal-color-brightGreen'),
    brightYellow: cssVar('--ui-terminal-color-brightYellow'),
    brightBlue: cssVar('--ui-terminal-color-brightBlue'),
    brightMagenta: cssVar('--ui-terminal-color-brightMagenta'),
    brightCyan: cssVar('--ui-terminal-color-brightCyan'),
    brightWhite: cssVar('--ui-terminal-color-brightWhite'),

    ...overrides,
  };
}
