export const portfolios = [
  ['portfolio-1-database-design', 'Database Design and Modelling'],
  ['portfolio-2-query-optimisation', 'Query Processing and Optimisation'],
  ['portfolio-3-transactions-concurrency', 'Transactions and Concurrency'],
  ['portfolio-4-nosql', 'NoSQL and Advanced Data Models'],
  ['portfolio-5-distributed-cloud', 'Distributed and Cloud Database Exercise'],
];
export const stageNames = [
  'Check repository', 'Check Codespaces and tools', 'Create portfolio structure',
  'Describe case study', 'Design entities and relationships', 'Draw ER diagram',
  'Show normalisation', 'Connect PostgreSQL', 'Create and inspect tables',
  'Insert data and test constraints', 'Complete Portfolio 1', 'Run SQL queries',
  'Compare plans and optimise', 'Test commit and rollback', 'Test concurrency',
  'Connect MongoDB', 'Model and query documents', 'Explain distributed design',
  'Build final summary and package',
];
export const screenshotPlan = [
  [1, 8, 'Connection'], [1, 9, 'Tables'], [1, 9, 'Constraints'], [1, 10, 'ConstraintTests'],
  [2, 12, 'QueryResults'], [2, 13, 'BeforeIndex'], [2, 13, 'AfterIndex'],
  [3, 14, 'CommitRollback'], [3, 15, 'SessionsWaiting'], [3, 15, 'ConcurrencyResult'],
  [4, 16, 'MongoDBConnection'], [4, 17, 'DocumentsAndQueries'],
  [5, 18, 'ProposedDesign'],
];

export class InputError extends Error {
  constructor(errors) { super('Check the highlighted fields.'); this.errors = errors; }
}

function cleanName(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) { errors[label] = 'Enter your name.'; return ''; }
  const name = value.trim().normalize('NFC');
  if (name.length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]*$/u.test(name)) {
    errors[label] = 'Use letters, spaces, apostrophes or hyphens (up to 80 characters).';
  }
  return name;
}

export function validateInput(raw) {
  const errors = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError({ form: 'Enter your project details.' });
  const firstName = cleanName(raw.firstName, 'firstName', errors);
  const surname = cleanName(raw.surname, 'surname', errors);
  const studentId = typeof raw.studentId === 'string' ? raw.studentId.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(studentId)) errors.studentId = 'Use 1-40 letters or digits, with optional hyphens. Keep any leading zeroes.';
  const caseStudy = typeof raw.caseStudy === 'string' ? raw.caseStudy.trim() : '';
  if (caseStudy.length < 5 || caseStudy.length > 3000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(caseStudy)) errors.caseStudy = 'Describe your case study in 5-3,000 characters.';
  if (!['gemini', 'codex', 'copilot'].includes(raw.provider)) errors.provider = 'Choose an AI tool.';
  if (Object.keys(errors).length) throw new InputError(errors);
  const filenamePart = value => value.normalize('NFC').replace(/['\u2019]/g, '').replace(/\s+/g, '_');
  const prefix = `${filenamePart(surname)}_${filenamePart(firstName)}_${studentId}`;
  if (new TextEncoder().encode(prefix).length > 180) throw new InputError({ form: 'Your combined filename is too long. Use shorter name fields.' });
  return { firstName, surname, studentId, caseStudy, provider: raw.provider, prefix };
}

export function createStagePlan() {
  return stageNames.map((name, i) => ({ id: i + 1, name, status: 'pending', evidence: [] }));
}
