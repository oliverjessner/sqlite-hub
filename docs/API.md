# SQLite Hub API

SQLite Hub exposes a versioned JSON API at `/api/v1`. The server listens on
`127.0.0.1` and every database request requires a token created for that exact
database in **Settings > API Tokens**.

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
GET  /api/v1/databases/:databaseId
GET  /api/v1/databases/:databaseId/tables
GET  /api/v1/databases/:databaseId/tables/:tableName
POST /api/v1/databases/:databaseId/tables/:tableName/row

GET  /api/v1/databases/:databaseId/queries
GET  /api/v1/databases/:databaseId/queries/:queryName
GET  /api/v1/databases/:databaseId/queries/:queryName/notes
GET  /api/v1/databases/:databaseId/queries/:queryName/export?format=csv|tsv|md|json
POST /api/v1/databases/:databaseId/queries/:queryName/execute

GET  /api/v1/databases/:databaseId/documents
GET  /api/v1/databases/:databaseId/documents/:documentName
GET  /api/v1/databases/:databaseId/documents/:documentName/export
```

Row lookup accepts a scalar key or a composite primary-key object:

```json
{ "key": 42 }
```

```json
{ "key": { "id": 42, "locale": "en" } }
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
