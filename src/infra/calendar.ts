/**
 * Lightweight, deterministic "you might have time to spare" nudge for the Today
 * screen — a rule-based mock standing in for real calendar awareness (same spirit as
 * `inferMode`/`interpretIntent`: no fake ML, just a small hand-authored table), keyed
 * off the actual day of the week so it varies without needing a real calendar
 * integration. `permissions.tsx` already has a "Calendar: free/busy only" permission
 * this is consistent with — DemandOne is allowed to notice gaps, never to read what's
 * actually in them.
 */

interface DayPrompt {
  hours: string;
  dayPart: string;
}

const DAY_PROMPTS: Record<number, DayPrompt> = {
  0: { hours: '2 hours', dayPart: 'this evening' },
  1: { hours: '3 hours', dayPart: 'this afternoon' },
  2: { hours: '2 hours', dayPart: 'this evening' },
  3: { hours: '4 hours', dayPart: 'this afternoon' },
  4: { hours: '3 hours', dayPart: 'this afternoon' },
  5: { hours: '2 hours', dayPart: 'this evening' },
  6: { hours: '5 hours', dayPart: 'today' },
};

export interface CalendarNudge {
  prompt: string;
  sub: string;
}

export function getCalendarNudge(date: Date = new Date()): CalendarNudge {
  const { hours, dayPart } = DAY_PROMPTS[date.getDay()];
  return {
    prompt: `${hours} open on your calendar ${dayPart} — got time to spare?`,
    sub: "Tell your agent — someone's probably looking for exactly that.",
  };
}
