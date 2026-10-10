import Feather from '@expo/vector-icons/Feather';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, type as typeScale, TypeVariant } from '@/theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

/* ----------------------------------------------------------------- Text */

export function Txt({
  variant = 'body',
  color = colors.text,
  style,
  children,
  numberOfLines,
}: {
  variant?: TypeVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[typeScale[variant], { color }, style]}>
      {children}
    </Text>
  );
}

export function Eyebrow({ children, color = colors.accent }: { children: ReactNode; color?: string }) {
  const label = Array.isArray(children) ? children.join('') : String(children);
  return <Text style={[typeScale.label, { color }]}>{label.toUpperCase()}</Text>;
}

/* --------------------------------------------------------------- Screen */

export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? space.lg : 0;
  if (scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }, style]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            { paddingHorizontal: pad, paddingBottom: insets.bottom + 120, paddingTop: space.sm },
            contentStyle,
          ]}>
          {children}
        </ScrollView>
      </View>
    );
  }
  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: pad },
        style,
      ]}>
      {children}
    </View>
  );
}

/* ----------------------------------------------------------------- Card */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const styles = getStyles();
  const inner = (
    <View style={[styles.card, padded && { padding: space.lg }, style]}>{children}</View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.75 }}>
      {inner}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = getStyles();
  return <View style={[styles.divider, style]} />;
}

export function Row({
  children,
  style,
  gap = space.sm,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/* -------------------------------------------------------------- Buttons */

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = getStyles();
  const bg =
    variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = variant === 'primary' ? colors.accentText : colors.text;
  const border = variant === 'secondary' ? colors.borderStrong : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'secondary' ? 1 : 0 },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={space.sm}>
          {icon && <Feather name={icon} size={16} color={fg} />}
          <Text style={[typeScale.bodyStrong, { color: fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  size = 20,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
}) {
  const styles = getStyles();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
      <Feather name={icon} size={size} color={color} />
    </Pressable>
  );
}

/* ------------------------------------------------------------- Chips/Seg */

export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const styles = getStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.border,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <Text style={[typeScale.smallStrong, { color: active ? colors.accentText : colors.textDim }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const styles = getStyles();
  return (
    <View style={styles.segmented}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={[
              styles.segment,
              active && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
            ]}>
            <Text style={[typeScale.smallStrong, { color: active ? colors.text : colors.textFaint }]}>
              {it.label}
              {it.count != null ? ` ${it.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------- Fields */

export function Field({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
  autoCapitalize,
  accessibilityLabel,
  onSubmitEditing,
  style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
  style?: StyleProp<TextStyle>;
}) {
  const styles = getStyles();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      onSubmitEditing={onSubmitEditing}
      style={[
        styles.field,
        multiline && { minHeight: 96, textAlignVertical: 'top' },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------- Info / Stat rows */

export function InfoRow({
  icon,
  label,
  value,
  right,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <Row style={{ justifyContent: 'space-between', paddingVertical: space.md }}>
      <Row gap={space.md} style={{ flex: 1 }}>
        <Feather name={icon} size={16} color={colors.textFaint} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{label}</Txt>
          {value ? (
            <Txt variant="small" color={colors.textFaint}>
              {value}
            </Txt>
          ) : null}
        </View>
      </Row>
      {right}
    </Row>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

export function Stat({ value, label, color = colors.text }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="title" color={color}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textFaint}>
        {label}
      </Txt>
    </View>
  );
}

// A function, not a module-level StyleSheet.create: colors is a mutable object
// that the dark-mode toggle reassigns in place, so these need to be recomputed
// on every render rather than frozen with whatever palette was active at import time.
function getStyles() {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: { height: 1, backgroundColor: colors.border },
  btn: {
    height: 50,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chip: {
    paddingHorizontal: space.md,
    height: 34,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 34,
    borderRadius: radius.control - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
  },
  });
}
