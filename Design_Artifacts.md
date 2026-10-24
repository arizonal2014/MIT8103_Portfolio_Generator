# ER diagram and normalisation stages

Historical hospital milestone. The active renderer now derives layout, candidate-key examples and dependencies from each generated case. See [the current free-case workflow](Free_Case_Workflow.md) and Verification.md. The hospital-specific renderer below remains only for regression tests of the earlier pilot.

The finished generator must accept a student's own case study. Hospital is the current end-to-end pilot; the temporary hospital input gate and fixed execution bindings are not the final product. Other cases must generate their own models, executable rules, records and tests. Renaming the hospital example is not general support.

## Connected now

The browser workflow adds a design-document stage after the PostgreSQL checks and before saving named files. It uses `ReviewedCaseSpec.json` and the actual row snapshot in `Catalog.json`. Its model fingerprint must match the executed schema's fingerprint.

The app provides links to:

- A viewable ER diagram, an SVG image and editable Mermaid source.
- A normalisation walkthrough, Markdown tables and a JSON reconstruction check.

Files use the student prefix and are saved in `portfolio-1-database-design/`. Stages 6 and 7 are marked complete only after both artifacts are built. Case description/design remain drafts and Portfolio 1 remains pending individual review. Later portfolios remain pending.

## ER diagram

The diagram uses the reviewed model's fields, primary keys, foreign keys and unique keys. It displays required/optional links and relationship counts. UQ1 labels indicate components of one composite unique key, not individually unique columns. Historical bookings are many per slot; the active-only unique index is explained separately.

The present layout and descriptive text support the four-table hospital pilot. General layout generation is still required for arbitrary entities and relationship graphs.

## Normalisation

The records come from PostgreSQL's saved snapshot, not a new AI response. The walkthrough shows:

1. Before 1NF: a patient contains a repeating list of bookings.
2. 1NF: one booking per row, with scalar values and repeated patient/doctor/slot descriptions.
3. 2NF: the same table. Its assumed candidate key is the single `booking_id`; there is no proper subset of that key to cause a partial dependency.
4. 3NF: separate patient, doctor, slot and booking tables, with the functional dependencies explained beside their actual records.

This is a worked reconstruction from captured records. It does not claim that the live database was migrated through three historical versions. Decomposing the wide sample and joining it back must reproduce the same rows and values. Missing columns, broken joins, duplicate IDs, inconsistent dependencies and non-atomic values stop generation. This sample check accompanies the dependency argument; it does not prove normalisation from a few rows alone.

The present walkthrough assumes single-column keys and the reviewed hospital relationships. Other case studies, composite candidate keys and alternative dependency structures need their own validated worked examples before this stage can claim arbitrary-case support.

## Verification

The automated suite includes diagrams/relationships, unchanged 2NF, row reconstruction, matching fingerprints, missing snapshots, dangling links, duplicate IDs and escaped HTML values.

The live browser test uses fictional Alex Nwosu, ID `000123`, and account `arizonal2014`. See [verification](Verification.md) for its run ID, screenshots and limits.

## Test the app

Open the local server URL printed by `npm start`, normally **http://127.0.0.1:4310/**. Opening `public/index.html` through `file://` does not start the backend.

Enter test details, choose **Use hospital pilot case**, then **Generate and test hospital database**. After completion, open **View ER diagram** and **View 1NF, 2NF and 3NF**. The latter has a small expandable section showing the unchanged 2NF table.
