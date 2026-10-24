# PostgreSQL pilot

Historical hospital pilot. The active app now uses `lib/postgres-case.mjs` with generated case-specific records and exact constraint-target checks. See [the current guide](Free_Case_Workflow.md). The earlier runner remains for regression/CLI verification.

This milestone covers the table, key and constraint implementation part of Portfolio 1. It does not complete the case description, ER diagram or normalisation evidence.

## Implemented

`lib/postgres-schema.mjs` renders PostgreSQL DDL from a validated case specification and a separate explicit execution plan. Table/column identifiers are checked and quoted. Prose is never executed. All tables are created before foreign keys, allowing cyclic relationships without guessing creation order.

The plan supports a small expression language: text equality, null/not-null, comparisons between compatible ordered fields, AND and OR. CHECK rules need an explicit predicate. Partial unique indexes need explicit key fields and a predicate. Unknown operations, raw SQL, missing bindings and unsupported workflow rules stop generation. The expression language is a prototype; it cannot yet represent every possible case study.

IDs are explicit bigint values, timestamps use timestamptz, and decimal values use numeric(18,2). There are no automatic IDs, deletion cascades or inferred defaults. These mappings require review for other domains.

## Hospital review

`examples/hospital-execution.mjs` binds the actual Copilot hospital model. It is a reviewed pilot adapter, not an arbitrary-case generator.

- `status` is active with no cancellation time, or cancelled with a cancellation time.
- A unique index on `slot_id WHERE status = 'active'` prevents two active bookings while retaining cancelled history.
- An explicit review amendment adds `ends_at > starts_at` for each slot. Both the original and amended models are saved.
- Declared primary, unique and foreign keys and required columns come from the model.

The design does not prevent every pair of overlapping slots with different start times. No concurrent-session behaviour has been tested in this milestone. These limits must remain visible when later exercises are generated.

## Run

Requires Node.js 22+, Docker with its daemon running, and an existing official `postgres:17-alpine` image. There is no automatic image download. For the saved local Copilot pilot:

```bash
npm run test:postgres -- --spec runs/copilot-probe-78a3fe7f-4ee8-4aeb-a136-82db33fbb1e7/case-response.txt --allow-live
```

The `--spec` path must point to the reviewed hospital model. This local diagnostic file is ignored by Git and is not included in a fresh checkout. A new workspace must first generate/review its own supported model. Other table structures stop rather than being silently renamed.

The runner starts a uniquely named container with no network, published ports, host mounts or project credentials. Memory/CPU/process limits apply. PostgreSQL's local test container uses trust authentication; it is isolated and temporary, not a deployment configuration. Schema execution uses a non-superuser database owner through the container's Unix socket. Docker access itself remains a privileged capability on the host.

The runner executes the saved schema, captures `\dt` and `\d` output, tests ten invalid records, checks accepted cancellation/rebooking behaviour, and queries PostgreSQL's catalog. It checks actual keys, indexes, required columns and final rows before reporting success. It removes only its own container and anonymous volumes after saving evidence.

This Docker route verifies the runner locally. The students' Codespaces route and connection to existing PostgreSQL services are still unimplemented.

## Saved evidence

Each invocation creates a separate `runs/postgres-pilot-<uuid>/` containing the source model, reviewed model, execution plan, schema, test SQL, execution logs, catalog, report and a readable HTML evidence view on success. Failed runs retain a report and available output. It does not mark the existing 19-step scaffold complete.

The current pilot also has one browser screenshot of the saved evidence view. That screenshot was captured with browser tooling; the database runner does not yet capture screenshots automatically. It shows recorded automated outputs, not a simulated interactive terminal.

## References

- [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html): CHECK constraints can accept NULL; required values are enforced separately with NOT NULL.
- [PostgreSQL partial indexes](https://www.postgresql.org/docs/17/indexes-partial.html): a unique partial index applies uniqueness only to rows matching its predicate.
