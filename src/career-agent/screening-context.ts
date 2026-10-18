// Retrieval bookkeeping and unsupported proposal revisions are not judge input changes.
// All usable evidence, preferences, search goals and job context remain part of identity.
export const screeningContextSql = (value: string): string =>
  `(((${value})::jsonb #- '{career,revision}') - 'shortlist')`;

export const screeningAssessmentContextSql = (value: string): string =>
  `((${value})::jsonb #- '{candidate_preferences,career,revision}')`;
