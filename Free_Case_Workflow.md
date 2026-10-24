> Earlier implementation notes. For the current three-step flow, follow [Start your portfolio](STUDENT_START.md).

# Run your own case study

The generator accepts a free-text case study. It no longer requires the hospital scenario or copies its fixed model. The optional library-example button is only a starting suggestion.

## Student flow

1. Follow [Start your portfolio](STUDENT_START.md) to open your own Codespace, or open **http://127.0.0.1:4310/** while running locally. Enter first name, surname, student ID and the chosen system/operations.
2. Select **Copilot**, then click **Generate my portfolio**.
3. Follow progress and open the generated case description, design, ER diagram, normalisation and real database results. Additional SQL and logs are under **SQL, logs and other files**.

The server runs inside your Codespace or on your own computer. The checked Save real checkpoints option commits and pushes completed stages to your own private repository. Use `npm run save` if you prefer to save manually. The guided run also builds Portfolio 5, captures seven report screenshots and prepares the three-page summary. Add your own reflection and confirm your final review. No assessment is submitted automatically.

## Start locally

```bash
npm run setup:workspace
npm run workspace
```

Use Node.js 22+, Docker and GitHub CLI signed in to your own account with Copilot access. Setup installs the PostgreSQL/MongoDB images and isolated report renderer. The browser does not collect credentials.

## What happens

1. Copilot generates a small case model from the typed description. There is no fixed hospital template. Model structure, keys and references are validated. One correction is allowed for invalid model content.
2. Copilot generates a separate execution package: explicit rule expressions, valid records, record-rejection tests and the normalisation-example root. It receives the case model, not the student's name or ID. One correction is allowed using actual validation/database errors. Total model calls are bounded at four.
3. The deterministic renderer generates SQL from checked data. Raw SQL and shell commands are not accepted from the model. The isolated runner creates the schema, inserts valid records, captures catalog/data snapshots, and verifies every expected rejection by SQLSTATE and the actual constraint or column name. It also confirms the rejection tests left the valid data unchanged.
4. The diagram uses that same model. The worked normalisation uses captured records, declared candidate keys and links. Partial dependencies on composite candidate keys produce separate 2NF example tables. Otherwise 2NF can remain unchanged. The 3NF argument is stated under the declared dependencies, with individual case review still needed. The sample decomposition must reconstruct the same wide rows and values.
5. Files are saved under `Surname_Firstname_StudentID` with the required prefix. The guided run continues through SQL queries and indexing, transactions and concurrent sessions, then MongoDB documents and queries. Portfolio 5 uses the discussion option. Seven screenshots render the saved report pages, and a three-page summary includes the ER diagram and recorded results. Add your reflection and final review to complete steps 11 and 19. Repository verification is required for the full submission-ready checklist.

Model attempts and failed executions are retained. Authentication, provider, validation and database failures do not become completed assessment stages. There is no fallback to another case study or provider.

## Supported prototype scope

The input is free text, while the generated exercise is intentionally small. The profile asks for 2–6 entities, globally unique single-column IDs, scalar attributes, an acyclic cross-table dependency graph and executable row constraints. The underlying contract permits up to eight entities. Unsupported workflows, dependency cycles, complex repeated-role normalisation roots or unknown rule operations stop with an error. Entering any case description does not guarantee unattended success for every possible design.

The normalisation example can cover one suitable relationship branch; the final table view still includes all model entities and captured records. Its sample check is not a proof that the AI has identified every domain dependency. Portfolio 1 remains subject to review.

## Isolation and provenance

The model has no tools, project-write access or database credentials. Its GitHub OAuth token stays in memory. Docker receives no AI or GitHub credential. Each temporary database has no published ports, network or host mounts and uses a non-superuser owner for generated SQL. Only the owned container and anonymous volumes are removed afterwards. Docker itself is a privileged host capability.

The run saves the original model, execution package, schema, seed SQL, negative-test SQL, logs, catalog, evidence, diagram, normalisation and progress manifest. New database reports also include execution-package/schema digests. Seven screenshots are captured from the saved reports, with source/image hashes in the manifest. GitHub checkpoints are saved when the selected Save real checkpoints option is enabled, or through npm run save. All timestamps reflect actual work.

The server restores completed case runs and their known file links after restart. It checks that restored files remain inside the saved run output directory. A previously running job is marked interrupted; it is never silently rerun. A run ID prevents repeat clicks from duplicating a known run, and only one run can execute at a time.

See [Portfolio 2](Portfolio_2.md) for the query experiment, evidence and current limits.

See [Portfolio 3](Portfolio_3.md) for the temporary helper field, actual session output and row-lock comparison.

See [Portfolio 4](Portfolio_4.md) for the MongoDB model, Extended JSON, queries and Atlas/manual replay option.

See [Portfolio 5 and final exports](Portfolio_5_and_Final.md) for the discussion, review and download flow.
