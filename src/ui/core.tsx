/**
 * Core primitives of the DemandOne design system: text, page, rules, buttons,
 * fields and choices. Every screen builds from these and the market components —
 * nothing reaches for raw colors or font names.
 */
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Switch,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, MAX_WIDTH, radius, space, type, TypeVariant } from '@/theme';
import { Icon, IconName } from './Icon';

/* ------------------------------------------------------------------ Text */

export function T({
  v = 'body',
  color,
  style,
  children,
  lines,
  align,
  testID,
}: {
  v?: TypeVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  lines?: number;
  align?: 'left' | 'center' | 'right';
  testID?: string;
}) {
  return (
    <Text testID={testID} numberOfLines={lines} style={[type[v], { color: color ?? colors.ink }, align && { textAlign: align }, style]}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ Page */

/**
 * A screen: paper ground, a centered content column on wide screens, optional
 * ambient layer behind (passed as `backdrop`), and an optional docked footer
 * (e.g. the voice bar) that stays in layout rather than floating.
 */
export function Page({
  children,
  scroll = true,
  backdrop,
  footer,
  background,
  padded = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  backdrop?: ReactNode;
  footer?: ReactNode;
  background?: string;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const column: ViewStyle = { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: padded ? space.lg + 4 : 0 };
  return (
    <View style={{ flex: 1, backgroundColor: background ?? colors.bg }}>
      {backdrop ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{backdrop}</View> : null}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[{ paddingTop: insets.top + space.md, paddingBottom: (footer ? space.lg : insets.bottom + 110) }, contentStyle]}>
          <View style={column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingTop: insets.top + space.md }, contentStyle]}>
          <View style={[column, { flex: 1 }]}>{children}</View>
        </View>
      )}
      {footer ? <View style={{ paddingBottom: insets.bottom }}><View style={[column]}>{footer}</View></View> : null}
    </View>
  );
}

export function Rule({ strong = false, dashed = false, style }: { strong?: boolean; dashed?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        dashed
          ? { borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint, opacity: 0.6 }
          : { height: 1, backgroundColor: strong ? colors.ruleStrong : colors.rule },
        style,
      ]}
    />
  );
}

export function Row({ children, gap = space.sm, style, align = 'center', justify, testID }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; testID?: string }) {
  return <View testID={testID} style={[{ flexDirection: 'row', alignItems: align, gap, justifyContent: justify }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

/** A section: serif heading, optional one-line note, content below a strong ledger rule when `ruled`. */
export function Section({ title, note, right, ruled = false, children, style }: { title: string; note?: string; right?: ReactNode; ruled?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.xxl }, style]}>
      <Row justify="space-between" align="flex-end">
        <T v="heading" style={{ flex: 1 }}>{title}</T>
        {right}
      </Row>
      {note ? <T v="small" color={colors.inkDim} style={{ marginTop: 2 }}>{note}</T> : null}
      <View style={{ marginTop: space.sm }}>
        {ruled ? <Rule strong /> : null}
        {children}
      </View>
    </View>
  );
}

/** Back control + optional right element. */
export function TopBar({ onBack, right, title }: { onBack?: () => void; right?: ReactNode; title?: string }) {
  return (
    <Row justify="space-between" style={{ minHeight: 44 }}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={({ pressed }) => [{ width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.5 }]}>
          <Icon name="back" size={22} />
        </Pressable>
      ) : (
        <View />
      )}
      {title ? <T v="label" color={colors.inkDim} style={{ flex: 1, textAlign: 'center' }}>{title}</T> : null}
      {right ?? <View style={{ width: 44 }} />}
    </Row>
  );
}

/* --------------------------------------------------------------- Buttons */

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger' | 'inverse';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled = false,
  loading = false,
  icon,
  size = 'md',
  style,
  label,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  /** Accessible name when it should differ from the visible title. */
  label?: string;
}) {
  const palette = {
    primary: { bg: colors.forest, fg: colors.onForest, border: colors.forest },
    secondary: { bg: 'transparent', fg: colors.ink, border: colors.ink },
    quiet: { bg: 'transparent', fg: colors.ink, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.rust, border: 'transparent' },
    inverse: { bg: '#F2EDE2', fg: '#121513', border: '#F2EDE2' },
  }[kind];
  const height = size === 'md' ? 48 : 40;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          paddingHorizontal: kind === 'quiet' || kind === 'danger' ? space.xs : space.lg,
          borderRadius: radius.pill,
          backgroundColor: palette.bg,
          borderWidth: kind === 'secondary' || kind === 'primary' || kind === 'inverse' ? 1 : 0,
          borderColor: palette.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: off ? 0.45 : 1,
        },
        pressed && { opacity: 0.75 },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[type.bodyStrong, { color: palette.fg, fontSize: size === 'md' ? 15 : 14 }]}>{title}</Text>
    </Pressable>
  );
}

/** A tappable row/area with a pressed state; used for list entries. */
export function Tap({ onPress, children, label, style, disabled }: { onPress: () => void; children: ReactNode; label?: string; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Fields */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  multiline = false,
  keyboardType,
  autoCapitalize,
  onSubmitEditing,
  prefix,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  onSubmitEditing?: () => void;
  prefix?: string;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="label" color={colors.inkDim}>{label}</T>
      <Row gap={0} style={{ borderBottomWidth: focused ? 2 : 1, borderColor: error ? colors.rust : focused ? colors.focus : colors.inkFaint, paddingBottom: focused ? 0 : 1 }}>
        {prefix ? <T v="body" color={colors.inkDim} style={{ marginRight: 2 }}>{prefix}</T> : null}
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[type.body, { flex: 1, color: colors.ink, paddingVertical: 10, minHeight: multiline ? 84 : 44, textAlignVertical: multiline ? 'top' : 'center', outlineWidth: 0 } as TextStyle]}
        />
      </Row>
      {error ? <T v="small" color={colors.rust}>{error}</T> : hint ? <T v="small" color={colors.inkFaint}>{hint}</T> : null}
    </View>
  );
}

/* --------------------------------------------------------------- Choices */

/** Text tabs over a fine rule — for switching views (All / Needs / Offers). */
export function Tabs<K extends string>({ items, value, onChange }: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.xl, borderBottomWidth: 1, borderColor: colors.rule }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={it.label} onPress={() => onChange(it.key)} style={{ paddingVertical: space.sm, borderBottomWidth: 2, borderColor: on ? colors.ink : 'transparent', marginBottom: -1 }}>
            <T v={on ? 'bodyStrong' : 'body'} color={on ? colors.ink : colors.inkDim}>
              {it.label}
              {it.count !== undefined ? <T v="body" color={colors.inkFaint}>{`  ${it.count}`}</T> : null}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small set of mutually exclusive options (terms, priorities). */
export function Choice<K extends string>({ label, options, value, onChange }: { label: string; options: { key: K; label: string }[]; value: K | undefined; onChange: (k: K) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="label" color={colors.inkDim}>{label}</T>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.key)}
              style={({ pressed }) => [
                { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.ink : colors.rule, backgroundColor: on ? colors.ink : 'transparent', justifyContent: 'center' },
                pressed && { opacity: 0.7 },
              ]}>
              <T v="small" color={on ? colors.bg : colors.ink}>{o.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ToggleRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: space.md }}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <T v="body">{label}</T>
        {sub ? <T v="small" color={colors.inkDim}>{sub}</T> : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.forest, false: colors.sunk }} thumbColor={colors.raised} />
    </Row>
  );
}

/** A label/value line in a structured list (profile, settings). */
export function KeyValue({ label, value, onPress, valueColor }: { label: string; value: string; onPress?: () => void; valueColor?: string }) {
  const body = (
    <Row justify="space-between" align="flex-start" gap={space.lg} style={{ paddingVertical: space.md }}>
      <T v="small" color={colors.inkDim} style={{ width: 112 }}>{label}</T>
      <T v="body" color={valueColor ?? colors.ink} style={{ flex: 1, textAlign: 'right' }}>{value}</T>
      {onPress ? <Icon name="next" size={16} color={colors.inkFaint} /> : null}
    </Row>
  );
  return onPress ? <Tap onPress={onPress} label={`${label}: ${value}`}>{body}</Tap> : body;
}

export const FONT = fonts;
