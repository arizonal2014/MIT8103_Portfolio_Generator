const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function renderPostgresEvidence(report,inspection,tests){
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hospital pilot — PostgreSQL evidence</title>
<style>body{font:16px system-ui;margin:32px auto;padding:0 24px;max-width:1100px;color:#17212c;background:#f8fafb}h1{font-size:28px;margin-bottom:8px}h2{font-size:20px}p{line-height:1.5}.summary{padding:16px;background:#eaf4ed;border:1px solid #bed9c5;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace;padding:16px;background:white;border:1px solid #dce2e7}small{color:#465361}</style>
<h1>Hospital pilot: PostgreSQL evidence</h1><p>Saved output from an automated local database run. This page displays the recorded results.</p>
<div class="summary"><strong>Status: ${escape(report.status)}</strong><br>4 tables · 4 primary keys · 3 foreign keys · 2 check constraints<br>10 invalid records rejected · cancellation history and rebooking accepted</div>
<p><small>Run: ${escape(report.container)}<br>Completed: ${escape(report.finishedAt)}<br>Database image: ${escape(report.image)} · network: ${escape(report.network)} · published ports: ${escape(JSON.stringify(report.publishedPorts))}<br>Cleanup: ${escape(report.cleanup)}</small></p>
<h2>Constraint tests</h2><pre>${escape(tests)}</pre><details><summary>Tables, keys and constraints — complete psql output</summary><pre>${escape(inspection)}</pre></details>
<p>Source files: Report.json, TablesAndConstraints.log, ConstraintTests.log and Catalog.json in this run folder. This pilot does not complete Portfolio 1 or demonstrate concurrent sessions.</p></html>`;
}
