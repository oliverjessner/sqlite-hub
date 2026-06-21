const RISKY_PATTERNS = [
  { type: 'drop_table', pattern: /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s;]+))/i },
  { type: 'schema_change', pattern: /^\s*ALTER\s+TABLE\b/i },
  { type: 'schema_change', pattern: /^\s*CREATE\s+(?:TABLE|INDEX|VIEW|TRIGGER)\b/i },
  { type: 'schema_change', pattern: /^\s*DROP\s+(?:INDEX|VIEW|TRIGGER)\b/i },
  { type: 'schema_change', pattern: /^\s*REINDEX\b/i },
  { type: 'schema_change', pattern: /^\s*VACUUM\b/i },
];

function stripSqlComments(sql = '') {
  const text = String(sql ?? '');
  let output = '';
  let index = 0;
  let quote = null;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      output += char;
      if (char === quote) {
        if (text[index + 1] === quote) {
          output += text[index + 1];
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += char;
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      while (index < text.length && text[index] !== '\n') {
        index += 1;
      }
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      output += ' ';
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function splitSqlStatements(sql = '') {
  const statements = [];
  let current = '';
  let quote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];

    if (quote) {
      current += char;
      if (char === quote) {
        if (sql[index + 1] === quote) {
          current += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

function extractDropTableName(match) {
  return [match?.[1], match?.[2], match?.[3], match?.[4]]
    .map(value => String(value ?? '').trim())
    .find(Boolean) ?? null;
}

export function detectRiskySqlOperations(sql = '') {
  const statements = splitSqlStatements(stripSqlComments(sql));
  const operations = [];

  statements.forEach((statement, index) => {
    for (const rule of RISKY_PATTERNS) {
      const match = statement.match(rule.pattern);
      if (!match) {
        continue;
      }

      operations.push({
        type: statements.length > 1 && rule.type !== 'drop_table' ? 'migration' : rule.type,
        statement,
        statementIndex: index,
        tableName: rule.type === 'drop_table' ? extractDropTableName(match) : null,
      });
      break;
    }
  });

  return operations;
}

export function buildRiskySqlBackupContext(operations = []) {
  const dropTable = operations.find(operation => operation.type === 'drop_table');

  if (dropTable) {
    return {
      type: 'pre_schema_change',
      name: `Before dropping table ${dropTable.tableName ?? ''}`.trim(),
      description: `DROP TABLE may remove data permanently. ${dropTable.tableName ? `Target: ${dropTable.tableName}.` : ''}`.trim(),
    };
  }

  if (operations.some(operation => operation.type === 'migration') || operations.length > 1) {
    return {
      type: 'pre_migration',
      name: 'Before migration',
      description: 'Multiple schema-affecting statements were detected.',
    };
  }

  return {
    type: 'pre_schema_change',
    name: 'Before schema change',
    description: 'This SQL can change database schema objects.',
  };
}
