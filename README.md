# MIT 8103 Portfolio Generator

## Start in your own GitHub repository

1. [Use this template](https://github.com/arizonal2014/MIT8103_Portfolio_Generator/generate) to create your own **private** repository named `Surname_Firstname_StudentID`.
2. Open your new repository. Choose **Code → Codespaces → Create codespace on main**. Setup and app startup are automatic.
3. Open port **4310** if the app does not open automatically. Enter your details and case study, select **Copilot**, then generate and review the results.

See [the short student guide](STUDENT_START.md). The template author’s account and generated student files are not included. Each student uses their own Codespace and GitHub/Copilot account.

A personalised database portfolio generator for GitHub Codespaces or a local computer. Enter your own case study: the hospital-only restriction has been removed. The current flow generates and validates the case model, explicit rules, sample data and rejection tests, then runs PostgreSQL and builds the ER diagram, normalisation and named Portfolio 1 files. Portfolio 2 then runs case-derived queries and a measured index experiment. Portfolio 3 demonstrates commit, rollback and actual concurrent updates on the saved case. Portfolio 4 builds and runs MongoDB documents and queries from the same case. Portfolio 5 is still pending.

The existing [19-step codelab](https://github.com/arizonal2014/MIT8103_Codelab) remains unchanged. This project maps that guide into an automated workflow running in each student's own workspace.

Read the [generator blueprint](Generator_Blueprint.md), including the 19-step map, screenshot plan and first implementation milestone.

See the [scaffold verification notes](Verification.md) for the automated and local browser checks and their limits.

## Run locally

Requires Node.js 22+, GitHub CLI signed in to the chosen Copilot account, Docker and the database images prepared by setup (`postgres:17-alpine` and `mongo:7.0`). Replace `YOUR_GITHUB_LOGIN` below with that account's login.

```bash
npm run setup:workspace
npm test
MIT8103_PILOT_ACCOUNT=YOUR_GITHUB_LOGIN npm start
```

Open the printed local URL, normally http://127.0.0.1:4310. Enter dummy details and your chosen case study, select **Copilot**, then click **Generate and test my database**. Live generation requires the configured GitHub account as described below. The separate **Create workspace scaffold** button creates folders only.

Live runs save under `runs/case-run-<unique-id>/<workspace-id>/Surname_Firstname_StudentID/`. The ID prevents overwrites. Portfolio 1 receives the generated files and actual logs. Steps 3–10 are completed after their checks pass; individual review and later portfolios remain pending. The separate scaffold-only button creates folders and a wholly pending plan without contacting AI or PostgreSQL.

Generated details stay under ignored `runs/` until you choose **`npm run save`** after review. That command copies the named portfolio output, commits a real checkpoint and pushes it to your own repository. The model diagnostics stay excluded. Live generation contacts Copilot and creates/removes an isolated PostgreSQL container. No assessment is submitted automatically. Codespaces uses a private forwarded port; local desktop runs bind to loopback.

Browser errors appear beside the relevant fields. An unresponsive page may mean the local server stopped. A write error may mean insufficient disk space or workspace permissions; any partial run is retained for inspection, and retries create a new run.

## Shared case specification

Open **Developer check: shared case specification** below the form. Load the library or hospital test model and click **Check design structure**. These are hand-written examples, not AI outputs. They exercise the same contract that future provider adapters will use. Students will not need to write JSON manually.

See [Case specification contract](Case_Specification.md) for the model fields, validation limits and integration points. This check does not mark any of the 19 execution stages complete.

## AI tool readiness

Select a tool and click **Check selected tool locally**. This only looks for its executable on the local server's PATH. It never runs that executable, reads login caches, signs in or contacts a model. Installed does not mean authenticated or within quota.

**Preview unsent AI request** builds the case-study prompt locally using the shared contract. The separately entered name and ID are not included. This preview is never submitted. Changing the tool or case study clears stale preview results.

The [connection notes](Provider_Connections.md) describe Copilot and its saved responses. Enable live generation with `MIT8103_PILOT_ACCOUNT=YOUR_GITHUB_LOGIN npm start`, then follow [the current free-case guide](Free_Case_Workflow.md). The server verifies that signed-in account. Without this setting, generation stays disabled. Gemini and Codex live adapters remain untested.

The current suite passes 109 tests locally; the earlier Portfolio 3 Codespaces milestone passed all 99 tests then available. A freely typed college-library case passed the live browser flow, including four tables, eight seed records and thirteen exact constraint-rejection checks. A separate student-enrolment fixture passed real PostgreSQL tests and produced a composite-key 2NF split. See [verification](Verification.md). The [hospital milestone](Design_Artifacts.md) is historical; current code no longer uses its fixed model or layout. The GitHub template, Codespaces startup and reviewed-output save/push have been browser-tested using a separate account. An equipment-rental case created three tables and passed twenty constraint-rejection checks there. Portfolio 2 is connected; see [the short query guide](Portfolio_2.md). Portfolio 3 is connected; see [the transaction guide](Portfolio_3.md). Portfolio 4 is connected; see [the MongoDB guide](Portfolio_4.md). Portfolio 5, automatic screenshots and the final summary remain unfinished.
