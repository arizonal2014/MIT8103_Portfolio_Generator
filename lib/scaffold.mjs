import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateInput, portfolios, screenshotPlan, createStagePlan, InputError } from '../shared.mjs';
import { validateCaseSpec } from './case-spec.mjs';

export async function createScaffold(raw, runsDirectory) {
  const input = validateInput(raw);
  const caseValidation = raw.caseSpec === undefined ? null : validateCaseSpec(raw.caseSpec);
  if (caseValidation && !caseValidation.valid) throw new InputError({caseSpec:'The case specification failed validation. Correct it before saving.'});
  const runId = randomUUID();
  const runRoot = path.resolve(runsDirectory, runId);
  const output = path.join(runRoot, input.prefix);
  await mkdir(runsDirectory, { recursive: true, mode: 0o700 });
  await mkdir(runRoot, { mode: 0o700 });
  await mkdir(output, { mode: 0o700 });
  const files = [];
  const save = async (relative, text) => {
    await writeFile(path.join(output, relative), text, { flag: 'wx', mode: 0o600 });
    files.push(relative);
  };
  const safeDisplay = value => value.replaceAll('\r', '').replaceAll('\n', ' ');
  const evidence = screenshotPlan.map(([portfolio, stage, label]) => ({
    stage,
    status: 'pending',
    image: `${portfolios[portfolio-1][0]}/screenshots/${input.prefix}_P${portfolio}_${label}.png`,
    log: `${portfolios[portfolio-1][0]}/logs/${input.prefix}_P${portfolio}_${label}.txt`,
    description: portfolio === 5 ? 'Proposed design, not a live failover test.' : 'Capture only after actual execution.',
  }));
  for (const [i, [folder, title]] of portfolios.entries()) {
    await mkdir(path.join(output, folder), { mode: 0o700 });
    await mkdir(path.join(output, folder, 'screenshots'), { mode: 0o700 });
    await mkdir(path.join(output, folder, 'logs'), { mode: 0o700 });
    await save(`${folder}/${input.prefix}_P${i+1}_README.md`, `# Portfolio ${i+1}: ${title}\n\nStatus: pending. No database exercise has run.\n\nThis directory is reserved for the generated implementation, results, logs and screenshots.\n`);
  }
  const manifest = {
    version: 1, runId, createdAt: new Date().toISOString(),
    scaffold: { status: 'complete', meaning: 'Folders, naming and pending plans only. No AI or database execution.' },
    input,
    provider: { selected: input.provider, connected: false },
    caseSpecification: caseValidation ? {status:'structurally_valid',fingerprint:caseValidation.fingerprint,executionVerified:false} : {status:'pending'},
    stages: createStagePlan(), evidence,
    submissionReady: false,
    pending: ['Repository verification', 'Provider connection', 'Database exercises', 'Screenshots', 'Summary', 'Personal reflection and review'],
  };
  await save(`${input.prefix}_README.md`, `# MIT 8103 portfolio workspace\n\nName: ${safeDisplay(input.firstName)} ${safeDisplay(input.surname)}\n\nStudent ID: ${input.studentId}\n\nCase study (student input):\n\n${input.caseStudy.split('\n').map(line => '> ' + line).join('\n')}\n\n## Current status\n\nScaffold only. No AI request, database command, screenshot, Git commit or final summary has been generated. The selected AI tool is not connected. This is not a completed assessment.\n`);
  await save(`${input.prefix}_EvidencePlan.md`, `# Planned screenshots and logs\n\nAll items are pending. These are filenames to create after actual execution, not existing evidence.\n\n` + evidence.map(e => `- Step ${e.stage}: ${e.image}\n  - Matching log: ${e.log}\n  - ${e.description}\n`).join('\n'));
  if(caseValidation){
    await save(`${input.prefix}_CaseSpec.json`,JSON.stringify(raw.caseSpec,null,2)+'\n');
    await save(`${input.prefix}_CaseValidation.json`,JSON.stringify(caseValidation,null,2)+'\n');
  }
  await save(`${input.prefix}_RunManifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  return { ...manifest, outputDirectory: output, files };
}
