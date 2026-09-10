/**
 * The transcripts bundled with the site.
 *
 * One list, used by both the picker on the upload step and the tailored
 * example questions on the search step. They used to be two separate literals
 * that had to match by hand, and a typo in either silently fell back to the
 * generic questions with nothing to indicate why.
 */
export interface Sample {
  /** Path under public/, fetched relative to the site root. */
  path: string;
  /** Shown in the picker, and used as the transcript name afterwards. */
  label: string;
  /** One line describing what is in the transcript. */
  blurb: string;
  /**
   * Example questions for this transcript.
   *
   * Each one deliberately avoids the words used in the chat, so a keyword
   * search would miss it and a meaning based search will not.
   */
  questions: string[];
}

export const SAMPLES: Sample[] = [
  {
    path: 'samples/friends-chat.json',
    label: 'Two friends over a few months',
    blurb: 'A flat move, a job change, a trip, a bad knee, and a car that clicks.',
    questions: [
      'did she get the job',
      'why does her leg hurt',
      'what was wrong with the car',
    ],
  },
  {
    path: 'samples/team-standup.json',
    label: 'Engineering team channel',
    blurb: 'A sprint of caching work, a database migration, and one bad incident.',
    questions: [
      'what fixed the slowness',
      'why are we running out of space',
      'why did nobody trust the figures',
    ],
  },
  {
    path: 'samples/cooking-club.json',
    label: 'Cooking club group chat',
    blurb: 'Risotto that went wrong, bread that would not rise, and a meetup to plan.',
    questions: [
      'what should I leave out for allergies',
      'why is my rice sticky',
      'my bread is too heavy, what now',
    ],
  },
];

/** Questions offered when the transcript is not one of ours. */
export const GENERIC_QUESTIONS = ['what was decided', 'what went wrong', 'what happens next'];

/** Example questions for a transcript name, falling back to the generic set. */
export function questionsFor(sourceName: string): string[] {
  return SAMPLES.find((sample) => sample.label === sourceName)?.questions ?? GENERIC_QUESTIONS;
}
