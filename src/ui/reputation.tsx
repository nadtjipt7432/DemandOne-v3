/**
 * Feedback, rated against the agreed terms: the review form, a given or received
 * review, and a person's per-aspect record. Counts and words — no stars.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ASPECTS, AspectKey, AspectRating, aspectLabel, NOTE_MAX, RATING_LABEL, RATINGS, REVIEW_ISSUE_TEXT, ReviewedRole, ReviewInput, ReviewIssue, summarizeAspects, validateReview } from '@/domain/feedback';
import { Button, Choice, Field, Row, T } from './core';
import { evidenceLine } from './market';
import { colors, space } from '@/theme';
import type { Person, Review } from '@/domain/types';

const RATING_COLOR = (r: AspectRating) => (r === 'short' ? colors.rust : r === 'exceeded' ? colors.forest : colors.ink);

/** The review form for the counterparty, who played `role` in the transaction. */
export function ReviewForm({ role, name, onSubmit }: { role: ReviewedRole; name: string; onSubmit: (input: ReviewInput) => Promise<{ ok: boolean; issue?: string }> }) {
  const [recommends, setRecommends] = useState<'yes' | 'no'>();
  const [ratings, setRatings] = useState<Partial<Record<AspectKey, AspectRating>>>({});
  const [note, setNote] = useState('');
  const [issue, setIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = name.split(' ')[0];

  const submit = async () => {
    if (!recommends) return setIssue(`Say whether you’d work with ${first} again.`);
    const input = { recommends: recommends === 'yes', ratings, note };
    const local = validateReview(input, role, true);
    if (local) return setIssue(REVIEW_ISSUE_TEXT[local]);
    setBusy(true);
    setIssue(null);
    try {
      const result = await onSubmit(input);
      if (!result.ok) setIssue(REVIEW_ISSUE_TEXT[result.issue as ReviewIssue] ?? 'That didn’t go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.lg }} testID="review-form">
      <View style={{ gap: space.xs }}>
        <T v="heading">{`How did it go with ${first}?`}</T>
        <T v="small" color={colors.inkDim}>{`Rated against the terms you agreed. ${first} won’t see this until they’ve left theirs, and you’ll see theirs once you send yours.`}</T>
      </View>
      <Choice
        label={`Would you work with ${first} again?`}
        options={[
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ]}
        value={recommends}
        onChange={(v) => {
          setRecommends(v);
          setIssue(null);
        }}
      />
      {ASPECTS[role].map((a) => (
        <Choice
          key={a.key}
          label={a.label}
          options={RATINGS.map((r) => ({ key: r, label: RATING_LABEL[r] }))}
          value={ratings[a.key]}
          onChange={(r) => {
            setRatings((cur) => ({ ...cur, [a.key]: r }));
            setIssue(null);
          }}
        />
      ))}
      <Field
        label="One line for their record (optional)"
        value={note}
        onChangeText={(t) => setNote(t.slice(0, NOTE_MAX + 20))}
        placeholder={role === 'seller' ? 'What stood out about the work?' : 'What stood out about working with them?'}
        multiline
        hint={`${note.trim().length}/${NOTE_MAX}`}
        error={note.trim().length > NOTE_MAX ? REVIEW_ISSUE_TEXT['note-too-long'] : undefined}
        testID="review-note"
      />
      {issue ? (
        <T v="small" color={colors.rust} testID="review-issue">
          {issue}
        </T>
      ) : null}
      <Button title="Send feedback" onPress={submit} loading={busy} />
    </View>
  );
}

/** A given or received review, aspect by aspect. */
export function ReviewSummary({ title, review, testID }: { title: string; review: Review; testID?: string }) {
  const rated = Object.entries(review.ratings) as [AspectKey, AspectRating][];
  return (
    <View style={{ gap: space.xs }} testID={testID}>
      <Row justify="space-between">
        <T v="bodyStrong">{title}</T>
        {review.simulated ? <T v="label" color={colors.inkFaint}>Simulated</T> : null}
      </Row>
      <T v="small">{review.recommends ? 'Would work together again.' : 'Would not work together again.'}</T>
      {rated.map(([key, rating]) => (
        <Row key={key} justify="space-between">
          <T v="small" color={colors.inkDim}>{aspectLabel(key)}</T>
          <T v="smallStrong" color={RATING_COLOR(rating)}>{RATING_LABEL[rating]}</T>
        </Row>
      ))}
      {review.note ? <T v="small" style={{ fontStyle: 'italic' }}>{`“${review.note}”`}</T> : null}
    </View>
  );
}

/** A feedback that hasn't been opened yet. */
export function SealedReview({ name }: { name: string }) {
  return (
    <View style={{ gap: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.rule, borderRadius: 10, padding: space.md }} testID="sealed-review">
      <T v="bodyStrong">{`${name.split(' ')[0]}’s feedback on you is in`}</T>
      <T v="small" color={colors.inkDim}>Sealed until you send yours, so neither review is a reaction to the other.</T>
    </View>
  );
}

/** A thin three-part bar: fell short, as agreed, beyond. */
function AspectBar({ short, met, exceeded, width = 72 }: { short: number; met: number; exceeded: number; width?: number }) {
  const total = short + met + exceeded || 1;
  const seg = (n: number, color: string) => (n ? <View style={{ width: (n / total) * width, height: 6, backgroundColor: color }} /> : null);
  return (
    <Row gap={0} style={{ width, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.sunk }}>
      {seg(short, colors.rust)}
      {seg(met, colors.inkFaint)}
      {seg(exceeded, colors.forest)}
    </Row>
  );
}

const ROLE_WORD: Record<ReviewedRole, string> = { buyer: 'as buyer', seller: 'as seller' };

/** A person's record: verified counts, then each aspect as rated by past counterparties, then recent notes. */
export function ReputationRecord({ person, notes = 2, counts = true, testID = 'reputation' }: { person: Person; notes?: number; counts?: boolean; testID?: string }) {
  const aspects = summarizeAspects(person.reputation);
  const recent = (person.reputation?.notes ?? []).slice(0, notes);
  return (
    <View style={{ gap: space.sm, paddingTop: space.sm }} testID={testID}>
      {counts ? <T v="small">{evidenceLine(person)}</T> : null}
      {aspects.length ? (
        <View style={{ gap: 6 }}>
          {aspects.map((a) => (
            <View key={a.key} accessible accessibilityLabel={`${a.label}: ${a.line}${a.short ? `, ${a.short} fell short` : ''}`}>
              <Row gap={space.sm}>
                <T v="smallStrong" style={{ flex: 1 }}>{a.label}</T>
                <AspectBar short={a.short} met={a.met} exceeded={a.exceeded} />
              </Row>
              <T v="small" color={colors.inkDim}>{a.short ? `${a.line}; ${a.short} fell short` : a.line}</T>
            </View>
          ))}
          <Row gap={space.md}>
            {(['short', 'met', 'exceeded'] as AspectRating[]).map((r) => (
              <Row key={r} gap={4}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r === 'met' ? colors.inkFaint : RATING_COLOR(r) }} />
                <T v="label" color={colors.inkFaint}>{RATING_LABEL[r]}</T>
              </Row>
            ))}
          </Row>
        </View>
      ) : null}
      {recent.map((n) => (
        <View key={n.at + n.from} style={{ gap: 2 }}>
          <T v="small" style={{ fontStyle: 'italic' }}>{`“${n.text}”`}</T>
          <T v="label" color={colors.inkFaint}>{`${n.from}, ${ROLE_WORD[n.role]}`}</T>
        </View>
      ))}
    </View>
  );
}
