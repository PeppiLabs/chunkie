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
    path: 'samples/customer-support.json',
    label: 'Customer support chat',
    blurb: 'A shopper chasing a late parcel, a locked account, and a return.',
    questions: [
      'how long before I am reimbursed',
      'I am shut out of my profile',
      'can I have it delivered to my workplace',
    ],
  },
  {
    path: 'samples/team-standup.json',
    label: 'Engineering standup',
    blurb: 'A team talking through a caching change, a bug, and a database migration.',
    questions: [
      'what made the site quicker',
      'why are we running out of space',
      'can we undo it if it goes wrong',
    ],
  },
  {
    path: 'samples/cooking-club.json',
    label: 'Cooking club group chat',
    blurb: 'Friends swapping advice on risotto, bread, and what to bring on Saturday.',
    questions: [
      'what should I leave out for allergies',
      'why did my dough stay flat',
      'how do I stop it turning gluey',
    ],
  },
];

/** Questions offered when the transcript is not one of ours. */
export const GENERIC_QUESTIONS = ['what was decided', 'what went wrong', 'what happens next'];

/** Example questions for a transcript name, falling back to the generic set. */
export function questionsFor(sourceName: string): string[] {
  return SAMPLES.find((sample) => sample.label === sourceName)?.questions ?? GENERIC_QUESTIONS;
}
