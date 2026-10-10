import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Card, Chip, Divider, Field, Row, Screen, Segmented, Txt } from '@/components/base';
import { Header } from '@/components/domain';
import { useAppState, useViewer } from '@/state/hooks';
import { extractQuickFacts, interpretIntent } from '@/domain/intents';
import { CRITERION_LABEL, computeFit } from '@/domain/matching';
import { createFromText, inferMode } from '@/services/market';
import { colors, radius, space } from '@/theme';
import type { BuyerAuthority, Capacity, Criterion, Effort, LocationMode, SellerAuthority, TimingType } from '@/domain/types';

/** Cap how many categories surface at once — "do not overwhelm the user." */
const MAX_CATEGORIES = 4;

const TIMING_PRESETS: { key: string; label: string; hours: number }[] = [
  { key: 'today', label: 'Today', hours: 24 },
  { key: 'tomorrow', label: 'Tomorrow', hours: 48 },
  { key: 'week', label: 'This week', hours: 168 },
  { key: 'nextweek', label: 'Next week', hours: 336 },
  { key: '2weeks', label: 'In 2 weeks', hours: 336 },
  { key: 'month', label: 'Next month', hours: 720 },
];

const NEED_EFFORT: { key: Effort; label: string }[] = [
  { key: 'one-time', label: 'One-time' },
  { key: 'few-hours', label: 'A few hours' },
  { key: 'several-days', label: 'Several days' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'not-sure', label: 'Not sure' },
];

const OFFER_CAPACITY: { key: Capacity; label: string }[] = [
  { key: 'one-project', label: 'One project' },
  { key: 'few-hours', label: 'A few hours' },
  { key: 'part-time', label: 'Part-time' },
  { key: 'multiple-clients', label: 'Multiple clients' },
  { key: 'ongoing', label: 'Ongoing' },
];

const NEED_AUTHORITY: { key: BuyerAuthority; label: string; sub: string }[] = [
  { key: 'none', label: "Don't negotiate", sub: 'Pay the listed price only.' },
  { key: 'within-range', label: 'Negotiate within my range', sub: 'Your agent works between your min and max.' },
  { key: 'best-deal', label: 'Try to get the best deal', sub: 'Ask before exceeding my maximum.' },
];

const OFFER_AUTHORITY: { key: SellerAuthority; label: string; sub: string }[] = [
  { key: 'none', label: 'No negotiation', sub: "Fixed price — your agent won't field offers." },
  { key: 'within-bounds', label: 'Negotiate within bounds', sub: 'Your agent works between your target and minimum.' },
  { key: 'toward-target', label: 'Let DemandOne negotiate toward my target', sub: 'Never below your minimum.' },
];

const CRITERIA: Criterion[] = ['expertise', 'trust', 'budget', 'geography'];

function RadioRow<T extends string>({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ paddingVertical: space.sm }, pressed && { opacity: 0.6 }]}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: radius.pill,
            borderWidth: 1.5,
            borderColor: active ? colors.accent : colors.borderStrong,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}>
          {active ? <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.accent }} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="body">{label}</Txt>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 1 }}>
            {sub}
          </Txt>
        </View>
      </Row>
    </Pressable>
  );
}

function MandateRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: space.sm }}>
      <Txt variant="small" color={colors.textFaint}>
        {label}
      </Txt>
      <Txt variant="body" style={{ marginTop: 2 }}>
        {value}
      </Txt>
    </View>
  );
}

export default function IntentResults() {
  const router = useRouter();
  const { text } = useLocalSearchParams<{ text: string }>();
  const { people, cards, categories } = useAppState();
  const viewer = useViewer();
  const [busy, setBusy] = useState(false);

  const mode = useMemo(() => inferMode(text ?? ''), [text]);
  const intent = useMemo(() => interpretIntent(text ?? ''), [text]);
  const shown = intent.impliedCategories.slice(0, MAX_CATEGORIES);

  // "What DemandOne understood" — a second, narrower deterministic pass (same text,
  // same keyword-scan mock as `interpretIntent`) that surfaces a few concrete facts
  // up front, before the structured form below. Doubles as this flow's voice-input
  // confirm/edit step: a transcript from the mic is just text like any other, so it
  // flows through exactly this same parse.
  const quickFacts = useMemo(() => extractQuickFacts(text ?? ''), [text]);

  const [selected, setSelected] = useState<string[]>(() => (shown[0] ? [shown[0].categoryId] : []));
  const toggleSelected = (categoryId: string) =>
    setSelected((cur) => (cur.includes(categoryId) ? cur.filter((c) => c !== categoryId) : [...cur, categoryId]));

  const topCategoryId = selected[0] ?? shown[0]?.categoryId ?? viewer.categories[0];
  const marketAvg = categories.find((c) => c.id === topCategoryId)?.marketAvgPrice ?? 100;

  // --- Timing — seeded from quickFacts when the text named a clear timeframe ("next
  // month", "next week", ...), editable like everything else below.
  const timingInit = useMemo(() => {
    const preset = quickFacts.timingLabel
      ? TIMING_PRESETS.find((p) => p.label.toLowerCase() === quickFacts.timingLabel!.toLowerCase())
      : undefined;
    return preset ? { type: 'date' as TimingType, presetKey: preset.key } : { type: 'asap' as TimingType, presetKey: TIMING_PRESETS[2].key };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [timingType, setTimingType] = useState<TimingType>(timingInit.type);
  const [timingPreset, setTimingPreset] = useState(timingInit.presetKey);
  const timing = useMemo(() => {
    if (timingType === 'asap') return { window: { startHour: 0, endHour: 48, label: 'Within 48 hours' }, deadlineLabel: 'Within 48 hours' };
    if (timingType === 'flexible') return { window: { startHour: 0, endHour: 720, label: 'Flexible, within a month' }, deadlineLabel: 'Flexible' };
    const preset = TIMING_PRESETS.find((p) => p.key === timingPreset) ?? TIMING_PRESETS[2];
    const label = timingType === 'date' ? `By ${preset.label.toLowerCase()}` : preset.label;
    return { window: { startHour: 0, endHour: preset.hours, label }, deadlineLabel: label };
  }, [timingType, timingPreset]);

  // --- Effort / capacity, location ---
  const [effort, setEffort] = useState<Effort>('one-time');
  const [capacity, setCapacity] = useState<Capacity>('one-project');
  const [locationMode, setLocationMode] = useState<LocationMode>('remote');
  const [locationText, setLocationText] = useState(viewer.location);

  // --- Budget / pricing. Where the floor/ceiling setting actually comes in: at the moment
  // of posting, not buried in a settings screen. Prefilled from the category's real market
  // benchmark so it's never a blank, meaningless number.
  const [budgetMin, setBudgetMin] = useState(String(Math.round(marketAvg * 0.8)));
  const [budgetMax, setBudgetMax] = useState(String(Math.round(marketAvg * 1.1)));
  const [price, setPrice] = useState(String(Math.round(marketAvg)));
  const [floorPrice, setFloorPrice] = useState(String(Math.round(marketAvg * 0.85)));
  const [needAuthority, setNeedAuthority] = useState<BuyerAuthority>('within-range');
  const [offerAuthority, setOfferAuthority] = useState<SellerAuthority>('within-bounds');

  // --- What matters most — up to 3, ranked by tap order. Feeds computeFit's orderOverride
  // for this mission's own matches, not just display copy. Seeded from quickFacts when the
  // text stated a clear trade-off ("experience matters more than price").
  const [priorities, setPriorities] = useState<Criterion[]>(() => quickFacts.priorities ?? []);
  const togglePriority = (c: Criterion) =>
    setPriorities((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 3 ? cur : [...cur, c]));

  const previews = useMemo(() => {
    const complementKind = mode === 'need' ? 'offer' : 'need';
    return shown.map(({ categoryId, why }) => {
      const category = categories.find((c) => c.id === categoryId);
      const pool = cards.filter((c) => c.category === categoryId && c.kind === complementKind);
      const ranked = pool
        .map((card) => ({ card, fit: computeFit(card, viewer, people[card.personId], priorities.length ? priorities : undefined) }))
        .sort((a, b) => b.fit.score - a.fit.score);
      const top = ranked[0];
      return { categoryId, label: category?.label ?? categoryId, why, count: ranked.length, topName: top ? people[top.card.personId].name.split(' ')[0] : undefined };
    });
  }, [shown, cards, mode, viewer, people, categories, priorities]);

  const authorityLine =
    mode === 'need'
      ? NEED_AUTHORITY.find((a) => a.key === needAuthority)?.sub ?? ''
      : OFFER_AUTHORITY.find((a) => a.key === offerAuthority)?.sub ?? '';

  const engagementLabel = mode === 'need' ? NEED_EFFORT.find((e) => e.key === effort)?.label : OFFER_CAPACITY.find((c) => c.key === capacity)?.label;
  const whereLabel = locationMode === 'remote' ? 'Remote' : locationMode === 'hybrid' ? `Hybrid · ${locationText}` : locationText;
  const budgetLine = mode === 'need' ? `$${budgetMin}–$${budgetMax}` : `Target $${price}${floorPrice ? `, minimum $${floorPrice}` : ''}`;
  const priorityLine = priorities.length ? priorities.map((c) => CRITERION_LABEL[c]).join(' > ') : 'No preference set — ranked by your overall Standard of Value';

  const quickRows = useMemo(() => {
    const rows: { label: string; value: string }[] = [
      { label: mode === 'need' ? 'Need' : 'Offer', value: categories.find((c) => c.id === topCategoryId)?.label ?? text ?? '' },
      { label: 'Timing', value: quickFacts.timingLabel ?? 'Not specified' },
    ];
    if (quickFacts.sector) rows.push({ label: 'Sector', value: quickFacts.sector });
    if (mode === 'need') rows.push({ label: 'Priority', value: quickFacts.priorityLabel ?? 'Not specified' });
    if (mode === 'offer' && quickFacts.experienceLabel) rows.push({ label: 'Experience', value: quickFacts.experienceLabel });
    if (mode === 'offer' && quickFacts.availabilityLabel) rows.push({ label: 'Availability', value: quickFacts.availabilityLabel });
    if (mode === 'need') rows.push({ label: 'Budget', value: 'Not specified' });
    return rows;
  }, [mode, quickFacts, topCategoryId, categories, text]);

  const postThis = async () => {
    if (!text) return;
    setBusy(true);
    const categoriesToPost = selected.length ? selected : [topCategoryId];
    let firstId = '';
    for (const categoryId of categoriesToPost) {
      const newId = await createFromText({
        mode,
        text,
        category: categoryId,
        budgetMax: mode === 'need' ? Number(budgetMax) || undefined : undefined,
        budgetMin: mode === 'need' ? Number(budgetMin) || undefined : undefined,
        price: mode === 'offer' ? Number(price) || undefined : undefined,
        negotiable: mode === 'offer' ? offerAuthority !== 'none' : undefined,
        floorPrice: mode === 'offer' && offerAuthority !== 'none' ? Number(floorPrice) || undefined : undefined,
        timing: { type: timingType, deadlineLabel: timing.deadlineLabel, window: timing.window },
        effort: mode === 'need' ? effort : undefined,
        capacity: mode === 'offer' ? capacity : undefined,
        locationMode,
        location: locationMode !== 'remote' ? locationText : undefined,
        authority: mode === 'need' ? needAuthority : offerAuthority,
        priorities,
      });
      if (!firstId) firstId = newId;
    }
    setBusy(false);
    router.replace({ pathname: '/recommendations', params: { id: firstId, mode } });
  };

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Your agent" />

      <Txt variant="small" color={colors.textFaint}>
        {mode === 'need' ? 'What you’re looking for' : 'What you can offer'}
      </Txt>
      <Txt variant="title" style={{ marginTop: space.xs }}>
        Got it — {intent.interpretation}.
      </Txt>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.lg }}>
        What DemandOne understood — edit anything below if something's off.
      </Txt>
      <Card style={{ marginTop: space.sm }}>
        {quickRows.map((r, i) => (
          <View key={r.label}>
            {i > 0 ? <Divider /> : null}
            <MandateRow label={r.label} value={r.value} />
          </View>
        ))}
      </Card>

      {previews.length === 0 ? (
        <View style={{ marginTop: space.xl }}>
          <Txt variant="body" color={colors.textDim}>
            Nothing specific jumped out from that — but you can still put it to your agent, or
            browse everything live right now.
          </Txt>
        </View>
      ) : (
        <>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: space.md }}>
            {previews.length > 1
              ? `I found ${previews.length} ways I can help`
              : mode === 'need'
                ? 'Things I can help with'
                : 'You could help with'}
          </Txt>
          <View style={{ marginTop: space.sm }}>
            {previews.map((p, i) => {
              const isSelected = selected.includes(p.categoryId);
              return (
                <View key={p.categoryId}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: space.md }}>
                    <Pressable onPress={() => toggleSelected(p.categoryId)} style={{ flex: 1 }}>
                      <Row gap={space.md}>
                        {previews.length > 1 ? (
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: radius.control - 3,
                              borderWidth: 1.5,
                              borderColor: isSelected ? colors.accent : colors.borderStrong,
                              backgroundColor: isSelected ? colors.accent : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            {isSelected ? <Feather name="check" size={13} color={colors.accentText} /> : null}
                          </View>
                        ) : null}
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong">{p.label}</Txt>
                          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                            {p.why}
                          </Txt>
                        </View>
                      </Row>
                    </Pressable>
                    <Pressable onPress={() => router.push({ pathname: '/discover', params: { category: p.categoryId } })}>
                      <Txt variant="small" color={colors.accent} style={{ textAlign: 'right' }}>
                        {p.count === 0
                          ? 'None yet'
                          : mode === 'need'
                            ? `${p.count} matched${p.topName ? ` · ${p.topName}` : ''}`
                            : `${p.count} nearby`}
                      </Txt>
                    </Pressable>
                  </Row>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* The basic clearing rules — set once, here, at the moment of posting. */}
      <Txt variant="heading" style={{ marginTop: space.xl }}>
        A few details
      </Txt>

      <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.lg }}>
        When do you need this?
      </Txt>
      <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
        {(['asap', 'date', 'window', 'flexible'] as TimingType[]).map((t) => (
          <Chip
            key={t}
            label={t === 'asap' ? 'As soon as possible' : t === 'date' ? 'By a specific date' : t === 'window' ? 'Within a time window' : 'Flexible'}
            active={timingType === t}
            onPress={() => setTimingType(t)}
          />
        ))}
      </Row>
      {timingType === 'date' || timingType === 'window' ? (
        <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
          {TIMING_PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} active={timingPreset === p.key} onPress={() => setTimingPreset(p.key)} />
          ))}
        </Row>
      ) : null}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xs }}>
        {timing.deadlineLabel}
      </Txt>

      <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.lg }}>
        {mode === 'need' ? 'How long / how much work?' : 'How much capacity?'}
      </Txt>
      <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
        {(mode === 'need' ? NEED_EFFORT : OFFER_CAPACITY).map((o) => (
          <Chip
            key={o.key}
            label={o.label}
            active={mode === 'need' ? effort === o.key : capacity === o.key}
            onPress={() => (mode === 'need' ? setEffort(o.key as Effort) : setCapacity(o.key as Capacity))}
          />
        ))}
      </Row>

      <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.lg }}>
        Where?
      </Txt>
      <View style={{ marginTop: space.sm }}>
        <Segmented
          items={[
            { key: 'remote', label: 'Remote' },
            { key: 'in-person', label: 'In person' },
            { key: 'hybrid', label: 'Hybrid' },
          ]}
          value={locationMode}
          onChange={(key) => setLocationMode(key as LocationMode)}
        />
      </View>
      {locationMode !== 'remote' ? (
        <Field value={locationText} onChangeText={setLocationText} placeholder="Location" style={{ marginTop: space.sm }} />
      ) : null}

      <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.lg }}>
        {mode === 'need' ? 'Budget' : 'Pricing'}
      </Txt>
      {mode === 'need' ? (
        <>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
            Typical rate for this is around ${Math.round(marketAvg)}.
          </Txt>
          <Row gap={space.sm} style={{ marginTop: space.sm, alignItems: 'center' }}>
            <Txt variant="heading">$</Txt>
            <Field value={budgetMin} onChangeText={setBudgetMin} keyboardType="number-pad" style={{ flex: 1 }} />
            <Txt variant="body" color={colors.textFaint}>
              –
            </Txt>
            <Txt variant="heading">$</Txt>
            <Field value={budgetMax} onChangeText={setBudgetMax} keyboardType="number-pad" style={{ flex: 1 }} />
          </Row>
        </>
      ) : (
        <>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
            Your target rate. Typical rate for this is around ${Math.round(marketAvg)}.
          </Txt>
          <Row gap={space.sm} style={{ marginTop: space.sm, alignItems: 'center' }}>
            <Txt variant="heading">$</Txt>
            <Field value={price} onChangeText={setPrice} keyboardType="number-pad" style={{ flex: 1 }} />
          </Row>
        </>
      )}

      <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.lg }}>
        How much freedom should DemandOne have to negotiate?
      </Txt>
      <View style={{ marginTop: space.xs }}>
        {mode === 'need'
          ? NEED_AUTHORITY.map((a) => (
              <RadioRow key={a.key} label={a.label} sub={a.sub} active={needAuthority === a.key} onPress={() => setNeedAuthority(a.key)} />
            ))
          : OFFER_AUTHORITY.map((a) => (
              <RadioRow key={a.key} label={a.label} sub={a.sub} active={offerAuthority === a.key} onPress={() => setOfferAuthority(a.key)} />
            ))}
      </View>
      {mode === 'offer' && offerAuthority !== 'none' ? (
        <>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: space.sm }}>
            Lowest you'd accept — your agent won't concede past this, and will say so plainly
            instead of pretending to negotiate further.
          </Txt>
          <Row gap={space.sm} style={{ marginTop: space.sm, alignItems: 'center' }}>
            <Txt variant="heading">$</Txt>
            <Field value={floorPrice} onChangeText={setFloorPrice} keyboardType="number-pad" style={{ flex: 1 }} />
          </Row>
        </>
      ) : null}

      <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.lg }}>
        What matters most?
      </Txt>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
        Pick up to 3, in order of importance.
      </Txt>
      <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
        {CRITERIA.map((c) => (
          <Chip key={c} label={CRITERION_LABEL[c]} active={priorities.includes(c)} onPress={() => togglePriority(c)} />
        ))}
      </Row>

      {/* The agent mandate — exactly what DemandOne is allowed to do, before it does it. */}
      <Txt variant="heading" style={{ marginTop: space.xl }}>
        {mode === 'need' ? 'Your request' : 'Your offer'}
      </Txt>
      <Card style={{ marginTop: space.sm }}>
        <MandateRow label={mode === 'need' ? 'What I need' : 'What I offer'} value={text ?? ''} />
        <Divider />
        <MandateRow label="When" value={timing.deadlineLabel ?? ''} />
        <Divider />
        <MandateRow label="Engagement" value={engagementLabel ?? ''} />
        <Divider />
        <MandateRow label="Where" value={whereLabel} />
        <Divider />
        <MandateRow label={mode === 'need' ? 'Budget' : 'Pricing'} value={budgetLine} />
        <Divider />
        <MandateRow label="What matters" value={priorityLine} />
        <Divider />
        <MandateRow label="Agent authority" value={authorityLine} />
        <Divider />
        <MandateRow label="Market behavior" value="Search now. Keep watching if nothing clears." />
      </Card>

      <View style={{ marginTop: space.xl, gap: space.md }}>
        <Btn title="Start matching" loading={busy} onPress={postThis} />
        <Pressable onPress={() => router.push('/discover')} style={{ alignSelf: 'center' }}>
          <Txt variant="small" color={colors.textDim}>
            See everything instead
          </Txt>
        </Pressable>
      </View>
    </Screen>
  );
}
