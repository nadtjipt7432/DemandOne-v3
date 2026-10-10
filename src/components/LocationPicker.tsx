import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { LOCATIONS } from '@/domain/locations';
import { colors, radius, space } from '@/theme';
import { Card, Divider, Row, Txt } from './base';

/**
 * Cascading Country → State/Region → City picker, built from the bounded tree in
 * data/locations.ts. Same modal/backdrop technique already used for
 * FitDisclosure/ProofDisclosure — no new picker dependency. Doesn't try to
 * pre-select from an existing free-text location string (reverse-parsing "Miami,
 * FL" back into the tree isn't worth the complexity for a demo); callers show the
 * current value separately and this always starts fresh, firing `onChange` once
 * all three levels are picked.
 */
export function LocationPicker({ onChange }: { onChange: (location: string) => void }) {
  const [countryIdx, setCountryIdx] = useState<number | null>(null);
  const [regionIdx, setRegionIdx] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [open, setOpen] = useState<'country' | 'region' | 'city' | null>(null);

  const country = countryIdx !== null ? LOCATIONS[countryIdx] : undefined;
  const region = country && regionIdx !== null ? country.regions[regionIdx] : undefined;

  const selectCountry = (idx: number) => {
    setCountryIdx(idx);
    setRegionIdx(null);
    setCity(null);
    setOpen(null);
  };
  const selectRegion = (idx: number) => {
    setRegionIdx(idx);
    setCity(null);
    setOpen(null);
  };
  const selectCity = (c: string) => {
    setCity(c);
    setOpen(null);
    if (country && region) {
      const regionPart = country.country === 'United States' ? region.abbrev ?? region.region : region.region;
      onChange(`${c}, ${regionPart}${country.country === 'United States' ? '' : `, ${country.country}`}`);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <PickerField label="Country" value={country?.country} placeholder="Select country" onPress={() => setOpen('country')} />
      <PickerField
        label={country?.regionLabel ?? 'State'}
        value={region?.region}
        placeholder={country ? `Select ${country.regionLabel.toLowerCase()}` : 'Select country first'}
        disabled={!country}
        onPress={() => setOpen('region')}
      />
      <PickerField label="City" value={city ?? undefined} placeholder={region ? 'Select city' : 'Select state first'} disabled={!region} onPress={() => setOpen('city')} />

      <OptionModal
        visible={open === 'country'}
        title="Country"
        options={LOCATIONS.map((l) => l.country)}
        onSelect={(_label, idx) => selectCountry(idx)}
        onClose={() => setOpen(null)}
      />
      <OptionModal
        visible={open === 'region'}
        title={country?.regionLabel ?? 'State'}
        options={country?.regions.map((r) => r.region) ?? []}
        onSelect={(_label, idx) => selectRegion(idx)}
        onClose={() => setOpen(null)}
      />
      <OptionModal
        visible={open === 'city'}
        title="City"
        options={region?.cities ?? []}
        onSelect={(label) => selectCity(label)}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

function PickerField({
  label,
  value,
  placeholder,
  disabled,
  onPress,
}: {
  label: string;
  value?: string;
  placeholder: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <View>
      <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Row
          style={{
            justifyContent: 'space-between',
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: disabled ? 0.5 : 1,
          }}>
          <Txt variant="body" color={value ? colors.text : colors.textFaint}>
            {value ?? placeholder}
          </Txt>
          <Feather name="chevron-down" size={16} color={colors.textFaint} />
        </Row>
      </Pressable>
    </View>
  );
}

function OptionModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  onSelect: (label: string, index: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(32,31,27,0.5)', justifyContent: 'flex-end' }}
        onPress={onClose}>
        <Pressable onPress={() => {}}>
          <Card style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '60%' }}>
            <Txt variant="heading">{title}</Txt>
            <ScrollView style={{ marginTop: space.sm }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <View key={opt}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={opt}
                    onPress={() => onSelect(opt, i)}
                    style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                    <Txt variant="body">{opt}</Txt>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
