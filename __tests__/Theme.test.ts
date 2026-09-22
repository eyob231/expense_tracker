import { ACCENTS, ACCENT_ORDER, buildTheme, withAlpha } from '../src/theme';

/** WCAG relative luminance for a #rrggbb colour. */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('withAlpha', () => {
  test('converts hex to rgba', () => {
    expect(withAlpha('#0F766E', 0.5)).toBe('rgba(15, 118, 110, 0.5)');
  });

  test('expands short hex', () => {
    expect(withAlpha('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('accent fills keep white text readable', () => {
  // The whole reason deep/bright are separate tokens: a single hex used as both
  // an icon colour and a button fill gave us 2.3:1 white-on-teal.
  test.each(ACCENT_ORDER)('%s deep variant passes 4.5:1 with white', accentKey => {
    expect(contrast(ACCENTS[accentKey].deep, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  test.each(ACCENT_ORDER)('%s bright variant passes 4.5:1 on the dark background', accentKey => {
    const theme = buildTheme('dark', accentKey);
    expect(contrast(theme.colors.primary, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('buildTheme', () => {
  test('dark mode uses the bright accent, light mode the deep one', () => {
    expect(buildTheme('dark', 'indigo').colors.primary).toBe(ACCENTS.indigo.bright);
    expect(buildTheme('light', 'indigo').colors.primary).toBe(ACCENTS.indigo.deep);
  });

  test('the hero fill is always the deep accent and never the bright one', () => {
    const theme = buildTheme('dark', 'teal');
    expect(theme.colors.primaryDeep).toBe(ACCENTS.teal.deep);
    expect(theme.colors.primaryDeep).not.toBe(theme.colors.primary);
  });

  test('every accent exposes an opaque onPrimary for filled surfaces', () => {
    ACCENT_ORDER.forEach(key => {
      expect(buildTheme('dark', key).colors.onPrimary).toBe('#FFFFFF');
    });
  });

  test('light mode flips the surface and text tokens', () => {
    const dark = buildTheme('dark');
    const light = buildTheme('light');
    expect(dark.isDark).toBe(true);
    expect(light.isDark).toBe(false);
    expect(luminance(light.colors.background)).toBeGreaterThan(luminance(dark.colors.background));
    expect(luminance(light.colors.text)).toBeLessThan(luminance(dark.colors.text));
  });

  test('muted text stays readable on its own background in both modes', () => {
    (['dark', 'light'] as const).forEach(mode => {
      const theme = buildTheme(mode);
      expect(contrast(theme.colors.textMuted, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
    });
  });

  test('exposes the shared design tokens', () => {
    const theme = buildTheme('dark');
    expect(theme.spacing.md).toBe(16);
    expect(theme.borderRadius.full).toBe(999);
    expect(theme.typography.h1.fontSize).toBe(26);
    expect(theme.shadow.accent.shadowColor).toBe(ACCENTS.teal.deep);
  });
});
