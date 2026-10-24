# Generator verification

Current scope: free-text case generation through Copilot, restricted execution packages, actual PostgreSQL schema/data/rejection checks, case-derived ER diagrams and worked normalisation, connected in the local browser app. The hospital-only gate and fixed production model/layout have been removed. GitHub template creation, Codespaces startup and reviewed-output commit/push have also been verified using a separate browser account. Portfolio 2 queries and indexing are now connected. Portfolios 3–5 and automatic screenshots are unfinished. No assessment was submitted.

## Automated checks

Initial scaffold: six tests passed, zero failed. The tests cover names and leading-zero IDs, invalid input and unsafe paths, Unicode names and filename size, 19 pending stages, named folders and screenshot plans, repeated-run isolation, local HTTP serving, validation errors and rejection of cross-origin writes.

Current suite: `npm test` passes 92 tests with zero failures. Checks cover models, provider isolation, restricted SQL bindings, execution packages, valid-seed preflight, exact rejection targets, numeric constraints, workflow guards, named artifacts and restored file links. Design tests cover differing entity counts, case-derived relationships, unchanged 2NF, a composite-key 2NF split, redundant superkeys, reconstruction, fingerprints, missing data and escaped values. Unit tests use fixtures/mocks and do not contact models or databases; real runs are recorded separately below.

`node --check server.mjs` and `node --check public/app.mjs` completed successfully.

## Browser check

Opened the local form in Chrome and entered fictional details: Alex Nwosu, ID `000123`, a hospital appointment scenario and Codex as the selected but unconnected tool. The prefix preview was `Nwosu_Alex_000123`.

Submitting the form created eight named files: five portfolio READMEs, the top-level README, the evidence plan and the run manifest. The form displayed the resulting local folder and all 13 pending screenshot/log pairs. All 19 execution stages remained pending. The six automated tests also checked that screenshots and logs directories are empty.

![Local scaffold result with fictional student details](verification/Scaffold_Preview.jpg)

This image documents the scaffold interface. It is not database execution evidence.

The structural-check browser path also accepted the hand-written hospital model (four entities, three relationships). Changing its transaction entity to `not_in_model` produced two visible errors: an unknown entity and a mismatch with its concurrency rule. This was a proposed-model check, not a live database run.

![Passing structural check for the hospital test model](verification/Case_Specification_Check.jpg)

The provider browser check selected Gemini for a fictional hospital scenario. It reported that the local command was found but authentication and quota were not checked. Previewing the request then reported that it was prepared locally and not sent. No executable was launched and no model usage was incurred.

![Local provider preparation with generation disabled](verification/Provider_Preparation.jpg)

## Not verified or built yet

Gemini/Codex authentication and generation; unrestricted-case SQL execution beyond the supported model profile; MongoDB execution; concurrent-session orchestration; automatic screenshot capture; PDF generation; package download; student submission. The form's screenshot feature still creates a plan only. Pilot screenshots were captured separately with browser tooling. Readiness checks and prompt previews must not be confused with connected provider execution.

## Live Copilot attempts

Copilot CLI 1.0.103 was installed locally and used with the explicitly selected GitHub account `arizonal2014`. The fictional case concerns patients, doctors, appointment slots and bookings. No student identity fields were included in the case prompt.

- `copilot-probe-8a83ffe6-713f-4bfa-b499-6a80ea430f48`: the CLI rejected a credit ceiling of 1; its minimum is 30. No response was generated. This early report's `submitted: true` was inaccurate; it records CLI invocation, not a successful submission. Later reports distinguish these states.
- `copilot-probe-853809c9-0311-43f6-a8a3-bc55e4738d13`: the CLI rejected a wildcard tool-denial option before generation.
- `copilot-probe-abb6b440-5d65-408c-8d81-3108c5897a04`: CLI exit 0 and a hospital design returned, but JSON parsing failed on unescaped line breaks. Status `invalid_response`; no downstream execution.
- `copilot-probe-ca6270d4-d29f-49d2-b013-3bba89823b56`: machine-readable output arrived successfully. The first extractor rejected it because the CLI emitted an empty assistant event before its final content. The extractor now ignores empty content events but still rejects multiple non-empty messages or tool requests. Revalidating the saved bytes locally produced valid JSON with four structural errors: one grouped foreign-key rule and three unknown snapshot entity names. `revalidation.json` records the source SHA-256 and confirms no new model request was made during that check. Original `report.json` was preserved.
- `copilot-probe-78a3fe7f-4ee8-4aeb-a136-82db33fbb1e7`: one explicit correction request included the previous specification and actual validation errors. Copilot returned a design that passed the schema and cross-reference checks: four entities (`patient`, `doctor`, `slot`, `booking`) and three relationships. Status `validated`, CLI exit 0, fingerprint `2b8f5da59320f1fb788a093531fabd1e2eb6f890b7fe68e7f4cb6e6365b9ca71`. No tools were requested and no database or publication stage ran. This process had loaded an earlier validator warning that incorrectly said no AI request had run; that wording is now scoped to what the validator itself does. The historical report remains unchanged.

Original local reports and responses remain under ignored `runs/`. The revised probe uses machine-readable JSONL and retains both the envelope and extracted case response. Structural validation alone does not prove domain correctness or database execution.

The passing design needed explicit executable bindings before SQL execution. The next milestone below defines and tests those bindings for this hospital pilot. Descriptions are not executed or treated as SQL.

## Real PostgreSQL pilot

Run `postgres-pilot-8a345806-6f8d-46b3-90f4-5ad0afc25427` passed using the locally available official `postgres:17-alpine` image. Its immutable local image ID, source digest and reviewed model fingerprint are in `Report.json`. The review adds a slot chronology rule and explicit booking-status, cancellation and partial-uniqueness expressions, while retaining the original Copilot model separately.

Actual PostgreSQL catalog checks verified four tables, four primary keys, three foreign keys, one declared unique constraint, two CHECK constraints, one partial unique index and all required columns. Ten attempted invalid records were rejected: duplicate primary key, missing required value, missing doctor/patient/slot links, second active booking, invalid status, cancellation without its time, reversed slot times and duplicate doctor start. A valid sequence retained two cancelled bookings and accepted one active booking for that slot.

Saved artifacts are in the ignored run folder: `SourceCaseSpec.json`, `ReviewedCaseSpec.json`, `ExecutionPlan.json`, `Schema.sql`, `ConstraintTests.sql`, `SchemaExecution.log`, `TablesAndConstraints.log`, `ConstraintTests.log`, `Catalog.json`, `Report.json` and `Evidence.html`. The temporary owned container and its anonymous volumes were removed; no host ports or network were enabled. Other databases were not used.

![Browser capture of saved automated PostgreSQL output](runs/postgres-pilot-8a345806-6f8d-46b3-90f4-5ad0afc25427/PostgreSQL_Constraint_Evidence.jpg)

The image is a browser screenshot of the recorded outputs, not a terminal reconstruction. Screenshot capture is not yet part of the automatic runner. The schema run does not complete Portfolio 1, prove arbitrary-case generation, prevent all overlapping slots or demonstrate concurrent sessions. See [execution details and limits](PostgreSQL_Execution.md).

## Connected browser run

Chrome run `024aa192-665b-4bda-b722-f4c1596172cb` completed with fictional details Alex Nwosu and ID `000123`, using Copilot account `arizonal2014`. The case-selector button filled the explicit hospital pilot scenario. The live model response passed on the first attempt, then the reviewed schema and ten record-rejection tests passed in PostgreSQL. The owned temporary container and anonymous volumes were removed.

The visible form showed all three workflow rows complete, four of nineteen assessment steps complete and two draft steps. Known file links opened the actual SQL, logs, catalog, report, manifest and evidence view. The screenshot below records the completed browser state.

![Completed live browser hospital workflow](verification/Browser_Workflow_Result.jpg)

The named output folder is under `runs/web-pilot-024aa192-665b-4bda-b722-f4c1596172cb/e0a35b70-833f-4c1a-aa1b-30242aac6e8b/Nwosu_Alex_000123/`. A screenshot of the database evidence was saved inside its Portfolio 1 `screenshots/` folder and recorded in the manifest/evidence plan as captured by development browser tooling. `ScreenshotCapture.json` records the source URL and image SHA-256. This was not automatic runner capture.

See [the browser workflow guide](Browser_Workflow.md) for account configuration, restart limits and supported scope. The existing codelab was not edited.

## Connected design stages

Browser run `64796a5b-18da-4bb6-836c-eedd76b9419e` completed with fictional Alex Nwosu, ID `000123`, and Copilot account `arizonal2014`. Its first AI response passed, PostgreSQL passed, and the new design-document stage generated six additional named artifacts: ER HTML/SVG/Mermaid and normalisation HTML/Markdown/JSON.

The diagram and normalisation record share reviewed-model fingerprint `a8f37cc781e32a571106283b9f33805b684456c9b9f61c73814ccec67bc11d73`. PostgreSQL now captures complete pilot rows in `Catalog.json.data`. The normalisation check reconstructed all three booking-history rows without changing their values. The browser showed all four workflow rows complete and six of nineteen assessment steps complete; the case/design drafts and Portfolio 1 review were not marked complete.

The ER link rendered all four entities and three relationships. The normalisation link displayed the repeating-group example, 1NF table, expandable unchanged 2NF table and four 3NF tables. The 2NF control was expanded in the browser and checked. SVG/source and Markdown/JSON files are also available through known artifact links.

![Generated ER diagram in the browser](verification/ER_Diagram_Result.jpg)

![Worked normalisation tables in the browser](verification/Normalisation_Result.jpg)

`verification/Normalisation_Reconstruction.jpg` records the final joined-row check. Copies of these development captures are in the run's prefixed Portfolio 1 `screenshots/` folder. `DesignScreenshots.json` records that they were captured by browser tooling; automatic screenshot generation is not implemented.

The run output is under `runs/web-pilot-64796a5b-18da-4bb6-836c-eedd76b9419e/1fc4be50-c715-4971-aa97-a26af322c1e0/Nwosu_Alex_000123/`. The temporary database was removed. The local app is intentionally left running for the user's own test. The published codelab remains unchanged. See [design-stage limits](Design_Artifacts.md).

## Free-text case workflow

The active app now uses `case-workflow.mjs`, `execution-package.mjs`, `postgres-case.mjs` and `case-design.mjs`. Legacy hospital modules remain for regression/history only. The input is free text, with bounded supported model/rule shapes; successful completion is not claimed for all possible descriptions.

### Independent real database checks

- Library fixture run `postgres-case-90b89941-83fc-4371-a783-1aa013bc8ee4`: passed with four tables, three foreign keys, three unique constraints, one CHECK, one partial unique index, five valid rows and thirteen exact-target record rejections. No model call was made for this hand-authored integration fixture.
- Student-enrolment fixture run `postgres-case-00f6623c-4bb1-40d6-8965-d340f34c07ae`: passed with three tables, two foreign keys, one unique constraint, one numeric CHECK, six valid rows and eight exact-target rejections. Its captured records produced two partial-dependency explanations and three 2NF tables. `NormalisationCheck.json` records the sample reconstruction. No model call was made for this hand-authored fixture.

Both used isolated official PostgreSQL containers; the owned containers and anonymous volumes were removed. Catalog snapshots and rejection logs are retained in their ignored run folders. Each negative test checks PostgreSQL's SQLSTATE plus its actual constraint or NOT NULL column name; another failure cannot masquerade as the expected rejection. The runner also verifies that negative tests did not change the valid data.

### Live browser generation with a typed case

Run `0d6f9a71-3e35-407c-b861-8db64170d9d6` used fictional Jamie Cole, ID `000456`, and account `arizonal2014`. A college-library scenario was typed manually; the example button was not used and no hospital/library model template was supplied. Copilot generated the four-entity model `members`, `books`, `copies`, `loans`.

The first model exceeded the NoSQL variable-field count. Its one correction passed. A separate execution-package request passed preflight on its first attempt. Total AI requests: three. PostgreSQL then verified four tables, eight seed rows and thirteen exact constraint-target rejections. The diagram and normalisation were built from the same model and captured records. The model fingerprint is `fe4ec02d5b0e6a5132fc90936f60f4326ecd14bc88bf093b6f7e0ea7f856ccf6`.

The browser showed all five workflow rows complete and eight of nineteen assessment steps complete. The output path is `runs/case-run-0d6f9a71-3e35-407c-b861-8db64170d9d6/2ef5d5e0-d8ab-48fe-acb7-60844730dc56/Cole_Jamie_000456/`. The five primary output links are visible; additional SQL/logs are collapsed to reduce clutter. There are 22 known artifact links.

![Completed typed-case browser run](verification/Free_Case_Browser_Result.jpg)

The generated ER page was inspected. An observed line-overlap issue was corrected by routing edges outside table boxes and separating endpoint labels. Only derived diagram files were regenerated; the saved database evidence was unchanged. `DiagramLayoutRevision.json` records that correction.

The generated normalisation page uses the `copies → books` relationship branch for its wide example and lists all four final tables. Both wide rows reconstructed identically. Its required single-column candidate keys leave 2NF unchanged; the separate student-enrolment fixture verifies the composite-key split. The page now identifies minimal declared candidate keys rather than treating redundant superkeys as candidates. Whole-domain dependencies still require individual review.

![Case-derived library ER diagram](verification/Free_Case_ER_Result.jpg)

![Case-derived normalisation tables](verification/Free_Case_Normalisation_Result.jpg)

Completed case runs and their known file links were restored after restarting the server. The ER route and completed status were reloaded in Chrome without any new model/database request. Rehydration restricts file paths to the saved run output; interrupted jobs are not rerun automatically.

Development screenshots were saved both in `verification/` and the prefixed Portfolio 1 `screenshots/` folder. `DevelopmentScreenshots.json` records their hashes and that capture was performed by browser tooling, not automatically by the runner. The live server remains on loopback for user testing. This is the complete current Portfolio 1 generation path, not all nineteen steps or a completed assessment submission.

The existing codelab remained at revision `619af2bb8394ad020fc29223acaedf80f3423a61` with a clean working tree after the blueprint work. At that earlier checkpoint the generator was local and unpublished; the later Codespaces milestone below records publication and testing.


## GitHub template and real Codespaces verification — 24 October 2026

The [public generator repository](https://github.com/arizonal2014/MIT8103_Portfolio_Generator) is enabled as a template. The signed-in Chrome account, `harrson2026`, created a separate private copy, [Cole_Jamie_000456](https://github.com/harrson2026/Cole_Jamie_000456), through **Use this template**. All student details in this test are fictional.

Codespace `silver-cod-vpw6jppwqxjvhpjwx` installed dependencies, prepared PostgreSQL and started the app on port 4310 automatically. Node v22.17.0 and Docker 29.9.2-2 were observed. The forwarded app retained private visibility. Copilot used that Codespace account's own GitHub authentication; no local credentials were transferred. All 87 automated tests passed inside the Codespace as well as locally.

A freely typed equipment-rental case completed job `7431420a-bef7-4792-bbd4-24c8d016c37d`. The generated database had three tables, and twenty invalid-record checks were correctly rejected. Evidence reported cleanup of the owned container and anonymous volumes. The generated ER diagram, normalisation, schema, tests and logs were available through the app. This verifies Portfolio 1 execution; later portfolios remained pending.

![Completed equipment-rental generation in the student Codespace](verification/Codespaces_Generator_Result.jpg)

After review, `npm run save` copied only the named output folder, committed the actual checkpoint and pushed it to the private copy. The [saved Portfolio 1 folder](https://github.com/harrson2026/Cole_Jamie_000456/tree/main/Cole_Jamie_000456/portfolio-1-database-design) was verified in Chrome at commit `cf3128e613409d2fe368bc55f1403f3d651b0546`. Ignored run diagnostics and workspace server state were excluded. No historical timestamps were invented.

![Save command and successful push in Codespaces](verification/Codespaces_Save_Result.jpg)

![Saved named files in the private student repository](verification/GitHub_Saved_Portfolio.jpg)

The test copy was created while the save command was still being developed. Its save-command files were fetched from the published template, reviewed and committed before the final test. Fresh template copies already contain these files and need no manual fetch.

Automatic screenshot capture is still pending: the three images above were captured separately through browser tooling. They document this verification run and are not presented as student-captured evidence.


## Portfolio 2 — query processing and optimisation

The app now offers **Run Portfolio 2** after a successful case-generation run. It reuses that run's validated model and execution package, without additional AI calls. The supported exercise produces a join, filter and grouped count from actual case tables, with result rows and JSON `EXPLAIN (ANALYZE, BUFFERS)` output. A separate performance projection copies the selected field's type, generates a bounded synthetic distribution and compares the same lookup before/after a B-tree index. It does not pretend to scale complete business records or retain their constraints.

All 92 automated tests passed locally and in the existing student Codespace. New checks cover case-derived SQL, multiple field types, plan interpretation when indexing is slower or unused, zero timings, restored Portfolio 2 links, failures preserving Portfolio 1, and stage completion only after passing results.

Real local PostgreSQL runs passed for the library fixture (100,000 performance rows), student enrolment fixture (10,000 rows), and the existing freely typed college-library run (20,000 rows). The library fixture initially used the earlier JSON join presentation; later runs use ordinary named result columns for readability. Additional text and integer lookup runs passed after the startup fix described below.

One additional local run stopped because `pg_isready` briefly accepted the image's temporary initialization server, which then shut down before psql connected. Its failed diagnostics are retained under `runs/postgres-queries-67030707-62ab-4078-a8ab-222989321889/`. The readiness check now waits on TCP 127.0.0.1, which that temporary server does not listen on. Subsequent text and integer runs passed (`postgres-queries-2d756808-a387-453f-8c1c-95888a5370a6` and `postgres-queries-a17a7c3a-9669-4b53-b80b-6e64ecb8094a`). The failed run was not turned into passing evidence.

In Chrome, **Run Portfolio 2** completed the existing equipment-rental case in the private student Codespace, job `7431420a-bef7-4792-bbd4-24c8d016c37d`. Three real queries ran. Its `rentals.returned_at` timestamp field was used for a 20,000-row performance projection. The lookup matched 20 rows; before/after rows were identical. Three execution times before indexing were 1.599, 0.992 and 1.556 ms; after indexing they were 0.239, 0.187 and 0.236 ms. Medians were 1.556 and 0.236 ms. The plan changed from sequential scanning to a bitmap index/heap scan. Middle-run shared block counts changed from 112 hits/0 reads to 25 hits/0 reads. Index size was 172,032 bytes. These are observations from this warm-cache run, not promised results for other machines. PostgreSQL removed its owned temporary container and anonymous volumes.

![Actual equipment-rental queries and results](verification/Cole_Jamie_000456_P2_QueryResults.jpg)

![Actual equipment-rental before-and-after comparison](verification/Cole_Jamie_000456_P2_IndexComparison.jpg)

`npm run save` committed and pushed the [Portfolio 2 folder](https://github.com/harrson2026/Cole_Jamie_000456/tree/main/Cole_Jamie_000456/portfolio-2-query-optimisation) at `18cef73377feddc35e9ca17f4dfba3a15a0a1580`. The two real browser captures were then added under its `screenshots/` folder and committed at `cb5df57e99e13605e8350de6afe85a5d0c0fe358`. The test-copy screenshot records explicitly identify these as separate browser captures during verification. They are not an automatic screenshot feature. Browser file upload required an additional extension permission, so the captured image bytes were placed through the Codespace terminal without changing that permission.

Steps 12 and 13 are complete for these passing runs; Portfolio 1 individual review and Portfolios 3–5 remain pending. Failures show an error and permit an explicit retry. Saved links survive a server restart; a previously running query experiment is marked interrupted and not silently rerun.
