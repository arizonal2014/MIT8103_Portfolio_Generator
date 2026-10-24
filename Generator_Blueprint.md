# Portfolio generator blueprint

Status: the local app accepts free-text case studies and connects Copilot model generation, explicit execution packages, real PostgreSQL checks, model-derived ER diagrams, worked normalisation and named files. A typed library case passed the live browser flow. See Verification.md and Free_Case_Workflow.md. GitHub/Codespaces integration, automatic screenshot capture, Portfolios 2–5 and final documents remain unfinished.

Students enter their own case study. The active route no longer uses the hospital gate, layout or fixed execution bindings. It generates model-specific rules, records and rejection tests and validates them against actual PostgreSQL behaviour. Input is free text, while supported model/rule shapes and resource limits remain bounded; unsupported structures stop visibly rather than being silently substituted. This does not establish unattended success for every possible case description.

## 1. What the student gets

A personalised learning portfolio based on their chosen case study, with database scripts, an ER diagram, executed exercises, screenshots, logs, results and a 2-3-page summary. A short explanation accompanies every activity so the student can understand and inspect the work.

The student chooses Gemini, Codex or Copilot. No provider is selected for everybody, and students do not need all three.

The generator runs in a separate project. The current codelab and its library demonstration stay intact.

## 2. Student journey

1. Create a private repository from the generator template, then open its Codespace. GitHub account creation, terms and account permissions remain user actions.
2. Choose an available AI tool and complete its sign-in. Run a small access check before generating anything. Account access, quota and any costs must be checked for that user; a website subscription is not assumed to provide API access.
3. Enter first name, surname, student ID and a case-study description. These are the four project inputs; AI provider selection is a separate setting.
4. Start the generator. It validates the input, generates a case specification and executes the stages in order.
5. Watch a simple progress view showing completed, running, failed or waiting stages. Open any stage to read its output and screenshot.
6. Review the resulting files and the short explanation guide. Add personal reflection notes and confirm the description of AI assistance and personal verification.
7. Download the package or inspect, edit and rerun it in Codespaces. Submission remains a separate student action.

Authentication prompts, quota problems, ambiguous cases and failed checks may require input. End-to-end automation is the target, not a promise that every arbitrary description succeeds unattended.

## 3. Inputs and naming

| Input | Rule |
| --- | --- |
| First name | Required; display as entered after trimming accidental whitespace. |
| Surname | Required; stored separately from first name to avoid reversing them. |
| Student ID | Required string; preserve leading zeroes. Do not treat it as an integer. |
| Case study | Free-text scenario, such as a hospital, student records or learning management system. Ask for clarification if it cannot support the exercises. |
| AI tool | Student selects Gemini, Codex or Copilot; verify that connection independently. |

Show a naming preview before the first run: `Surname_Firstname_StudentID`. Filenames begin with the same prefix. Replace filename-unsafe characters consistently, preserve the display name and reject path separators or traversal. Never interpolate names or case-study text into shell commands.

Use synthetic records only, especially for medical, financial and student scenarios. Names and IDs are needed for final filenames and the document header, not for model reasoning; keep them out of AI prompts where possible. Keep credentials outside project files, logs, images and commits.

## 4. One specification, one runner, several AI connections

The AI produces a structured case specification. The runner uses that same specification for every portfolio instead of independently generating five unrelated projects.

The specification records:

- Scenario, users, operations, scope and business rules.
- Entities, attributes, types, keys, required/optional fields and relationship counts.
- Example records and expected results derived from those records.
- A performance query, separate benchmark data and candidate index.
- A successful transaction, failed transaction and case-appropriate concurrent operation.
- A MongoDB document model and queries for the same scenario.
- A distributed-database proposal tied to that actual setup.

Validate references, types, dependency order and relationships before execution. Render the ER diagram and SQL from the same agreed model. Normalisation must show actual example tables and dependencies, not just definitions.

Accept arbitrary case-study text, but keep the generated exercise small enough for the brief and available resources. Unsupported scenarios stop with a useful question rather than being silently renamed into a library. Passing mechanical checks does not establish that a design is sensible for its domain; the design must remain reviewable.

AI adapters translate provider-specific sign-in, request and response formats. A provider change must preserve the validated specification. Different models are not expected to give identical designs or measurements.

The execution runner is deterministic where practical: it runs saved files, checks results, captures evidence and builds documents. Do not ask the AI to invent successful outputs, infer a run from a script, or supply missing timings.

## 5. Mapping all 19 codelab steps

Source: the numbered files in [MIT8103_Codelab](../MIT8103_Codelab/README.md), read at revision `619af2bb8394ad020fc29223acaedf80f3423a61`. Existing library numbers are test-fixture examples, not required answers for another scenario.

| Step | Input | Proposed action | Success check and saved evidence |
| --- | --- | --- | --- |
| 1. Create repository | Student GitHub session and naming details | Guide the student through creating their own private repository from the template; check the current repository after creation. | Correct owner and name, private visibility and write access confirmed. Never create an account or accept terms automatically. |
| 2. Open Codespaces | Student repository | Student launches Codespaces; bootstrap checks the workspace and available tools. | Report actual tool versions, writable workspace and database prerequisites. Save setup log. |
| 3. Create portfolio structure | Validated naming prefix | Create the five portfolio directories, named READMEs and run metadata without overwriting existing work. | Expected paths exist; only intended files are staged. Save a genuine initial checkpoint. |
| 4. Describe case study | Free-text scenario | Produce users, operations, scope and business rules in the shared case specification. | Case is realistic and supports all five activities; assumptions are explicit. Stop for clarification where necessary. |
| 5. Entities, attributes, keys and relationships | Case specification | Produce the relational model, types, required links and constraints. | Referenced keys exist; relationship counts and business rules agree with the model. Save design document. |
| 6. ER diagram | Validated relational model | Generate diagram source and a rendered diagram image. | Diagram renders; tables, fields, keys and relationships match the specification. Save source and readable image. |
| 7. Normalisation | Model and sample rows | Produce worked 1NF, 2NF and 3NF tables with the dependencies that justify each split. | Examples reconstruct the intended records and agree with the final schema. Label simplified illustrative fields. |
| 8. Set up PostgreSQL | Checked runtime | Start an isolated PostgreSQL instance and create a run-specific database. | A real connection and version query succeed. Save setup log and one connection screenshot. |
| 9. Create and inspect tables | Schema generated from model | Execute schema, list tables and inspect keys, constraints and indexes. | Actual catalogue metadata matches the model. Save SQL, full output and compact table/constraint screenshots. |
| 10. Add data and test constraints | Synthetic seed data and invalid test cases | Insert valid records, then run expected-failure tests independently. | Counts match the seed; invalid records fail for the intended constraint, not an unrelated error. Save results, SQLSTATE details and a compact screenshot. |
| 11. Complete Portfolio 1 README | Steps 4-10 outputs | Summarise the actual design, execution and tests; build the evidence index. | Every linked file exists; requirements and verified results are covered. Save checkpoint. |
| 12. Useful queries | Relational data and business operations | Execute case-related joins, filters and an aggregate query. | Results agree with fixture expectations. Save queries, outputs and one results screenshot. |
| 13. Optimisation | Performance query and separate benchmark data | Capture baseline plans, add index, repeat comparable measurements and explain the outcome. | Query result is unchanged; save all times, median calculation, plans, buffer metrics and before/after images. Report no improvement if that is what occurs. |
| 14. Commit and rollback | Existing data and transaction scenario | Run successful commit, deliberate failure and rollback, checking before/after state. | Committed change persists; rolled-back changes do not. Save transaction script, assertions, log and screenshot. |
| 15. Concurrency | Two real database connections and case rule | Coordinate an overlapping operation using explicit barriers and bounded timeouts. | Observe actual isolation/wait or conflict and final invariant. Save ordered session logs, database wait evidence and two screenshots. Sleeps alone are not proof of concurrency. |
| 16. Set up MongoDB | Checked runtime | Start an isolated MongoDB instance; optional existing Atlas connection is a later tested route. | Version and ping succeed. Save setup notes, log and one screenshot without credentials. |
| 17. Model and query documents | Same case and verified relational state | Insert synthetic documents and execute count, history/filter and nested-field queries. | Acknowledged inserts, expected count and correct query results. Save JavaScript, model explanation, output and one screenshot. No automatic SQL synchronisation is claimed. |
| 18. Distributed/cloud discussion | Actual setup plus case | Generate a case-related replication, failure, consistency, sharding and deployment proposal. | Proposed and implemented work are distinguished; sources are verified. Save discussion and proposed topology diagram. No failover result is invented. |
| 19. Final summary and package | Verified run evidence and student reflection notes | Build a 2-3-page summary with ER diagram, evidence links, references and an accurate AI declaration; add short activity explanations. | Render PDF and check every page, page count, links and naming. Missing personal reflection or review leaves the submission checklist incomplete, rather than generating a fictitious experience. |

Stages 1-2 contain unavoidable user-controlled setup. Stages 3-19 are the automated pipeline after sign-in and configuration, except for any required clarification and personal review. This keeps the original scope without promising silent account creation or automatic submission.

## 6. Screenshots and execution evidence

Screenshots are a required part of the planned generator, not an optional extra added at the end.

Each execution stage records the command, database/session, output, exit status, real timestamp and run ID. A capture component takes screenshots of the actual results view after execution. If the view is rendered from a saved log, label it as a rendered execution report, not a manually operated terminal. Never manufacture an earlier shell session or reuse another student's image.

Proposed small screenshot set:

| Portfolio | Images to capture |
| --- | --- |
| P1 | Connection; table list; compact constraints view; seed counts and constraint-test results. Split a view if text becomes unreadable. |
| P2 | Query results; before-index plan; after-index plan. |
| P3 | Commit/rollback result; concurrent sessions waiting/conflicting; final invariant. |
| P4 | Connection; inserts and queries. |
| P5 | Proposed topology/discussion image, explicitly a proposal rather than a running replica set. |

The ER diagram is a generated design image, separate from execution screenshots. The final summary reuses it and links to the evidence; it does not require another screenshot collection.

Naming example: `Surname_Firstname_StudentID_P2_BeforeIndex.png`. Keep images under the matching portfolio's `screenshots/` directory. Include the correct extension, a short caption and a link to the matching raw log. A run manifest records file hashes and originating stage so screenshots can be traced to this run.

Capture failures are stage failures for packaging purposes: retain the successful execution log, show the missing image and retry capture without silently rerunning state-changing SQL. Never mark the evidence set complete with missing images.

## 7. Run safety, recovery and Git history

- Use a unique run directory and isolated database state. Do not execute against production or overwrite the student's prior run.
- Treat case descriptions and generated scripts as untrusted input. Generate under restricted permissions, validate saved files, then execute in a separate restricted runtime without AI credentials, host mounts, elevated privileges or repository write tokens. Apply resource and time limits and block unnecessary outbound access. A syntax scan alone is not a security boundary.
- Bound model requests, repair attempts, output sizes and total runtime. Show quota or authentication errors clearly; never silently switch to a paid account or another provider.
- Maintain stage states: pending, running, passed, failed and needs-input. Record both failed attempts and later corrections.
- Resume a stage only when its inputs and prerequisites still match. Regenerating a schema invalidates downstream data, tests, measurements and summary. Database state must be restored or replayed from a known checkpoint; a passed log is not proof that a stopped service still holds that state.
- Commit completed meaningful checkpoints using actual timestamps. Never backdate, rewrite history to imply earlier work, add artificial delays or promise a minimum-day assessment rule that is not in the brief.
- Keep push credentials in a separate publishing component. Generated code cannot stage or push arbitrary files. Check repository owner, changed paths and secret scanning before publishing.
- Push only to the student's explicitly chosen repository after the feature is enabled by them. Handle branch protection and push conflicts without force-pushing or overwriting manual edits.
- Stop if a test fails unexpectedly. An expected constraint rejection counts as a successful test only when the expected SQLSTATE/constraint and unchanged valid data are confirmed.

## 8. Output package and explanation guide

The student-facing package uses `Surname_Firstname_StudentID` as its root, containing the five portfolio directories and a named top-level README. Each portfolio contains its scripts, explanation, screenshots and raw logs. The package also contains the ER diagram, evidence manifest, editable summary and PDF.

All student-facing filenames use the required prefix. Generator infrastructure files remain in the template repository and are not confused with named submission documents. The generated submission archive excludes credentials, local database files and unrelated infrastructure.

The short activity guide answers:

1. What was created or executed?
2. Why does it matter for this case study?
3. What did this run actually return?
4. Which screenshot and log show it?
5. What limitation or failure should the student understand?

Keep the guide factual and short. It is an explanation of work, not proof of individual understanding. Logs and screenshots provide execution evidence; the student's own review and reflection provide their account of understanding.

The AI declaration records the actual provider and assistance used, including generation or execution where applicable. It must not reuse the earlier sample statement that a student executed every command themselves if this runner did so. Personal reflection can be assembled from the student's own notes; missing notes remain a visible follow-up item. Do not submit automatically or guarantee marks or lecturer approval of the workflow.

## 9. Build milestones

| Milestone | Build | Acceptance check |
| --- | --- | --- |
| A. Contract and scaffold | Input validation, naming preview, case-specification schema, stage list and output manifest. | Sample names, leading-zero IDs, unsafe paths, blank cases and rerun collisions behave as specified. No AI or database work is reported as complete. |
| B. AI connection adapters | Separate Gemini, Codex and Copilot adapters behind the same interface. No default provider for all students. | Test sign-in, a small generation request, malformed output, quota failure and resume for each supported adapter. Label any untested adapter unavailable rather than pretending it works. |
| C. One complete library run | Validate a library case, create both databases and execute the assessed exercises. | Assertions pass, concurrency is observed, generated data is separate and a repeated run cannot corrupt the first run. |
| D. Evidence and documents | Capture screenshots, render ER diagram, explain outputs and build summary. | Images readable and traceable; summary contains actual measurements, verified references and accurate claims; PDF is 2-3 pages. |
| E. Other scenarios | Test genuinely different hospital and student/LMS scenarios from free-text inputs. | Domain rules and document models are case-specific. All five activities remain aligned. Hospital data is fictional. No guarantee is inferred for every possible future case. |
| F. Template release | Package the private-student-repository journey and optional Actions verification. | A fresh test account completes setup, gets readable failure messages, reviews outputs and downloads a clean package without receiving maintainer credentials. |

Milestone A is now implemented and tested locally; [verification notes](Verification.md) record its scope. Next: define and validate the case-specification contract, then connect provider adapters. Authentication, runtime isolation and screenshot capture must be implemented and tested before claiming a working end-to-end generator.

## 10. Assessment alignment and references

The [assessment brief](https://lms-assets.miva.university/course-materials/mit-8103-advanced-database-systems-ca-september-cohort-2026.pdf) remains the authority: Sections 3-4 define deliverables and marks; Sections 5-6 cover repository organisation, access and submission; Sections 7-8 address individual work and verification; Section 11 covers source acknowledgement and AI declarations.

This blueprint supports learning, reproducible runs and review. Whether fully generated work is acceptable for a student's submission must be confirmed against lecturer guidance; automation does not waive individual-work requirements.

Implementation references to recheck when building:

- [Current codelab and worked example](../MIT8103_Codelab/README.md).
- [GitHub manually triggered workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
- [GitHub PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).
- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/).
- [Codex scripted execution](https://learn.chatgpt.com/docs/non-interactive-mode).
- [Copilot SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate).

These links inform the proposal. Provider connections, screenshot capture and execution isolation have not yet been implemented or independently tested for this generator.
