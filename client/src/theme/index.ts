import { Platform } from 'react-native';

export const colors = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#273449',
  border: '#334155',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  primary: '#3B82F6',
  primaryText: '#FFFFFF',
  danger: '#EF4444',
  dangerText: '#FFFFFF',
  success: '#22C55E',
  warning: '#F59E0B',
  pending: '#64748B',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  mono: {
    fontSize: 13,
    fontFamily: Platform.select({
      web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      default: 'Menlo',
    }),
  },
};

export const layout = {
  maxContentWidth: 720,
};
