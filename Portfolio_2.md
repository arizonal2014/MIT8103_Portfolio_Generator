# Portfolio 2: Queries and optimisation

The assessment assigns 7 marks to SQL queries and results, execution plans, optimisation and a short performance comparison. This feature covers steps 12 and 13 of the codelab.

1. Choose **Generate my portfolio**. The guided run executes Portfolio 2 after its prerequisites.
2. Open the Portfolio 2 report links and inspect the saved scripts and results.
3. Completed stages are saved automatically to your separate private portfolio repository. Open the commit link in the pipeline to inspect the saved work.

Files are placed in `portfolio-2-query-optimisation/` with your name/ID prefix.

The first page shows a join, a filter and a grouped count using the actual Portfolio 1 tables and sample rows. Each query has its actual `EXPLAIN ANALYZE` plan. Generated queries follow the saved entity links; review whether their choices answer useful questions for your case.

The second page compares one lookup before and after a B-tree index. A separate `query_lab` table uses your case's chosen field and data type, plus a lab row ID. It contains 10,000–100,000 synthetic performance rows. These are deliberately simplified test values, not additional valid business records. Your original tables and constraints remain unchanged.

Three measured runs per phase, median execution time, plan nodes, buffer counts, identical result checks and index size are saved. The planner is free to choose a sequential scan. A slower or unchanged result is reported honestly. This small warm-cache experiment does not establish production performance.

Two screenshots are captured automatically from the saved query-results and index-comparison pages. They use your name/ID prefix under `portfolio-2-query-optimisation/screenshots/`. HTML, JSON, SQL and raw plans remain the underlying evidence.

If an experiment fails, the app shows the error and offers **Retry Portfolio 2**. It retains Portfolio 1 and diagnostics and does not mark the query stages complete. A server restart restores completed result links; interrupted runs require an explicit retry.
