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
  const filename = String(options.filename ?? "").trim() || match?.[1] || options.fallbackFilename || "export.csv";
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

export function chooseCreateDatabasePath() {
  return request("/api/connections/choose-create-path", {
    method: "POST",
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

export function openOverviewInFinder() {
  return request("/api/db/overview/open-in-finder", {
    method: "POST",
  });
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

export function getQueryHistory(options = {}) {
  const params = new URLSearchParams();

  if (options.tab) {
    params.set("tab", String(options.tab));
  }

  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }

  if (options.search) {
    params.set("search", String(options.search));
  }

  if (options.queryType) {
    params.set("queryType", String(options.queryType));
  }

  if (options.onlySaved) {
    params.set("onlySaved", "true");
  }

  if (options.onlyFavorites) {
    params.set("onlyFavorites", "true");
  }

  const query = params.toString();
  return request(`/api/sql/history${query ? `?${query}` : ""}`);
}

export function clearQueryHistory() {
  return request("/api/sql/history", {
    method: "DELETE",
  });
}

export function getQueryHistoryItem(historyId) {
  return request(`/api/sql/history/${encodeURIComponent(historyId)}`);
}

export function getChartsQueryHistory() {
  return request("/api/charts/query-history");
}

export function getChartsQueryHistoryDetail(historyId) {
  return request(`/api/charts/query-history/${encodeURIComponent(historyId)}`);
}

export function executeChartsQueryHistory(historyId) {
  return request(`/api/charts/query-history/${encodeURIComponent(historyId)}/execute`, {
    method: "POST",
  });
}

export function createQueryHistoryChart(payload) {
  return request("/api/charts", {
    method: "POST",
    body: payload,
  });
}

export function updateQueryHistoryChart(chartId, payload) {
  return request(`/api/charts/${encodeURIComponent(chartId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteQueryHistoryChart(chartId) {
  return request(`/api/charts/${encodeURIComponent(chartId)}`, {
    method: "DELETE",
  });
}

export function getQueryHistoryRuns(historyId, options = {}) {
  const params = new URLSearchParams();

  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();

  return request(
    `/api/sql/history/${encodeURIComponent(historyId)}/runs${query ? `?${query}` : ""}`
  );
}

export function toggleQueryHistorySaved(historyId, value) {
  return request(`/api/sql/history/${encodeURIComponent(historyId)}/saved`, {
    method: "PATCH",
    body: { value },
  });
}

export function renameQueryHistoryItem(historyId, title) {
  return request(`/api/sql/history/${encodeURIComponent(historyId)}/title`, {
    method: "PATCH",
    body: { title },
  });
}

export function updateQueryHistoryNotes(historyId, notes) {
  return request(`/api/sql/history/${encodeURIComponent(historyId)}/notes`, {
    method: "PATCH",
    body: { notes },
  });
}

export function deleteQueryHistoryItem(historyId) {
  return request(`/api/sql/history/${encodeURIComponent(historyId)}`, {
    method: "DELETE",
  });
}

export function getStructureOverview() {
  return request("/api/structure");
}

export function getStructureDetail(tableName) {
  return request(`/api/structure/${encodeURIComponent(tableName)}`);
}

export function getTableDesignerOverview() {
  return request("/api/table-designer");
}

export function getTableDesignerTable(tableName) {
  return request(`/api/table-designer/${encodeURIComponent(tableName)}`);
}

export function saveTableDesignerDraft(payload) {
  return request("/api/table-designer/save", {
    method: "POST",
    body: payload,
  });
}

export function getMediaTaggingState() {
  return request("/api/media-tagging");
}

export function previewMediaTaggingConfig(payload) {
  return request("/api/media-tagging/preview", {
    method: "POST",
    body: payload,
  });
}

export function saveMediaTaggingConfig(payload) {
  return request("/api/media-tagging/config", {
    method: "POST",
    body: payload,
  });
}

export function createMediaTaggingTagTable(payload) {
  return request("/api/media-tagging/tag-table/create", {
    method: "POST",
    body: payload,
  });
}

export function createMediaTaggingMappingTable(payload) {
  return request("/api/media-tagging/mapping-table/create", {
    method: "POST",
    body: payload,
  });
}

export function createMediaTag(payload) {
  return request("/api/media-tagging/tags", {
    method: "POST",
    body: payload,
  });
}

export function deleteMediaTag(payload) {
  return request("/api/media-tagging/tags/delete", {
    method: "POST",
    body: payload,
  });
}

export function applyMediaTagging(payload) {
  return request("/api/media-tagging/apply", {
    method: "POST",
    body: payload,
  });
}

export function skipMediaTagging(payload) {
  return request("/api/media-tagging/skip", {
    method: "POST",
    body: payload,
  });
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

  if (options.sortColumn) {
    params.set("sortColumn", String(options.sortColumn));
  }

  if (options.sortDirection) {
    params.set("sortDirection", String(options.sortDirection));
  }

  const filterColumn = String(options.filterColumn ?? "").trim();
  const filterValue = String(options.filterValue ?? "");

  if (filterColumn && filterValue.trim()) {
    params.set("filterColumn", filterColumn);
    params.set("filterOperator", String(options.filterOperator ?? "="));
    params.set("filterValue", filterValue);
  }

  const query = params.toString();

  return request(`/api/data/${encodeURIComponent(tableName)}${query ? `?${query}` : ""}`);
}

export function getDataTableRow(tableName, payload) {
  return request(`/api/data/${encodeURIComponent(tableName)}/row`, {
    method: "POST",
    body: payload,
  });
}

export function updateDataTableRow(tableName, payload) {
  return request(`/api/data/${encodeURIComponent(tableName)}/rows`, {
    method: "PATCH",
    body: payload,
  });
}

export function previewDataTableRowUpdate(tableName, payload) {
  return request(`/api/data/${encodeURIComponent(tableName)}/rows/preview-update`, {
    method: "POST",
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

const TEXT_EXPORT_EXTENSIONS = {
  csv: "csv",
  tsv: "tsv",
  md: "md",
};

function normalizeTextExportFormat(format) {
  const normalized = String(format ?? "csv").toLowerCase();
  return TEXT_EXPORT_EXTENSIONS[normalized] ? normalized : "csv";
}

export function getQueryExport(sql, format = "csv") {
  return request("/api/export/query", {
    method: "POST",
    body: {
      sql,
      format: normalizeTextExportFormat(format),
    },
  });
}

export function downloadQueryExport(sql, format = "csv", options = {}) {
  const normalizedFormat = normalizeTextExportFormat(format);
  const extension = TEXT_EXPORT_EXTENSIONS[normalizedFormat];

  return download(`/api/export/query.${extension}`, {
    method: "POST",
    body: { sql },
    fallbackFilename: `query-results.${extension}`,
    filename: options.filename,
  });
}

export function downloadQueryCsv(sql) {
  return downloadQueryExport(sql, "csv");
}

function buildTableExportBody(tableName, options = {}) {
  return {
    tableName,
    sortColumn: options.sortColumn,
    sortDirection: options.sortDirection,
    filterColumn: options.filterColumn,
    filterOperator: options.filterOperator,
    filterValue: options.filterValue,
    format: normalizeTextExportFormat(options.format),
  };
}

export function getTableExport(tableName, options = {}) {
  return request("/api/export/table", {
    method: "POST",
    body: buildTableExportBody(tableName, options),
  });
}

export function downloadTableExport(tableName, options = {}) {
  const normalizedFormat = normalizeTextExportFormat(options.format);
  const extension = TEXT_EXPORT_EXTENSIONS[normalizedFormat];

  return download(`/api/export/table.${extension}`, {
    method: "POST",
    body: buildTableExportBody(tableName, { ...options, format: normalizedFormat }),
    fallbackFilename: `${tableName || "table"}.${extension}`,
    filename: options.filename,
  });
}

export function downloadTableCsv(tableName, options = {}) {
  return downloadTableExport(tableName, { ...options, format: "csv" });
}

export function getDocuments() {
  return request("/api/documents");
}

export function createDocument(payload = {}) {
  return request("/api/documents", {
    method: "POST",
    body: payload,
  });
}

export function getDocument(documentId) {
  return request(`/api/documents/${encodeURIComponent(documentId)}`);
}

export function updateDocument(documentId, payload = {}) {
  return request(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteDocument(documentId) {
  return request(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}
