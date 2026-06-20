import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'app';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  accent: {
    50: '#F8F5FF',
    100: '#F0EBFF',
    200: '#E1D6FF',
    300: '#CEBEFF',
    400: '#B69EFF',
    500: '#9C7DFF',
    600: '#8A5FFF',
    700: '#7645E8',
    800: '#6234BB',
    900: '#502D93',
    950: '#2D1959',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

export default defineConfig({
  safelist: [...Object.keys(customIconCollection[collectionName] || {}).map((x) => `i-app:${x}`)],
  shortcuts: {
    'ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 ease-cubic-bezier',
    kdb: 'bg-ui-code-background text-ui-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,
      ui: {
          borderColor: 'var(--ui-borderColor)',
          borderColorActive: 'var(--ui-borderColorActive)',
          background: {
            depth: {
              1: 'var(--ui-bg-depth-1)',
              2: 'var(--ui-bg-depth-2)',
              3: 'var(--ui-bg-depth-3)',
              4: 'var(--ui-bg-depth-4)',
            },
          },
          textPrimary: 'var(--ui-textPrimary)',
          textSecondary: 'var(--ui-textSecondary)',
          textTertiary: 'var(--ui-textTertiary)',
          code: {
            background: 'var(--ui-code-background)',
            text: 'var(--ui-code-text)',
          },
          button: {
            primary: {
              background: 'var(--ui-button-primary-background)',
              backgroundHover: 'var(--ui-button-primary-backgroundHover)',
              text: 'var(--ui-button-primary-text)',
            },
            secondary: {
              background: 'var(--ui-button-secondary-background)',
              backgroundHover: 'var(--ui-button-secondary-backgroundHover)',
              text: 'var(--ui-button-secondary-text)',
            },
            danger: {
              background: 'var(--ui-button-danger-background)',
              backgroundHover: 'var(--ui-button-danger-backgroundHover)',
              text: 'var(--ui-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--ui-item-contentDefault)',
            contentActive: 'var(--ui-item-contentActive)',
            contentAccent: 'var(--ui-item-contentAccent)',
            contentDanger: 'var(--ui-item-contentDanger)',
            backgroundDefault: 'var(--ui-item-backgroundDefault)',
            backgroundActive: 'var(--ui-item-backgroundActive)',
            backgroundAccent: 'var(--ui-item-backgroundAccent)',
            backgroundDanger: 'var(--ui-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--ui-actions-background)',
            code: {
              background: 'var(--ui-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--ui-artifacts-background)',
            backgroundHover: 'var(--ui-artifacts-backgroundHover)',
            borderColor: 'var(--ui-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--ui-artifacts-inlineCode-background)',
              text: 'var(--ui-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--ui-messages-background)',
            linkColor: 'var(--ui-messages-linkColor)',
            code: {
              background: 'var(--ui-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--ui-messages-inlineCode-background)',
              text: 'var(--ui-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--ui-icon-success)',
            error: 'var(--ui-icon-error)',
            primary: 'var(--ui-icon-primary)',
            secondary: 'var(--ui-icon-secondary)',
            tertiary: 'var(--ui-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--ui-preview-addressBar-background)',
              backgroundHover: 'var(--ui-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--ui-preview-addressBar-backgroundActive)',
              text: 'var(--ui-preview-addressBar-text)',
              textActive: 'var(--ui-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--ui-terminals-background)',
            buttonBackground: 'var(--ui-terminals-buttonBackground)',
          },
          dividerColor: 'var(--ui-dividerColor)',
          loader: {
            background: 'var(--ui-loader-background)',
            progress: 'var(--ui-loader-progress)',
          },
          prompt: {
            background: 'var(--ui-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--ui-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--ui-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--ui-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--ui-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--ui-cta-background)',
            text: 'var(--ui-cta-text)',
          },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
      unit: 'em',
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
