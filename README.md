# MIT 8103 Portfolio Generator

Enter your details and your own case study. The generator builds a practical portfolio, runs its database exercises and organises the results.

## Start

1. [Create your own private repository from this template](https://github.com/arizonal2014/MIT8103_Portfolio_Generator/generate). Name it `Surname_Firstname_StudentID`.
2. Choose **Code → Codespaces → Create codespace on main**. Wait for setup, then open the app on **Ports → 4310 → Open in Browser**. Keep the port **Private**.
3. Enter your name, student ID and case study. Choose **Generate my portfolio**. Your own GitHub account and Copilot allowance are used.
4. Read the results and draft summary. Add your own reflection, confirm your review and choose **Save reflection and final package**.
5. Download the ZIP and three-page PDF. Check your repository, naming and assessment submission instructions before submitting yourself.

The checked **Save real checkpoints** option commits and pushes completed stages to your own private repository, with actual timestamps. If a step fails, its error is shown and earlier results remain. Use **Continue remaining steps** to resume. Do not backdate or invent development history.

## What it produces

| Assessment component | Output |
| --- | --- |
| Portfolio 1 · 7 marks | Case description, keys, constraints, executed schema, ER diagram, worked 1NF–3NF tables and tests |
| Portfolio 2 · 7 marks | Three SQL queries, results, six measured plans and an index comparison |
| Portfolio 3 · 7 marks | Commit, rollback and two actual sessions demonstrating a lost update and row locking |
| Portfolio 4 · 7 marks | MongoDB documents, inserts, filters, aggregation and validation checks |
| Portfolio 5 · 6 marks | Case-specific proposed distributed architecture and discussion, using the brief's discussion option |
| Final documentation · 6 marks | Three-page PDF with ER diagram, actual results, repository link, reflection, references and AI declaration |

Seven screenshots are rendered automatically from saved report pages. Their source and image hashes are recorded. Portfolio 5 shows a **proposal**, not a live replication experiment. SQL, JavaScript, raw output and a short explanation accompany the images.

Case studies are freely entered, rather than selected from a hospital-only template. Generated designs must satisfy the supported relational model and executable rule checks; unsupported or failing designs stop visibly. Structural checks do not replace your review of domain decisions or normalisation assumptions.

**Connected AI option:** Copilot. Gemini and Codex are future adapters; they are not live options yet. Generation can use up to four AI requests, including corrections. The separately entered name and student ID are omitted from the prompts. Quotas, Codespaces compute and storage depend on your account.

## Run locally

Use Node.js 22+, Docker and GitHub CLI. Sign in to your own GitHub account with Copilot access, then run:

```bash
npm run setup:workspace
npm run workspace
```

Open `http://127.0.0.1:4310`. Local generation also works; saving checkpoints requires your own private repository. `npm run save` exports and pushes the latest completed work if you prefer to save manually. No assessment form is submitted by this app.

The app uses temporary PostgreSQL and MongoDB containers. No Atlas or cloud database account is required. Stop your Codespace when finished. Your output remains in your repository after successful saves.

[Student guide](STUDENT_START.md) · [Manual 19-step codelab](https://github.com/arizonal2014/MIT8103_Codelab) · [Verification record](Verification.md)
