# Portfolio 2: Queries and optimisation

The assessment assigns 7 marks to SQL queries and results, execution plans, optimisation and a short performance comparison. This feature covers steps 12 and 13 of the codelab.

1. Complete your case generation in the app.
2. Click **Run Portfolio 2**. No extra AI request is needed.
3. Open **View Portfolio 2 query results**, then **View Portfolio 2 index comparison**.
4. Review the SQL and explanation. Run `npm run save` in your Codespace to save the reviewed output to your repository.

Files are placed in `Surname_Firstname_StudentID/portfolio-2-query-optimisation/` with your name/ID prefix.

The first page shows a join, a filter and a grouped count using the actual Portfolio 1 tables and sample rows. Each query has its actual `EXPLAIN ANALYZE` plan. Generated queries follow the saved entity links; review whether their choices answer useful questions for your case.

The second page compares one lookup before and after a B-tree index. A separate `query_lab` table uses your case's chosen field and data type, plus a lab row ID. It contains 10,000–100,000 synthetic performance rows. These are deliberately simplified test values, not additional valid business records. Your original tables and constraints remain unchanged.

Three measured runs per phase, median execution time, plan nodes, buffer counts, identical result checks and index size are saved. The planner is free to choose a sequential scan. A slower or unchanged result is reported honestly. This small warm-cache experiment does not establish production performance.

Only two screenshots are suggested: query results and the combined before/after comparison. After `npm run save`, open your named folder in the Codespace Explorer, then `portfolio-2-query-optimisation/screenshots`. Right-click `screenshots`, choose **Upload**, and select your two images. Use `Surname_Firstname_StudentID_P2_QueryResults.png` and `Surname_Firstname_StudentID_P2_IndexComparison.png`, replacing the name and ID; keep `.jpg` if that is your original image format. Commit and push the images through Source Control. Automatic screenshots are still pending; HTML, JSON and SQL evidence are saved automatically.

If an experiment fails, the app shows the error and offers **Retry Portfolio 2**. It retains Portfolio 1 and diagnostics and does not mark the query stages complete. A server restart restores completed result links; interrupted runs require an explicit retry.
