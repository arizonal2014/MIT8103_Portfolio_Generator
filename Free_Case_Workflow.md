# Run your own case study

The local generator accepts a free-text case study. It no longer requires the hospital scenario or copies its fixed model. The optional library-example button is only a starting suggestion.

## Student flow in the current prototype

1. Open **http://127.0.0.1:4310/** while the local server is running. Enter first name, surname, student ID and the chosen system/operations.
2. Select **Copilot**, then click **Generate and test my database**.
3. Follow progress and open the generated case description, design, ER diagram, normalisation and real database results. Additional SQL and logs are under **SQL, logs and other files**.

The server currently runs on the host computer. GitHub repositories, Codespaces, automatic commits, Portfolios 2–5, automatic screenshots and the final summary are not connected yet. Nothing is submitted or published.

## Start locally

```bash
npm ci
MIT8103_PILOT_ACCOUNT=YOUR_GITHUB_LOGIN npm start
```

The retained environment-variable name configures the approved Copilot account; it no longer selects a hospital pilot. The account must already be signed in through GitHub CLI. The server checks its identity. The browser does not collect credentials or choose a different account. Docker and a local official `postgres:17-alpine` image are required for this current execution route.

## What happens

1. Copilot generates a small case model from the typed description. There is no fixed hospital template. Model structure, keys and references are validated. One correction is allowed for invalid model content.
2. Copilot generates a separate execution package: explicit rule expressions, valid records, record-rejection tests and the normalisation-example root. It receives the case model, not the student's name or ID. One correction is allowed using actual validation/database errors. Total model calls are bounded at four.
3. The deterministic renderer generates SQL from checked data. Raw SQL and shell commands are not accepted from the model. The isolated runner creates the schema, inserts valid records, captures catalog/data snapshots, and verifies every expected rejection by SQLSTATE and the actual constraint or column name. It also confirms the rejection tests left the valid data unchanged.
4. The diagram uses that same model. The worked normalisation uses captured records, declared candidate keys and links. Partial dependencies on composite candidate keys produce separate 2NF example tables. Otherwise 2NF can remain unchanged. The 3NF argument is stated under the declared dependencies, with individual case review still needed. The sample decomposition must reconstruct the same wide rows and values.
5. Files are saved under `Surname_Firstname_StudentID` with the required prefix. Steps 3–10 are generated/verified; step 11 is still pending individual review. The remaining portfolio stages stay pending.

Model attempts and failed executions are retained. Authentication, provider, validation and database failures do not become completed assessment stages. There is no fallback to another case study or provider.

## Supported prototype scope

The input is free text, while the generated exercise is intentionally small. The profile asks for 2–6 entities, globally unique single-column IDs, scalar attributes, an acyclic cross-table dependency graph and executable row constraints. The underlying contract permits up to eight entities. Unsupported workflows, dependency cycles, complex repeated-role normalisation roots or unknown rule operations stop with an error. Entering any case description does not guarantee unattended success for every possible design.

The normalisation example can cover one suitable relationship branch; the final table view still includes all model entities and captured records. Its sample check is not a proof that the AI has identified every domain dependency. Portfolio 1 remains subject to review.

## Isolation and provenance

The model has no tools, project-write access or database credentials. Its GitHub OAuth token stays in memory. Docker receives no AI or GitHub credential. Each temporary database has no published ports, network or host mounts and uses a non-superuser owner for generated SQL. Only the owned container and anonymous volumes are removed afterwards. Docker itself is a privileged host capability.

The run saves the original model, execution package, schema, seed SQL, negative-test SQL, logs, catalog, evidence, diagram, normalisation and progress manifest. New database reports also include execution-package/schema digests. Automatic screenshots and GitHub history are later stages, not inferred from these files.

The server restores completed case runs and their known file links after restart. It checks that restored files remain inside the saved run output directory. A previously running job is marked interrupted; it is never silently rerun. A run ID prevents repeat clicks from duplicating a known run, and only one run can execute at a time.
