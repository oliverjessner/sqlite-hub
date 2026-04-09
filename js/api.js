async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok || !payload?.success) {
    const error = new Error(
      payload?.message || payload?.error?.message || response.statusText || "Request failed."
    );
    error.status = response.status;
    error.code = payload?.error?.code ?? "REQUEST_FAILED";
    error.details = payload?.error?.details ?? null;
    error.sqliteCode = payload?.error?.sqliteCode ?? null;
    error.warnings = payload?.warnings ?? [];
    throw error;
  }

  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return parseResponse(response);
}

async function download(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const payload = await parseResponse(response);
    return payload;
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] ?? options.fallbackFilename ?? "export.csv";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { filename };
}

export function getHealth() {
  return request("/api/health");
}

export function getRecentConnections() {
  return request("/api/connections/recent");
}

export function getActiveConnection() {
  return request("/api/connections/active");
}

export function openConnection(payload) {
  return request("/api/connections/open", {
    method: "POST",
    body: payload,
  });
}

export function createConnection(payload) {
  return request("/api/connections/create", {
    method: "POST",
    body: payload,
  });
}

export function importSql(payload) {
  return request("/api/connections/import-sql", {
    method: "POST",
    body: payload,
  });
}

export function selectActiveConnection(id) {
  return request("/api/connections/select-active", {
    method: "POST",
    body: { id },
  });
}

export function removeRecentConnection(id) {
  return request(`/api/connections/recent/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function updateRecentConnection(id, payload) {
  return request(`/api/connections/recent/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function createActiveConnectionBackup() {
  return request("/api/connections/backup-active", {
    method: "POST",
  });
}

export function getOverview() {
  return request("/api/db/overview");
}

export function getDbStatus() {
  return request("/api/db/status");
}

export function executeSql(sql) {
  return request("/api/sql/execute", {
    method: "POST",
    body: { sql },
  });
}

export function getSqlHistory() {
  return request("/api/sql/history");
}

export function clearSqlHistory() {
  return request("/api/sql/history", {
    method: "DELETE",
  });
}

export function getStructureOverview() {
  return request("/api/structure");
}

export function getStructureDetail(tableName) {
  return request(`/api/structure/${encodeURIComponent(tableName)}`);
}

export function getDataTables() {
  return request("/api/data");
}

export function getDataTable(tableName, options = {}) {
  const params = new URLSearchParams();

  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }

  const query = params.toString();

  return request(`/api/data/${encodeURIComponent(tableName)}${query ? `?${query}` : ""}`);
}

export function updateDataTableRow(tableName, payload) {
  return request(`/api/data/${encodeURIComponent(tableName)}/rows`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteDataTableRow(tableName, payload) {
  return request(`/api/data/${encodeURIComponent(tableName)}/rows`, {
    method: "DELETE",
    body: payload,
  });
}

export function getSettings() {
  return request("/api/settings");
}

export function patchSettings(settings) {
  return request("/api/settings", {
    method: "PATCH",
    body: settings,
  });
}

export function downloadQueryCsv(sql) {
  return download("/api/export/query.csv", {
    method: "POST",
    body: { sql },
    fallbackFilename: "query-results.csv",
  });
}

export function downloadTableCsv(tableName) {
  return download("/api/export/table.csv", {
    method: "POST",
    body: { tableName },
    fallbackFilename: `${tableName || "table"}.csv`,
  });
}
