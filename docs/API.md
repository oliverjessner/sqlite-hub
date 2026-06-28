# SQLite Hub API

SQLite Hub exposes a versioned JSON API at `/api/v1`. The server listens on
`127.0.0.1`. `GET /api/v1/info` is public local app metadata; every database
request requires a token created for that exact database in **Settings > API
Tokens**.

The token is shown only once when it is created. SQLite Hub stores a SHA-256
hash, the token prefix, its name, and timestamps. Send the token as a bearer
token:

The `DATABASE_ID` is shown prominently in **Settings > API Tokens** for the
active database. Use the **Copy ID** button there and replace `DATABASE_ID` in
the request URL.

```bash
curl \
  -H "Authorization: Bearer shub_..." \
  http://127.0.0.1:4173/api/v1/databases/DATABASE_ID/tables
```

A missing, invalid, deleted, or database-mismatched token returns HTTP `401`
with a structured JSON error.

## Endpoints

All path values must be URL encoded.

```text
GET  /api/v1/info
POST /api/v1/query

GET  /api/v1/databases/:databaseId
GET  /api/v1/databases/:databaseId/tables
GET  /api/v1/databases/:databaseId/tables/:tableName
POST /api/v1/databases/:databaseId/tables/:tableName/row
POST /api/v1/databases/:databaseId/tables/:tableName/types

GET  /api/v1/databases/:databaseId/backups
POST /api/v1/databases/:databaseId/backups

GET  /api/v1/databases/:databaseId/queries
GET  /api/v1/databases/:databaseId/queries/:queryName
GET  /api/v1/databases/:databaseId/queries/:queryName/notes
GET  /api/v1/databases/:databaseId/queries/:queryName/export?format=csv|tsv|md|json
POST /api/v1/databases/:databaseId/queries/:queryName/execute

GET  /api/v1/databases/:databaseId/documents
GET  /api/v1/databases/:databaseId/documents/:documentName
GET  /api/v1/databases/:databaseId/documents/:documentName/export
```

`GET /api/v1/info` returns the same app/version status shown by
`sqlite-hub --info`, including the installed SQLite Hub version, SQLite runtime
version, local URL, and npm update status.

`POST /api/v1/query` executes raw SQL through the same SQL Editor execution path
used by the app and records it in Query History. Send the database token as a
bearer token and include `databaseId` plus `sql` in the JSON body. Add `store`
or `name` to title the history item and mark it as saved. Raw query execution is
rejected with HTTP `403` when the target database is marked read-only.

Every `/api/v1` request is also recorded in the local Access Log with its API
action, database id when available, target type/name, status, duration, and API
token name/id. Tokens and request payloads are not stored in the Access Log.

```bash
curl \
  -H "Authorization: Bearer shub_..." \
  -H "Content-Type: application/json" \
  -d '{"databaseId":"DATABASE_ID","sql":"SELECT * FROM companies LIMIT 10","name":"Company Sample"}' \
  http://127.0.0.1:4173/api/v1/query
```

Row lookup accepts a scalar key or a composite primary-key object:

```json
{ "key": 42 }
```

```json
{ "key": { "id": 42, "locale": "en" } }
```

`POST /api/v1/databases/:databaseId/tables/:tableName/types` generates
application types from the declared SQLite schema. It is read-only, uses the
same generation service as the Structure Inspector and CLI, and returns code as
JSON without writing server-side files.

```bash
curl \
  -X POST \
  -H "Authorization: Bearer shub_..." \
  -H "Content-Type: application/json" \
  -d '{
    "target": "typescript",
    "options": {
      "propertyNaming": "camel",
      "nullableMode": "native",
      "includeComments": true
    }
  }' \
  http://127.0.0.1:4173/api/v1/databases/DATABASE_ID/tables/users/types
```

Supported targets are `typescript`, `rust`, `kotlin`, and `swift`. Warnings are
returned in the top-level `warnings` array. Metadata includes column counts and
CHECK-constraint counts.

`GET /api/v1/databases/:databaseId/backups` lists managed backups for the
token's database.

```bash
curl \
  -H "Authorization: Bearer shub_..." \
  http://127.0.0.1:4173/api/v1/databases/DATABASE_ID/backups
```

`POST /api/v1/databases/:databaseId/backups` creates and verifies a managed
backup for the token's database. The request body may include `name` and `notes`.
Backup creation uses SQLite's backup API and is allowed for read-only database
connections because the source database is only read.

```bash
curl \
  -X POST \
  -H "Authorization: Bearer shub_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"Before import","notes":"Before loading vendor data"}' \
  http://127.0.0.1:4173/api/v1/databases/DATABASE_ID/backups
```

Successful responses use this envelope:

```json
{
    "success": true,
    "message": "",
    "data": {},
    "metadata": {},
    "warnings": []
}
```

Errors use the same envelope with `success: false` and a structured `error`
object containing `code`, `message`, `details`, and `sqliteCode`.

## Example

See [`examples/api/list-tables.js`](../examples/api/list-tables.js) for a small
Node.js example using a token from the `SQLITE_HUB_API_TOKEN` environment
variable.
