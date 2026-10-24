# AI connection preparation

Gemini, Codex and Copilot are equal selectable options. There is no automatic default, fallback to another account, installation or paid request.

## Implemented locally

- A fixed registry of the three tool names and their official documentation.
- Read-only executable discovery on absolute PATH directories. Relative directories and directories named like commands are ignored. The commands are not executed.
- Explicit states: installed or missing; authentication and quota not checked; adapter not connected; generation disabled.
- A provider-neutral request preview containing the case-study description and trusted case schema. Separate student identity fields and credential fields are rejected by this preview endpoint.
- Common validation for future provider responses. Structural rejection does not become a successful execution stage.

`GET /api/providers` returns these local readiness checks. `POST /api/provider/prepare` accepts only `provider` and `caseStudy`, and returns a prompt with `submitted: false`. These routes remain read-only/unsent preparation. The retained `/api/pilot/start` route now runs the free-text case workflow; it is enabled only for the server-configured Copilot account. See [current workflow](Free_Case_Workflow.md).

These readiness checks describe the machine hosting the Node server. Copilot generation has also passed a real Codespaces test using that workspace account's own authentication; see [verification](Verification.md). Users must avoid putting real personal or clinical information in the free-text scenario itself.

## Connection requirements

1. Test each supported CLI's version and non-interactive response format in the intended Codespace.
2. Let the student complete the provider's own sign-in; never collect passwords or copy authentication caches into the project.
3. Confirm account eligibility, current quota and any costs. A successful login does not imply unlimited generation.
4. Run the model in a dedicated generation workspace with no Git publishing token, database credentials or unrelated student files. Constrain its tool access; a prompt alone is not a sandbox.
5. Require explicit permission before the first live model request, then apply time/output/request limits and preserve errors.
6. Parse and validate the response against the shared contract. Only a separate restricted execution runner may later execute saved database scripts.

The web readiness layer still makes no model requests. The controlled Copilot JSON runner is used by the explicit live case workflow: first a model, then a separately validated execution package. Each phase permits one correction, with no provider/account fallback. Its verification is recorded below. Gemini and Codex live connections remain untested.

## Controlled Copilot test

The local project pins GitHub Copilot CLI 1.0.103. The explicit test command is:

```bash
npm run test:copilot -- --account YOUR_GITHUB_LOGIN --allow-live
```

Run this only when you intend to use that account's Copilot allowance. The command verifies the current GitHub CLI account before requesting a small fictional hospital design. Its OAuth token stays in memory and is passed through the child environment, never through command arguments or saved files. This CLI credential is not a narrowly scoped database credential; disabling tools is an application restriction, not an operating-system sandbox.

The probe uses a fresh temporary working directory, disables model tools and built-in MCP servers, and applies a two-minute timeout and output-size limit. The installed CLI requires a minimum credit ceiling of 30; that is a ceiling, not a quoted cost. There are no automatic retries, account changes or purchases.

Each attempt gets a separate private folder under `runs/copilot-probe-<uuid>/`. `response.txt` preserves the redacted CLI output; `case-response.txt` preserves the extracted assistant message for newer attempts; `diagnostic.txt` and `report.json` record errors and validation. Failed attempts remain available. No database scripts, screenshots, commits or submission files are produced by this test.

The first two attempts stopped on CLI option errors. The first generation reached Copilot through account `arizonal2014` but returned text containing unescaped line breaks inside JSON strings. Validation rejected it. The probe now requests `--output-format json`, ignores empty assistant content events, extracts one non-empty assistant message and validates its contents without rewriting invalid model JSON. It rejects ambiguous messages and tool requests. A correction attempt can send the previous proposed specification and its actual validation errors back to Copilot, as a separate request with the same limits. There is no automatic retry loop. See [verification](Verification.md) for the latest live result.

## Official references

- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/).
- [Codex authentication](https://learn.chatgpt.com/docs/auth) and [scripted execution](https://learn.chatgpt.com/docs/non-interactive-mode).
- [GitHub Copilot CLI installation and access](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli).

These references were checked for the connection plan. Actual CLI behaviour must still be tested in the student's target workspace.
