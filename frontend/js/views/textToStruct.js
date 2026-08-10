import { escapeHtml, formatNumber } from '../utils/format.js';
import { renderPageHeader } from '../components/pageHeader.js';
import { TEXT_TO_STRUCT_FIELD_TYPES, validateTextToStructFields } from '../lib/textToStruct.js';

const PARSER_OPTIONS = [
    ['delimiter', 'Delimiter'],
    ['lines', 'Lines'],
    ['key-value', 'Key / Value'],
    ['csv', 'CSV'],
    ['tsv', 'TSV'],
];

const ERROR_OPTIONS = [
    ['collect', 'Collect errors'],
    ['skip', 'Skip invalid rows'],
    ['throw', 'Stop on first error'],
];

const OUTPUT_OPTIONS = [
    ['json', 'JSON'],
    ['jsonl', 'JSON Lines'],
    ['csv', 'CSV'],
    ['tsv', 'TSV'],
    ['markdown', 'Markdown'],
    ['yaml', 'YAML'],
    ['sqlite', 'SQLite SQL'],
];

const OUTPUT_STATUS_LABELS = {
    json: 'JSON',
    jsonl: 'JSONL',
    csv: 'CSV',
    tsv: 'TSV',
    markdown: 'MARKDOWN',
    yaml: 'YAML',
    sqlite: 'SQLITE',
};

function renderOptions(options, selectedValue) {
    return options
        .map(
            ([value, label]) =>
                `<option value="${escapeHtml(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(label)}</option>`,
        )
        .join('');
}

function renderFieldCheckbox({ field, checked, label, disabled = false }) {
    return `
      <label class="standard-checkbox text-to-struct-field-flag ${disabled ? 'is-disabled' : ''}">
        <input
          data-bind="text-to-struct-field"
          data-column-id="${escapeHtml(field.id)}"
          data-field="${escapeHtml(label.field)}"
          type="checkbox"
          ${checked ? 'checked' : ''}
          ${disabled ? 'disabled' : ''}
        />
        <span>${escapeHtml(label.text)}</span>
      </label>
    `;
}

function renderSchemaField(field, index, sqliteOutput) {
    const isArray = field.type === 'array';
    const autoIncrementAllowed = field.type === 'integer' && field.primaryKey;

    return `
      <div class="text-to-struct-schema-row" data-text-to-struct-field-row="${escapeHtml(field.id)}">
        <div class="text-to-struct-schema-row__main">
          <label class="text-to-struct-control">
            <span class="text-to-struct-label">Property name</span>
            <input
              class="control-input text-to-struct-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
              data-bind="text-to-struct-field"
              data-column-id="${escapeHtml(field.id)}"
              data-field="name"
              maxlength="128"
              placeholder="field_${escapeHtml(String(index + 1))}"
              spellcheck="false"
              type="text"
              value="${escapeHtml(field.name)}"
            />
          </label>
          <label class="text-to-struct-control">
            <span class="text-to-struct-label">Type</span>
            <select
              class="control-select text-to-struct-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
              data-bind="text-to-struct-field"
              data-column-id="${escapeHtml(field.id)}"
              data-field="type"
            >
              ${renderOptions(TEXT_TO_STRUCT_FIELD_TYPES.map(type => [type, type]), field.type)}
            </select>
          </label>
          ${renderFieldCheckbox({ field, checked: field.required, label: { field: 'required', text: 'Required' } })}
          <button
            class="delete-button text-to-struct-remove-field"
            data-action="remove-text-to-struct-field"
            data-column-id="${escapeHtml(field.id)}"
            type="button"
          >
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
            <span>Remove</span>
          </button>
        </div>
        ${
            isArray
                ? `<label class="text-to-struct-control text-to-struct-schema-row__option">
                    <span class="text-to-struct-label">Array separator</span>
                    <input
                      class="control-input text-to-struct-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
                      data-bind="text-to-struct-field"
                      data-column-id="${escapeHtml(field.id)}"
                      data-field="separator"
                      maxlength="16"
                      type="text"
                      value="${escapeHtml(field.separator ?? ',')}"
                    />
                  </label>`
                : ''
        }
        ${
            sqliteOutput
                ? `<div class="text-to-struct-schema-row__sqlite" data-text-to-struct-sqlite-field-options>
                    ${renderFieldCheckbox({ field, checked: field.primaryKey, label: { field: 'primaryKey', text: 'Primary key' } })}
                    ${renderFieldCheckbox({
                        field,
                        checked: field.autoIncrement,
                        label: { field: 'autoIncrement', text: 'Auto increment' },
                        disabled: !autoIncrementAllowed,
                    })}
                    ${renderFieldCheckbox({ field, checked: field.unique, label: { field: 'unique', text: 'Unique' } })}
                  </div>`
                : ''
        }
      </div>
    `;
}

function renderDeduplicatePicker(textToStruct) {
    const availableFields = textToStruct.fields.map(field => String(field.name ?? '').trim()).filter(Boolean);
    const selected = new Set(textToStruct.deduplicateFields ?? []);
    const selectedLabel = selected.size ? `BY: ${[...selected].join(', ')}` : 'ALL FIELDS';

    return `
      <details class="dropdown-button dropdown-button--align-left text-to-struct-multipick" data-dropdown-button>
        <summary
          class="standard-button dropdown-button__toggle text-to-struct-multipick__toggle"
          title="${escapeHtml(selectedLabel)}"
        >
          <span class="text-to-struct-multipick__label">${escapeHtml(selectedLabel)}</span>
          <span class="material-symbols-outlined dropdown-button__chevron" aria-hidden="true">expand_more</span>
        </summary>
        <div class="dropdown-button__panel text-to-struct-multipick__panel">
          <div class="text-to-struct-multipick__header">DEDUPLICATE BY</div>
          <div class="text-to-struct-multipick__list custom-scrollbar">
            ${
                availableFields.length
                    ? availableFields
                          .map(
                              name => `<label class="standard-checkbox text-to-struct-multipick-row">
                                  <input
                                    data-bind="text-to-struct-deduplicate-field"
                                    data-field-name="${escapeHtml(name)}"
                                    type="checkbox"
                                    ${selected.has(name) ? 'checked' : ''}
                                  />
                                  <span title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                                </label>`,
                          )
                          .join('')
                    : '<div class="text-to-struct-multipick__empty">ADD NAMED SCHEMA FIELDS</div>'
            }
          </div>
          <button
            class="standard-button text-to-struct-multipick__reset"
            data-action="clear-text-to-struct-deduplicate-fields"
            type="button"
            ${selected.size ? '' : 'disabled'}
          >
            ALL FIELDS
          </button>
        </div>
      </details>
    `;
}

function renderParserOptions(textToStruct) {
    const { parser } = textToStruct;

    if (parser.type === 'delimiter') {
        return `
          <label class="text-to-struct-control">
            <span class="text-to-struct-label">Delimiter</span>
            <input class="control-input text-to-struct-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="text-to-struct-parser" data-field="delimiter" maxlength="16" type="text" value="${escapeHtml(parser.delimiter)}" />
          </label>
        `;
    }

    if (parser.type === 'key-value') {
        return `
          <label class="text-to-struct-control">
            <span class="text-to-struct-label">Separator</span>
            <input class="control-input text-to-struct-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="text-to-struct-parser" data-field="separator" maxlength="16" type="text" value="${escapeHtml(parser.separator)}" />
          </label>
        `;
    }

    if (parser.type === 'csv' || parser.type === 'tsv') {
        return `
          <label class="standard-checkbox">
            <input data-bind="text-to-struct-parser" data-field="header" type="checkbox" ${parser.header ? 'checked' : ''} />
            <span>Header</span>
          </label>
        `;
    }

    return '';
}

function renderConfiguration(textToStruct) {
    const sqliteOutput = textToStruct.output === 'sqlite';
    const validation = validateTextToStructFields(textToStruct.fields);

    return `
      <aside class="text-to-struct-config custom-scrollbar">
        <div class="text-to-struct-section">
          <h2 class="text-to-struct-section__title">Configuration</h2>
          <label class="text-to-struct-control">
            <span class="text-to-struct-label">Parser</span>
            <select class="control-select text-to-struct-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="text-to-struct-parser-type">
              ${renderOptions(PARSER_OPTIONS, textToStruct.parser.type)}
            </select>
          </label>
          ${renderParserOptions(textToStruct)}
        </div>

        <div class="text-to-struct-section">
          <div class="text-to-struct-section__heading-row">
            <h2 class="text-to-struct-section__title">Schema</h2>
            <span class="text-to-struct-count">${escapeHtml(formatNumber(textToStruct.fields.length))} FIELDS</span>
          </div>
          <div class="text-to-struct-schema-list">
            ${textToStruct.fields.map((field, index) => renderSchemaField(field, index, sqliteOutput)).join('')}
          </div>
          <div class="text-to-struct-validation ${validation.valid ? '' : 'is-visible'}" data-text-to-struct-validation role="alert">
            ${escapeHtml(validation.message)}
          </div>
          <button class="standard-button text-to-struct-add-field" data-action="add-text-to-struct-field" type="button">
            <span class="material-symbols-outlined" aria-hidden="true">add</span>
            Add field
          </button>
        </div>

        <div class="text-to-struct-section">
          <h2 class="text-to-struct-section__title">Deduplication</h2>
          <label class="standard-checkbox">
            <input data-bind="text-to-struct-deduplicate" type="checkbox" ${textToStruct.deduplicate ? 'checked' : ''} />
            <span>Deduplicate</span>
          </label>
          ${textToStruct.deduplicate ? renderDeduplicatePicker(textToStruct) : ''}
        </div>

        <div class="text-to-struct-section">
          <label class="text-to-struct-control">
            <span class="text-to-struct-label">Error handling</span>
            <select class="control-select text-to-struct-select w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="text-to-struct-error-mode">
              ${renderOptions(ERROR_OPTIONS, textToStruct.errors)}
            </select>
          </label>
        </div>

        ${
            sqliteOutput
                ? `<div class="text-to-struct-section" data-text-to-struct-sqlite-options>
                    <h2 class="text-to-struct-section__title">SQLite output</h2>
                    <label class="text-to-struct-control">
                      <span class="text-to-struct-label">Table name</span>
                      <input class="control-input text-to-struct-input w-full border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="text-to-struct-output-option" data-field="table" maxlength="128" spellcheck="false" type="text" value="${escapeHtml(textToStruct.outputOptions.table)}" />
                    </label>
                    <label class="standard-checkbox">
                      <input data-bind="text-to-struct-output-option" data-field="createTable" type="checkbox" ${textToStruct.outputOptions.createTable ? 'checked' : ''} />
                      <span>Create table</span>
                    </label>
                  </div>`
                : ''
        }
      </aside>
    `;
}

function getInputStats(input) {
    const text = String(input ?? '');
    return {
        lines: text ? text.split(/\r\n?|\n/).length : 0,
        characters: text.length,
    };
}

function renderInputPanel(textToStruct) {
    const stats = getInputStats(textToStruct.input);

    return `
      <section class="text-to-struct-panel text-to-struct-panel--input">
        <header class="text-to-struct-panel__header">
          <h2>Input</h2>
          <div class="text-to-struct-panel__actions">
            <span class="text-to-struct-stats" data-text-to-struct-input-stats>${escapeHtml(formatNumber(stats.lines))} LINES // ${escapeHtml(formatNumber(stats.characters))} CHARS</span>
            <button class="standard-button" data-action="clear-text-to-struct" type="button" ${textToStruct.input ? '' : 'disabled'}>
              <span class="material-symbols-outlined" aria-hidden="true">clear</span>
              Clear
            </button>
          </div>
        </header>
        <textarea
          class="text-to-struct-textarea custom-scrollbar"
          data-bind="text-to-struct-input"
          placeholder="Paste plain text here..."
          spellcheck="false"
        >${escapeHtml(textToStruct.input)}</textarea>
      </section>
    `;
}

function renderCollectedErrors(errors = []) {
    if (!errors.length) {
        return '';
    }

    return `
      <section class="text-to-struct-errors">
        <div class="text-to-struct-errors__header">Collected errors // ${escapeHtml(formatNumber(errors.length))}</div>
        <div class="text-to-struct-errors__list custom-scrollbar">
          ${errors
              .map(
                  error => `<article class="text-to-struct-error-item">
                      <div class="text-to-struct-error-item__row">ROW ${escapeHtml(String(error.row ?? '—'))}</div>
                      <div class="text-to-struct-error-item__property">${escapeHtml(error.property ?? 'UNKNOWN_PROPERTY')}</div>
                      <div class="text-to-struct-error-item__code">${escapeHtml(error.code ?? 'VALIDATION_ERROR')}</div>
                      <p>${escapeHtml(error.message ?? 'Invalid value.')}</p>
                    </article>`,
              )
              .join('')}
        </div>
      </section>
    `;
}

function renderResultStatus(textToStruct) {
    const metadata = textToStruct.result.metadata;

    if (!metadata) {
        return '';
    }

    const parts = [
        `${formatNumber(metadata.recordCount ?? textToStruct.result.records.length)} RECORDS`,
        ...(metadata.errorCount ? [`${formatNumber(metadata.errorCount)} ERRORS`] : []),
        OUTPUT_STATUS_LABELS[metadata.format] ?? String(metadata.format ?? textToStruct.output).toUpperCase(),
    ];

    return `<div class="text-to-struct-result-status">${escapeHtml(parts.join(' // '))}</div>`;
}

function renderOutputPanel(textToStruct) {
    const hasResult = Boolean(textToStruct.result.metadata);
    const output = String(textToStruct.result.output ?? '');

    return `
      <section class="text-to-struct-panel text-to-struct-panel--output">
        <header class="text-to-struct-panel__header">
          <h2>Output</h2>
          <div class="text-to-struct-panel__actions">
            <label class="text-to-struct-format-control">
              <span>Format</span>
              <select class="control-select text-to-struct-select border border-outline-variant/20 bg-surface-container-lowest text-sm text-on-surface outline-none transition-colors focus:border-primary-container" data-bind="text-to-struct-output">
                ${renderOptions(OUTPUT_OPTIONS, textToStruct.output)}
              </select>
            </label>
            <button class="standard-button" data-action="copy-text-to-struct-output" type="button" ${hasResult ? '' : 'disabled'}>
              <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
              Copy
            </button>
            <button class="standard-button" data-action="export-text-to-struct-output" type="button" ${hasResult ? '' : 'disabled'}>
              <span class="material-symbols-outlined" aria-hidden="true">download</span>
              Export
            </button>
            ${
                textToStruct.output === 'sqlite'
                    ? `<button class="standard-button" data-action="open-text-to-struct-in-editor" type="button" ${hasResult && output.trim() ? '' : 'disabled'}>
                        <span class="material-symbols-outlined" aria-hidden="true">terminal</span>
                        Open in SQL Editor
                      </button>`
                    : ''
            }
          </div>
        </header>
        ${
            textToStruct.error
                ? `<div class="text-to-struct-request-error" role="alert">
                    <strong>${escapeHtml(textToStruct.error.code ?? 'CONVERSION_FAILED')}</strong>
                    <span>${escapeHtml(textToStruct.error.message ?? 'Text conversion failed.')}</span>
                  </div>`
                : ''
        }
        ${
            hasResult
                ? `<pre class="text-to-struct-output custom-scrollbar" tabindex="0"><code>${escapeHtml(output)}</code></pre>
                   ${renderResultStatus(textToStruct)}
                   ${renderCollectedErrors(textToStruct.result.errors)}`
                : `<div class="text-to-struct-empty">
                    <span class="material-symbols-outlined" aria-hidden="true">data_object</span>
                    <strong>Structured output</strong>
                    <p>Paste text, define your schema and run conversion.</p>
                  </div>`
        }
      </section>
    `;
}

export function renderTextToStructView(state) {
    const textToStruct = state.textToStruct;
    const validation = validateTextToStructFields(textToStruct.fields);
    const convertDisabled = textToStruct.converting || !textToStruct.input.trim() || !validation.valid;
    const actions = `
      <button
        class="signature-button"
        data-action="convert-text-to-struct"
        data-text-to-struct-convert
        type="button"
        ${convertDisabled ? 'disabled' : ''}
      >
        <span class="material-symbols-outlined" aria-hidden="true">data_object</span>
        ${textToStruct.converting ? 'Converting...' : 'Convert'}
      </button>
    `;

    return {
        main: `
          <section class="text-to-struct-view view-surface">
            <div class="text-to-struct-view__header">
              ${renderPageHeader({ eyebrow: 'Workspace', title: 'Text2Struct', actions })}
            </div>
            <div class="text-to-struct-layout">
              ${renderConfiguration(textToStruct)}
              <main class="text-to-struct-workspace">
                ${renderInputPanel(textToStruct)}
                ${renderOutputPanel(textToStruct)}
              </main>
            </div>
          </section>
        `,
        panel: '',
    };
}

export { getInputStats };
