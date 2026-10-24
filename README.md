# MIT 8103 Portfolio Generator

A practical database portfolio from your name, student ID and case study.

[Open the generator in Codespaces](https://codespaces.new/arizonal2014/MIT8103_Portfolio_Generator)

Wait for setup, then open **Ports → 4310 → Open in Browser**. Keep the port **Private**. Connect your own GitHub account when prompted; repository creation needs access beyond the Codespace's default token.

## Three steps

1. **Details:** enter your first name, surname, student ID and case study. Select **Create portfolio**.
2. **Build:** follow the pipeline. Expand a stage to read its log or open its commit. Failed stages show **Retry remaining stages**.
3. **Repository:** select **Open my portfolio**. Your private repository is named `Surname_Firstname_StudentID`, with the five portfolio folders at its root. Edit the final summary there.

Completed stages are committed and pushed automatically with their actual timestamps. The repository contains the assessment files; the generator code stays in its workspace. Existing unrelated repositories and edits made on GitHub are not overwritten.

## Output

| Component | Files and evidence |
| --- | --- |
| Portfolio 1 · 7 marks | Case study, relational schema, keys, constraints, ER diagram, worked 1NF–3NF tables and database tests |
| Portfolio 2 · 7 marks | SQL queries, actual results, execution plans and measured index comparison |
| Portfolio 3 · 7 marks | Commit, rollback, isolation and two-session concurrency evidence |
| Portfolio 4 · 7 marks | MongoDB model, inserts, queries, aggregation and validation checks |
| Portfolio 5 · 6 marks | Proposed architecture and distributed database discussion |
| Final documentation · 6 marks | Editable summary, three-page PDF, references, AI declaration and space for individual reflection |

Documents and diagrams use black text on white. Seven screenshots render saved execution reports, backed by logs and result files. Portfolio 5 uses the assessment's discussion option; it does not claim a live distributed deployment.

Generation finishes without a reflection form. Complete your individual reflection and review the work in the editable summary. The generated PDF is a snapshot: update your submission PDF after editing. Submit through the university's assessment form yourself.

**AI provider:** Copilot, using your account and allowance. Names and student IDs are kept out of model prompts. Case studies are freely entered; designs must pass the supported schema, rule and execution checks. Unsupported or failing designs stop visibly. Gemini and Codex are not connected yet.

## Run locally

Install Node.js 22+, Docker and GitHub CLI, then run:

```bash
npm run setup:workspace
npm run workspace
```

Open `http://127.0.0.1:4310/`. Connect your own GitHub account with Copilot access. The same three-step process creates the separate private assessment repository.

The app uses temporary PostgreSQL and MongoDB containers. No Atlas account is required. Codespaces compute, storage and Copilot usage depend on your account. Stop the Codespace when finished.

[Student guide](STUDENT_START.md) · [Manual codelab](https://github.com/arizonal2014/MIT8103_Codelab) · [Verification record](Verification.md)
