const path = require("node:path");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { quoteIdentifier } = require("../utils/identifier");
const { normalizeDeclaredType } = require("../utils/sqliteTypes");
const { getTableDetail } = require("./sqlite/introspection");

const TARGETS = new Set(["typescript", "rust", "kotlin", "swift"]);
const TARGET_ALIASES = {
  ts: "typescript",
  typescript: "typescript",
  rs: "rust",
  rust: "rust",
  kt: "kotlin",
  kotlin: "kotlin",
  swift: "swift",
};
const FILE_EXTENSIONS = {
  typescript: ".ts",
  rust: ".rs",
  kotlin: ".kt",
  swift: ".swift",
};
const DEFAULT_NAMING = {
  typescript: "camel",
  rust: "snake",
  kotlin: "camel",
  swift: "camel",
};
const PROPERTY_NAMING = new Set(["preserve", "camel", "pascal", "snake"]);
const NULLABLE_MODES = new Set(["native", "optional"]);
const JSON_TYPES = new Set(["unknown", "record", "json-value"]);

function normalizeTarget(value, { allowAliases = true } = {}) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const target = allowAliases ? TARGET_ALIASES[normalized] : normalized;

  if (!TARGETS.has(target)) {
    throw new ValidationError(
      `Unsupported type target "${value}". Supported targets: typescript, rust, kotlin, swift.`,
      { code: "INVALID_TYPE_TARGET" }
    );
  }

  return target;
}

function splitWords(value) {
  const text = String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();

  return text ? text.split(/\s+/) : ["value"];
}

function toPascalCase(value) {
  return splitWords(value)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join("") || "Value";
}

function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`;
}

function toSnakeCase(value) {
  return splitWords(value).map((word) => word.toLowerCase()).join("_") || "value";
}

function singularizeTableName(name) {
  const text = String(name ?? "").trim();

  if (/ies$/i.test(text) && text.length > 4) {
    return `${text.slice(0, -3)}y`;
  }

  if (/ses$/i.test(text) || /xes$/i.test(text) || /ches$/i.test(text) || /shes$/i.test(text)) {
    return text.slice(0, -2);
  }

  if (/s$/i.test(text) && !/ss$/i.test(text) && text.length > 3) {
    return text.slice(0, -1);
  }

  return text || "GeneratedType";
}

function transformPropertyName(name, mode) {
  if (mode === "preserve") return String(name);
  if (mode === "pascal") return toPascalCase(name);
  if (mode === "snake") return toSnakeCase(name);
  return toCamelCase(name);
}

function validateTypeName(typeName) {
  const normalized = String(typeName ?? "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new ValidationError(`Invalid type name "${typeName}".`, { code: "INVALID_TYPE_NAME" });
  }

  return normalized;
}

function normalizeOptions(target, options = {}) {
  const allowed = new Set([
    "typeName",
    "propertyNaming",
    "nullableMode",
    "includeComments",
    "includeDefaultsAsComments",
    "includeGeneratedColumns",
    "includeHiddenColumns",
    "exportDeclaration",
    "jsonType",
  ]);
  const unknown = Object.keys(options ?? {}).filter((key) => !allowed.has(key));

  if (unknown.length) {
    throw new ValidationError(`Unknown type generation options: ${unknown.join(", ")}.`, {
      code: "INVALID_TYPE_OPTIONS",
      details: { unknown },
    });
  }

  const propertyNaming = options.propertyNaming ?? DEFAULT_NAMING[target];
  const nullableMode = options.nullableMode ?? "native";
  const jsonType = options.jsonType ?? "unknown";

  if (!PROPERTY_NAMING.has(propertyNaming)) {
    throw new ValidationError(`Unsupported property naming "${propertyNaming}".`, {
      code: "INVALID_TYPE_OPTIONS",
    });
  }

  if (!NULLABLE_MODES.has(nullableMode) || (nullableMode === "optional" && target !== "typescript")) {
    throw new ValidationError(`Unsupported nullable mode "${nullableMode}" for ${target}.`, {
      code: "INVALID_TYPE_OPTIONS",
    });
  }

  if (!JSON_TYPES.has(jsonType) || (options.jsonType && target !== "typescript")) {
    throw new ValidationError(`Unsupported JSON type option "${jsonType}" for ${target}.`, {
      code: "INVALID_TYPE_OPTIONS",
    });
  }

  return {
    typeName: options.typeName ? validateTypeName(options.typeName) : null,
    propertyNaming,
    nullableMode,
    includeComments: Boolean(options.includeComments),
    includeDefaultsAsComments: Boolean(options.includeDefaultsAsComments),
    includeGeneratedColumns: options.includeGeneratedColumns !== false,
    includeHiddenColumns: Boolean(options.includeHiddenColumns),
    exportDeclaration: options.exportDeclaration !== false,
    jsonType,
  };
}

function skipQuotedSql(text, index) {
  const quote = text[index];
  let cursor = index + 1;

  while (cursor < text.length) {
    if (text[cursor] === quote) {
      if (text[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor += 1;
  }

  return text.length;
}

function findMatchingParenthesis(text, openIndex) {
  let depth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'" || char === '"' || char === "`") {
      index = skipQuotedSql(text, index) - 1;
      continue;
    }
    if (char === "[") {
      const closeIndex = text.indexOf("]", index + 1);
      index = closeIndex === -1 ? text.length : closeIndex;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractCheckExpressions(sql = "") {
  const expressions = [];
  const pattern = /\bCHECK\s*\(/gi;
  let match;

  while ((match = pattern.exec(sql))) {
    const openIndex = sql.indexOf("(", match.index);
    const closeIndex = findMatchingParenthesis(sql, openIndex);
    if (closeIndex === -1) continue;
    expressions.push(sql.slice(openIndex + 1, closeIndex).trim());
    pattern.lastIndex = closeIndex + 1;
  }

  return expressions;
}

function normalizeSqlIdentifier(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1).replace(/""/g, '"');
  if (text.startsWith("`") && text.endsWith("`")) return text.slice(1, -1).replace(/``/g, "`");
  if (text.startsWith("[") && text.endsWith("]")) return text.slice(1, -1).replace(/\]\]/g, "]");
  return text;
}

function parseSqlValueList(text = "") {
  const values = [];
  let index = 0;
  let sawString = false;
  let sawNumber = false;

  while (index < text.length) {
    while (/\s|,/.test(text[index] ?? "")) index += 1;
    if (index >= text.length) break;

    if (text[index] === "'") {
      sawString = true;
      let value = "";
      index += 1;
      while (index < text.length) {
        if (text[index] === "'") {
          if (text[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index += 1;
          values.push(value);
          break;
        }
        value += text[index];
        index += 1;
      }
      continue;
    }

    const match = text.slice(index).match(/^[-+]?(?:\d+|\d*\.\d+)$/);
    const tokenMatch = text.slice(index).match(/^[-+]?(?:\d+|\d*\.\d+)/);
    if (!tokenMatch) return { values: [], mixed: false, supported: false };
    const token = tokenMatch[0];
    if (!match && /[A-Za-z_]/.test(text[index + token.length] ?? "")) {
      return { values: [], mixed: false, supported: false };
    }
    sawNumber = true;
    values.push(token.includes(".") ? Number(token) : Number.parseInt(token, 10));
    index += token.length;
  }

  return { values, mixed: sawString && sawNumber, supported: true };
}

function parseCheckInExpressions(sql = "", columns = []) {
  const columnMap = new Map(columns.map((column) => [String(column.name).toLowerCase(), column.name]));
  const matchesByColumn = new Map();
  const expressions = extractCheckExpressions(sql);

  for (const expression of expressions) {
    const pattern = /(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$]*)\s+IN\s*\(/gi;
    let match;
    while ((match = pattern.exec(expression))) {
      const rawIdentifier = match[0].replace(/\s+IN\s*\($/i, "").trim();
      const columnName = columnMap.get(normalizeSqlIdentifier(rawIdentifier).toLowerCase());
      if (!columnName) continue;
      const openIndex = expression.indexOf("(", match.index + rawIdentifier.length);
      const closeIndex = findMatchingParenthesis(expression, openIndex);
      if (closeIndex === -1) continue;
      const parsed = parseSqlValueList(expression.slice(openIndex + 1, closeIndex));
      const entry = {
        expression,
        values: parsed.supported && !parsed.mixed ? parsed.values : null,
        supported: parsed.supported && !parsed.mixed && parsed.values.length > 0,
      };
      if (!matchesByColumn.has(columnName)) matchesByColumn.set(columnName, []);
      matchesByColumn.get(columnName).push(entry);
    }
  }

  return { expressions, matchesByColumn };
}

function normalizeColumnType(column, checkMatches = []) {
  const declared = String(column.declaredType ?? "").trim().toUpperCase();
  const affinity = String(column.affinity ?? normalizeDeclaredType(declared).affinity).toUpperCase();
  const singleCheck = checkMatches.length === 1 ? checkMatches[0] : null;

  if (["BOOLEAN", "BOOL"].some((type) => declared.includes(type))) return "boolean";
  if (
    singleCheck?.supported &&
    ["INTEGER", "NUMERIC"].includes(affinity) &&
    singleCheck.values.length === 2 &&
    singleCheck.values.includes(0) &&
    singleCheck.values.includes(1)
  ) {
    return "boolean";
  }
  if (declared.includes("JSON")) return "json";
  if (declared.includes("DATETIME") || declared.includes("TIMESTAMP")) return "datetime";
  if (declared === "DATE" || /\bDATE\b/.test(declared)) return "date";
  if (affinity === "INTEGER") return "integer";
  if (affinity === "REAL") return "real";
  if (affinity === "NUMERIC") return declared ? "numeric" : "unknown";
  if (affinity === "TEXT") return "text";
  if (affinity === "BLOB") return declared ? "blob" : "unknown";
  return "unknown";
}

function isColumnNullable(column, tableDetail) {
  if (column.notNull) return false;
  if (column.primaryKeyPosition > 0) {
    const declared = String(column.declaredType ?? "").toUpperCase();
    const primaryKeyColumns = tableDetail.columns.filter((candidate) => candidate.primaryKeyPosition > 0);
    return !(primaryKeyColumns.length === 1 && declared.includes("INT"));
  }
  return true;
}

function buildComments(column, options) {
  if (!options.includeComments && !options.includeDefaultsAsComments) return [];
  const comments = [];
  if (options.includeComments) {
    if (column.primaryKey) comments.push("Primary key");
    if (column.foreignKey) comments.push(`References ${column.foreignKey.table}.${column.foreignKey.column ?? "id"}`);
    if (column.generated) comments.push("Generated column");
    if (column.declaredType) comments.push(`SQLite type: ${column.declaredType}`);
  }
  if (options.includeDefaultsAsComments && column.defaultValue !== null && column.defaultValue !== undefined) {
    comments.push(`Default: ${column.defaultValue}`);
  }
  return comments;
}

function commentBlock(comments, prefix = "  ") {
  if (!comments.length) return [];
  if (comments.length === 1) return [`${prefix}/** ${comments[0].replace(/\*\//g, "* /")} */`];
  return [
    `${prefix}/**`,
    ...comments.map((comment) => `${prefix} * ${comment.replace(/\*\//g, "* /")}`),
    `${prefix} */`,
  ];
}

function quoteTsProperty(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function tsType(column, options) {
  if (column.allowedValues?.length) {
    return column.allowedValues.map((value) => (typeof value === "string" ? JSON.stringify(value) : String(value))).join(" | ");
  }
  if (column.normalizedType === "integer" || column.normalizedType === "real" || column.normalizedType === "numeric") return "number";
  if (column.normalizedType === "boolean") return "boolean";
  if (column.normalizedType === "blob") return "Uint8Array";
  if (column.normalizedType === "json") {
    if (options.jsonType === "record") return "Record<string, unknown>";
    if (options.jsonType === "json-value") return "JsonValue";
    return "unknown";
  }
  if (column.normalizedType === "unknown") return "unknown";
  return "string";
}

function generateTypeScript(table, options) {
  const lines = [];
  if (options.jsonType === "json-value" && table.columns.some((column) => column.normalizedType === "json")) {
    lines.push("export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };", "");
  }
  lines.push(`${options.exportDeclaration ? "export " : ""}interface ${table.suggestedTypeName} {`);
  for (const column of table.columns) {
    lines.push(...commentBlock(buildComments(column, options), "  "));
    const optional = column.nullable && options.nullableMode === "optional" ? "?" : "";
    const nullable = column.nullable && options.nullableMode === "native" ? " | null" : "";
    lines.push(`  ${quoteTsProperty(column.propertyName)}${optional}: ${tsType(column, options)}${nullable};`);
    if (options.includeComments || options.includeDefaultsAsComments) lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
  lines.push("}");
  return lines.join("\n");
}

const RUST_KEYWORDS = new Set(["type", "struct", "enum", "crate", "self", "Self", "super", "mod", "pub", "use", "where", "fn", "let", "match"]);
const KOTLIN_KEYWORDS = new Set(["when", "class", "object", "interface", "val", "var", "fun", "is", "in", "as", "typealias"]);
const SWIFT_KEYWORDS = new Set(["protocol", "class", "struct", "enum", "let", "var", "func", "import", "switch", "case", "default"]);

function enumName(typeName, propertyName) {
  return `${typeName}${toPascalCase(propertyName)}`;
}

function rustFieldName(name) {
  return RUST_KEYWORDS.has(name) ? `r#${name}` : name;
}

function rustType(column) {
  if (column.allowedValues?.length && column.allowedValues.every((value) => typeof value === "string")) return enumName("", column.propertyName).replace(/^\w/, (c) => c.toUpperCase());
  if (column.normalizedType === "integer") return "i64";
  if (["real", "numeric"].includes(column.normalizedType)) return "f64";
  if (column.normalizedType === "boolean") return "bool";
  if (column.normalizedType === "blob") return "Vec<u8>";
  if (["json", "unknown"].includes(column.normalizedType)) return "serde_json::Value";
  return "String";
}

function generateRust(table, options) {
  const lines = ["use serde::{Deserialize, Serialize};"];
  if (table.columns.some((column) => ["json", "unknown"].includes(column.normalizedType))) lines.push("use serde_json::Value;");
  lines.push("");
  for (const column of table.columns.filter((candidate) => candidate.allowedValues?.length && candidate.allowedValues.every((value) => typeof value === "string"))) {
    const name = enumName(table.suggestedTypeName, column.propertyName);
    lines.push("#[derive(Debug, Clone, Serialize, Deserialize)]", `pub enum ${name} {`);
    for (const value of column.allowedValues) {
      lines.push(`    #[serde(rename = ${JSON.stringify(value)})]`, `    ${toPascalCase(value)},`);
    }
    lines.push("}", "");
  }
  lines.push("#[derive(Debug, Clone, Serialize, Deserialize)]", `pub struct ${table.suggestedTypeName} {`);
  for (const column of table.columns) {
    const fieldName = rustFieldName(column.propertyName);
    const baseType =
      column.allowedValues?.length && column.allowedValues.every((value) => typeof value === "string")
        ? enumName(table.suggestedTypeName, column.propertyName)
        : rustType(column);
    if (column.propertyName !== column.databaseName) lines.push(`    #[serde(rename = ${JSON.stringify(column.databaseName)})]`);
    lines.push(`    pub ${fieldName}: ${column.nullable ? `Option<${baseType}>` : baseType},`);
  }
  lines.push("}");
  return lines.join("\n");
}

function kotlinFieldName(name) {
  return KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

function kotlinType(column) {
  if (column.allowedValues?.length && column.allowedValues.every((value) => typeof value === "string")) return enumName("", column.propertyName).replace(/^\w/, (c) => c.toUpperCase());
  if (column.normalizedType === "integer") return "Long";
  if (["real", "numeric"].includes(column.normalizedType)) return "Double";
  if (column.normalizedType === "boolean") return "Boolean";
  if (column.normalizedType === "blob") return "ByteArray";
  if (column.normalizedType === "json") return "JsonElement";
  if (column.normalizedType === "unknown") return "Any";
  return "String";
}

function generateKotlin(table) {
  const lines = [];
  for (const column of table.columns.filter((candidate) => candidate.allowedValues?.length && candidate.allowedValues.every((value) => typeof value === "string"))) {
    lines.push(`enum class ${enumName(table.suggestedTypeName, column.propertyName)} {`);
    lines.push(...column.allowedValues.map((value) => `    ${toSnakeCase(value).toUpperCase()},`));
    lines.push("}", "");
  }
  lines.push(`data class ${table.suggestedTypeName}(`);
  table.columns.forEach((column, index) => {
    const baseType =
      column.allowedValues?.length && column.allowedValues.every((value) => typeof value === "string")
        ? enumName(table.suggestedTypeName, column.propertyName)
        : kotlinType(column);
    const comma = index === table.columns.length - 1 ? "" : ",";
    lines.push(`    val ${kotlinFieldName(column.propertyName)}: ${baseType}${column.nullable ? "?" : ""}${comma}`);
  });
  lines.push(")");
  return lines.join("\n");
}

function swiftFieldName(name) {
  return SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

function swiftType(column) {
  if (column.allowedValues?.length && column.allowedValues.every((value) => typeof value === "string")) return enumName("", column.propertyName).replace(/^\w/, (c) => c.toUpperCase());
  if (column.normalizedType === "integer") return "Int64";
  if (["real", "numeric"].includes(column.normalizedType)) return "Double";
  if (column.normalizedType === "boolean") return "Bool";
  if (column.normalizedType === "blob") return "Data";
  if (column.normalizedType === "json") return "JSONValue";
  if (column.normalizedType === "unknown") return "AnyCodable";
  return "String";
}

function generateSwift(table) {
  const needsFoundation = table.columns.some((column) => column.normalizedType === "blob");
  const lines = needsFoundation ? ["import Foundation", ""] : [];
  for (const column of table.columns.filter((candidate) => candidate.allowedValues?.length && candidate.allowedValues.every((value) => typeof value === "string"))) {
    lines.push(`enum ${enumName(table.suggestedTypeName, column.propertyName)}: String, Codable {`);
    for (const value of column.allowedValues) lines.push(`    case ${toCamelCase(value)} = ${JSON.stringify(value)}`);
    lines.push("}", "");
  }
  lines.push(`struct ${table.suggestedTypeName}: Codable {`);
  for (const column of table.columns) {
    const baseType =
      column.allowedValues?.length && column.allowedValues.every((value) => typeof value === "string")
        ? enumName(table.suggestedTypeName, column.propertyName)
        : swiftType(column);
    lines.push(`    let ${swiftFieldName(column.propertyName)}: ${baseType}${column.nullable ? "?" : ""}`);
  }
  const renamed = table.columns.filter((column) => column.propertyName !== column.databaseName);
  if (renamed.length) {
    lines.push("", "    enum CodingKeys: String, CodingKey {");
    for (const column of table.columns) {
      lines.push(`        case ${swiftFieldName(column.propertyName)}${column.propertyName === column.databaseName ? "" : ` = ${JSON.stringify(column.databaseName)}`}`);
    }
    lines.push("    }");
  }
  lines.push("}");
  return lines.join("\n");
}

function makeResult(target, table, options, code, warnings, metadata) {
  const fileName = `${table.suggestedTypeName}${FILE_EXTENSIONS[target]}`;
  return {
    target,
    language: target,
    tableName: table.tableName,
    typeName: table.suggestedTypeName,
    fileName,
    code,
    warnings,
    metadata,
  };
}

class TypeGenerationService {
  generateTypesFromDatabase(db, tableName, targetInput, optionInput = {}) {
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const ddl = tableDetail.ddl ?? db
      .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(tableName)?.sql ?? null;

    return this.generateTypesFromTableDetail(tableDetail, targetInput, optionInput, ddl);
  }

  generateTypesFromTableDetail(tableDetail, targetInput, optionInput = {}, ddlOverride = undefined) {
    const target = normalizeTarget(targetInput, { allowAliases: true });
    const options = normalizeOptions(target, optionInput);
    const ddl = ddlOverride === undefined ? tableDetail.ddl : ddlOverride;
    const checkAnalysis = parseCheckInExpressions(ddl ?? "", tableDetail.columns ?? []);
    const warnings = ["SQLite uses dynamic typing. Generated types are based on declared column types and schema constraints."];
    const typeName = options.typeName ?? validateTypeName(toPascalCase(singularizeTableName(tableDetail.name)));
    const foreignKeyByColumn = new Map();

    for (const fk of tableDetail.foreignKeys ?? []) {
      for (const mapping of fk.mappings ?? []) {
        foreignKeyByColumn.set(mapping.from, {
          table: fk.referencedTable,
          column: mapping.to ?? null,
        });
      }
    }

    const columns = (tableDetail.columns ?? [])
      .filter((column) => options.includeGeneratedColumns || !column.generated)
      .filter((column) => options.includeHiddenColumns || column.visible !== false || column.generated)
      .map((column) => {
        const matches = checkAnalysis.matchesByColumn.get(column.name) ?? [];
        const normalizedType = normalizeColumnType(column, matches);
        let allowedValues = null;
        if (matches.length === 1 && matches[0].supported && normalizedType !== "boolean") {
          allowedValues = matches[0].values;
        } else if (matches.length > 1) {
          warnings.push(`Multiple CHECK constraints affect column "${column.name}". The allowed value set could not be determined safely.`);
        }
        if (String(column.declaredType ?? "").trim() === "" || normalizedType === "unknown") {
          warnings.push(`Column "${column.name}" uses an unknown or empty declared SQLite type and was mapped to unknown.`);
        }
        return {
          databaseName: column.name,
          propertyName: transformPropertyName(column.name, options.propertyNaming),
          declaredType: column.declaredType || null,
          normalizedType,
          nullable: isColumnNullable(column, tableDetail),
          primaryKey: Number(column.primaryKeyPosition ?? 0) > 0,
          primaryKeyPosition: Number(column.primaryKeyPosition ?? 0) || null,
          defaultValue: column.defaultValue ?? null,
          generated: Boolean(column.generated),
          hidden: column.visible === false,
          foreignKey: foreignKeyByColumn.get(column.name) ?? null,
          allowedValues,
          checkConstraints: matches.map((match) => match.expression),
          warnings: [],
        };
      });

    if (!columns.length) {
      warnings.push(`Table "${tableDetail.name}" has no columns available for the selected options.`);
    }

    const metadata = {
      columnCount: columns.length,
      generatedColumnCount: columns.filter((column) => column.generated).length,
      hiddenColumnCount: columns.filter((column) => column.hidden).length,
      checkConstraintsFound: checkAnalysis.expressions.length,
      checkConstraintsApplied: columns.filter((column) => column.allowedValues?.length || column.normalizedType === "boolean").length,
      checkConstraintsIgnored: Math.max(0, checkAnalysis.expressions.length - columns.filter((column) => column.allowedValues?.length || column.normalizedType === "boolean").length),
    };
    if (metadata.checkConstraintsIgnored > 0) {
      warnings.push(
        `Some CHECK constraints for table "${tableDetail.name}" could not be evaluated safely and were ignored.`
      );
    }
    const table = {
      tableName: tableDetail.name,
      suggestedTypeName: typeName,
      createTableSql: ddl,
      columns,
    };
    const code =
      target === "typescript" ? generateTypeScript(table, options)
      : target === "rust" ? generateRust(table, options)
      : target === "kotlin" ? generateKotlin(table, options)
      : generateSwift(table, options);

    if (target === "swift" && columns.some((column) => ["json", "unknown"].includes(column.normalizedType))) {
      warnings.push("The JSONValue or AnyCodable type must be provided by your Swift project.");
    }

    return makeResult(target, table, options, code, warnings, metadata);
  }

  assertOutputPath(result, outputPath, { force = false } = {}) {
    const expectedExtension = FILE_EXTENSIONS[result.target];
    if (path.extname(outputPath) !== expectedExtension) {
      throw new ValidationError(`Output file for ${result.target} must use ${expectedExtension}.`, {
        code: "INVALID_TYPE_OPTIONS",
      });
    }
    if (!force && require("node:fs").existsSync(outputPath)) {
      throw new ValidationError(`Output file already exists: ${outputPath}`, {
        code: "INVALID_TYPE_OPTIONS",
      });
    }
  }
}

module.exports = {
  FILE_EXTENSIONS,
  TypeGenerationService,
  normalizeTarget,
  normalizeOptions,
  transformPropertyName,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
};
