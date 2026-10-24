# Portfolio 3: Transactions and concurrency

The assessment assigns 7 marks to practical transaction and concurrency work: commit, rollback, isolation and a concurrency problem or control mechanism. This feature covers codelab steps 14 and 15.

1. Finish Portfolio 2, then click **Run Portfolio 3** in the app.
2. Open **View Portfolio 3 commit and rollback**, then **View Portfolio 3 concurrency comparison**.
3. Review the SQL, values and explanation. Run `npm run save` in the Codespace terminal to commit and push your reviewed output.

No extra AI request is needed. Files use your name and ID under `portfolio-3-transactions-concurrency/`.

The exercise selects a saved row from your case's transaction table. A temporary processing counter makes the changes easy to see. It is a demonstration field added only to the isolated database; the original business columns and the Portfolio 1 design stay unchanged. The exercise demonstrates transaction behaviour rather than implementing every operation described in the case study.

| Test | What the actual output shows |
| --- | --- |
| COMMIT | The counter changes from 0 to 1. Another connection sees 1 after commit. |
| Isolation | The other session sees the committed value while an update is still uncommitted. |
| Failed transaction and ROLLBACK | A change reaches 11 inside a transaction. A deliberate CHECK failure aborts the transaction; explicit rollback restores 1. |
| Lost update | Two sessions read 1, each calculates 2 and writes it. The final value is 2; one increment is lost. |
| Row locking | After resetting to 1, Session B waits for A's `FOR UPDATE` lock. B then reads A's committed 2 and writes 3. Both increments remain. |

Both sessions use **READ COMMITTED**. The report captures their actual PostgreSQL backend IDs and the blocking observation. The original model may propose another method, such as a unique constraint; the report names the actual row-lock method used here. Existing constraints remain in force. An atomic increment is another solution for this simple counter; other business operations need their own concurrency design.

`CommitRollback.sql` reproduces the first exercise after running the Portfolio 1 schema, seed and Portfolio 3 setup in a fresh database. `Concurrency.sql` is a numbered two-session script. Follow its blocks in two psql terminals connected to that same database. Session A and B logs preserve the actual automated run.

Use only two screenshots: the commit/rollback results and the combined concurrency comparison. After saving the portfolio, open your named folder in the Codespace Explorer, then `portfolio-3-transactions-concurrency/screenshots`. Right-click **screenshots → Upload** and choose your images. Name them `Surname_Firstname_StudentID_P3_CommitRollback.png` and `Surname_Firstname_StudentID_P3_ConcurrencyComparison.png`, replacing the name and ID. Keep `.jpg` if that is the original format. Commit and push the images through Source Control.

Automatic screenshots remain pending; HTML, JSON, SQL and session logs are saved automatically. Failures remain visible and do not complete the two stages. The temporary database is removed after the run.
