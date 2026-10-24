# Portfolio 4: MongoDB documents and queries

The assessment assigns 7 marks to a NoSQL model for the same case study, implementation evidence and an explanation of why the model is suitable. This feature covers codelab steps 16 and 17.

1. Choose **Generate my portfolio**. The guided run executes Portfolio 4 after its prerequisites.
2. Open the Portfolio 4 report links and inspect the saved scripts and results.
3. Leave **Save real checkpoints** checked to push completed stages to your own private repository. Use `npm run save` if saving manually.

A new Codespace prepares MongoDB automatically. For an existing workspace, run `npm run setup:workspace` once if the app says the MongoDB image is missing, then retry. The lab uses MongoDB 7.0 inside Docker; no additional AI request is needed.

Each sample event contains a source record, its key and selected linked records from the saved case. For example, a library loan can include a member snapshot, identify the book by a reference key and carry different metadata for different event types. Related rows are matched through the declared keys rather than chosen arbitrarily.

| Feature | What the exercise demonstrates |
| --- | --- |
| Embedding | Keep selected related snapshots inside the event document. |
| References | Store keys for linked records kept outside those snapshots. |
| Flexible metadata | Keep the same core event fields while `details` varies. |
| Queries | Filter by event type, nested record key and BSON Date; aggregate counts by event type. |
| Validation | Reject a wrong date type and a duplicate event ID. |

Events are illustrative examples, not inferred business history. All documents are labelled `simulation: true`. The event timestamp is a native MongoDB Date with a sample time; imported snapshot dates retain their saved JSON string format. `Model.json` identifies copied variable fields and illustrative metadata values.

The model explanation covers why MongoDB suits these documents and the trade-offs: embedding duplicates data, snapshots can become stale, and PostgreSQL foreign keys are not automatically enforced in MongoDB. The script does not synchronise databases or demonstrate replication.

The generated `Execute.js` creates a collection, inserts the documents, runs four queries and checks two expected rejections. To replay it, connect mongosh to a fresh empty database and run the file with `--file`. The script also works with **MongoDB Atlas or another MongoDB server** using your own mongosh connection. The app's automatic route currently uses its temporary local container; it does not collect Atlas connection strings. Keep credentials out of committed files.

One screenshot is captured automatically from the saved MongoDB-results page under `portfolio-4-nosql/screenshots/`. The document-model report, Extended JSON, executable mongosh script, actual results and logs are also saved with your filename prefix. The temporary MongoDB container and its anonymous volumes are removed after the exercise.
