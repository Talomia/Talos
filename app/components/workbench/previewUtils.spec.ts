import { describe, expect, it } from 'vitest';
import { WINDOW_SIZES } from './previewUtils';

describe('previewUtils', () => {
  describe('WINDOW_SIZES', () => {
    it('should contain 12 device presets', () => {
      expect(WINDOW_SIZES).toHaveLength(12);
    });

    it('should have valid dimensions for all sizes', () => {
      for (const size of WINDOW_SIZES) {
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(size.name).toBeTruthy();
        expect(size.icon).toBeTruthy();
      }
    });

    it('should include mobile devices', () => {
      const mobiles = WINDOW_SIZES.filter((s) => s.frameType === 'mobile');
      expect(mobiles.length).toBeGreaterThanOrEqual(3);
      expect(mobiles.every((m) => m.hasFrame)).toBe(true);
    });

    it('should include tablets', () => {
      const tablets = WINDOW_SIZES.filter((s) => s.frameType === 'tablet');
      expect(tablets.length).toBeGreaterThanOrEqual(3);
    });

    it('should include laptops and desktops', () => {
      const laptops = WINDOW_SIZES.filter((s) => s.frameType === 'laptop');
      const desktops = WINDOW_SIZES.filter((s) => s.frameType === 'desktop');

      expect(laptops.length).toBeGreaterThanOrEqual(2);
      expect(desktops.length).toBeGreaterThanOrEqual(1);
    });

    it('should be ordered by ascending width', () => {
      for (let i = 1; i < WINDOW_SIZES.length; i++) {
        expect(WINDOW_SIZES[i].width).toBeGreaterThanOrEqual(WINDOW_SIZES[i - 1].width);
      }
    });

    it('should have unique names', () => {
      const names = WINDOW_SIZES.map((s) => s.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
