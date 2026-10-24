# Browser hospital workflow

Historical milestone. The active app now uses the [free-case workflow](Free_Case_Workflow.md); the hospital-only gate described below has been removed.

The local form orchestrates the reviewed hospital pilot: Copilot generation, structural validation, isolated PostgreSQL execution, an ER diagram, worked normalisation and named output files. This is one constrained case, not the complete 19-step generator. Free-text case studies remain the required final behaviour.

## Start locally

```bash
MIT8103_PILOT_ACCOUNT=YOUR_GITHUB_LOGIN npm start
```

Use the GitHub account already signed in through `gh`. The server checks its identity before generation. The pilot is disabled when this setting is absent; the browser cannot choose another account. Copilot allowance and the existing local Docker/PostgreSQL image are required, as described in the connection and execution guides. No credentials are entered in the form.

1. Open the printed loopback URL.
2. Enter first name, surname and a test student ID.
3. Click **Use hospital pilot case**. This fills the supported scenario and selects Copilot.
4. Click **Generate and test hospital database**. This explicitly starts a live request and temporary database run.
5. Follow the four progress rows, then open the SQL, logs, catalog, ER diagram, normalisation walkthrough or readable evidence view.

The run uses a constrained hospital template, retaining its names and exercise references. Copilot generates a complete response; it is not a different arbitrary case silently mapped onto hospital tables. Other case-study text and providers are rejected by this live route. General case support still needs explicit rule generation and validation.

## Behaviour

- One model request, plus at most one correction request containing the actual validation errors. No account/provider fallback or unbounded retries.
- Invalid responses stop before database execution. Failures remain visible and diagnostic files stay on disk.
- One active run per local server. Repeated requests with the same request ID return the existing job.
- Editing controls are disabled while the run is active. The browser polls job status and can reconnect after a page reload using its session job ID.
- Restarting the server loses its in-memory job index. Files remain, but automatic job recovery/resumption is not implemented. Do not restart during a run.
- An isolated container is created and removed for each database test; student databases are not modified.
- Outputs are copied under `Surname_Firstname_StudentID`, with prefixed filenames in Portfolio 1 and its logs folder. Diagnostics stay outside that submission-style folder.
- Steps 3, 6, 7, 8, 9 and 10 are marked complete only after actual work; case description/design remain drafts, and the remaining stages stay pending. A passed pilot is not a finished portfolio.
- Existing screenshots remain pending. Browser verification screenshots are captured separately during development; the runner does not yet capture them automatically.

The local artifact route serves only files registered for that run. It accepts no arbitrary filesystem path. Writes require same-origin JSON requests, and the server binds only to loopback. No repository, account or assessment submission is created or changed.

## Scope

No GitHub/Codespaces integration, arbitrary-case adapters, MongoDB exercises, performance comparisons, concurrent-session demonstrations or final summary are connected yet. Gemini/Codex remain selectable for preparation only. The ER diagram and normalisation currently support the reviewed hospital pilot; see [design-stage limits](Design_Artifacts.md).

The hospital template in `examples/pilot-hospital.json` comes from the earlier validated Copilot response, retained as a fixed pilot contract. The explicit PostgreSQL review still defines executable constraints and adds the recorded slot chronology amendment.
