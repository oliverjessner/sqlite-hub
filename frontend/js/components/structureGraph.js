import { showToast } from '../store.js';
import { replaceChildrenFromRenderedMarkup } from '../utils/dom.js';
import { escapeHtml, formatNumber } from '../utils/format.js';

let cytoscapeFactory = null;
let currentGraph = null;
let mountVersion = 0;
let persistedGraphState = null;

function getTableId(tableName) {
    return `table:${tableName}`;
}

function getSchemaSignature(schema) {
    return JSON.stringify(
        (schema?.tables ?? []).map(table => ({
            name: table.name,
            columns: (table.columns ?? []).map(column => column.name),
            foreignKeys: (table.foreignKeys ?? []).map(foreignKey => ({
                referencedTable: foreignKey.referencedTable,
                mappings: (foreignKey.mappings ?? []).map(
                    mapping => `${mapping.from || '?'}->${mapping.to || 'rowid'}`,
                ),
            })),
        })),
    );
}

function getPersistedGraphState(schema) {
    const schemaSignature = getSchemaSignature(schema);

    if (persistedGraphState?.schemaSignature !== schemaSignature) {
        return {
            schemaSignature,
            state: null,
        };
    }

    return {
        schemaSignature,
        state: persistedGraphState,
    };
}

function collectForeignKeyColumns(tableData) {
    const columns = new Set();

    (tableData?.foreignKeys ?? []).forEach(foreignKey => {
        (foreignKey.mappings ?? []).forEach(mapping => {
            if (mapping.from) {
                columns.add(mapping.from);
            }
        });
    });

    return columns;
}

function getVisibleColumns(tableData) {
    return (tableData?.columns ?? []).filter(column => column.visible !== false);
}

function getRelationshipCount(tableData) {
    return (tableData?.foreignKeys ?? []).reduce((count, foreignKey) => count + (foreignKey.mappings?.length ?? 0), 0);
}

function createSummaryCard(label, value) {
    return `
    <div class="structure-graph__summary-card">
      <div class="structure-graph__summary-label">${escapeHtml(label)}</div>
      <div class="structure-graph__summary-value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function createColumnFlags(column, foreignKeyColumns) {
    const flags = [];

    if (column.primaryKeyPosition > 0) {
        flags.push(
            `<span class="structure-graph__flag is-key">PK${
                column.primaryKeyPosition > 1 ? ` ${escapeHtml(String(column.primaryKeyPosition))}` : ''
            }</span>`,
        );
    }

    if (foreignKeyColumns.has(column.name)) {
        flags.push('<span class="structure-graph__flag is-link">FK</span>');
    }

    flags.push(`<span class="structure-graph__flag is-nullable">${column.notNull ? 'NOT NULL' : 'NULLABLE'}</span>`);

    return flags.join('');
}

export function renderDdlSection(ddl, emptyLabel = 'No DDL available.') {
    const ddlText = typeof ddl === 'string' ? ddl : '';
    const hasDdl = Boolean(ddlText.trim());

    return `
    <section class="structure-graph__section">
      <div class="structure-graph__section-header">
        <div class="structure-graph__section-title">DDL</div>
        <button
          class="standard-button"
          data-structure-graph-action="copy-ddl"
          ${hasDdl ? '' : 'disabled'}
          type="button"
        >
          <span class="material-symbols-outlined text-sm">content_copy</span>
          Copy to clipboard
        </button>
      </div>
      <pre class="structure-graph__ddl custom-scrollbar" data-structure-graph-ddl>${escapeHtml(
          hasDdl ? ddlText : emptyLabel,
      )}</pre>
    </section>
  `;
}

export function clearInspector() {
    return `
    <div class="structure-graph__panel is-empty">
      <span class="material-symbols-outlined structure-graph__empty-icon">hub</span>
      <div class="structure-graph__title">Graph Ready</div>
      <p class="text-sm leading-7 text-on-surface-variant/55">
        Select a table node to inspect its columns, key markers, and foreign-key links.
      </p>
    </div>
  `;
}

export function renderInspector(tableData) {
    if (!tableData || tableData.type !== 'table') {
        return clearInspector();
    }

    const visibleColumns = getVisibleColumns(tableData);
    const foreignKeyColumns = collectForeignKeyColumns(tableData);
    const primaryKeyCount = visibleColumns.filter(column => column.primaryKeyPosition > 0).length;
    const foreignKeyCount = getRelationshipCount(tableData);
    const nullableCount = visibleColumns.filter(column => !column.notNull).length;

    return `
    <div class="structure-graph__panel">
      <div class="space-y-3">
        <div class="structure-graph__eyebrow">Table Inspector</div>
        <div class="structure-graph__title">${escapeHtml(tableData.name)}</div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="structure-graph__subtitle">${escapeHtml(tableData.type)}</div>
        </div>
      </div>

      <div class="structure-graph__summary">
        ${createSummaryCard('Columns', formatNumber(visibleColumns.length))}
        ${createSummaryCard('PK Columns', formatNumber(primaryKeyCount))}
        ${createSummaryCard('FK Links', formatNumber(foreignKeyCount))}
        ${createSummaryCard('Nullable', formatNumber(nullableCount))}
      </div>

      <section class="structure-graph__section">
        <div class="structure-graph__section-title">Columns</div>
        <div class="structure-graph__column-list">
          ${
              visibleColumns.length
                  ? visibleColumns
                        .map(
                            column => `
                      <div class="structure-graph__column-row">
                        <div class="min-w-0 space-y-1">
                          <div class="structure-graph__column-name">${escapeHtml(column.name)}</div>
                          <div class="structure-graph__column-type">${escapeHtml(
                              column.declaredType || column.affinity || 'BLOB',
                          )}</div>
                        </div>
                        <div class="structure-graph__column-flags">
                          ${createColumnFlags(column, foreignKeyColumns)}
                        </div>
                      </div>
                    `,
                        )
                        .join('')
                  : '<div class="text-sm text-on-surface-variant/45">No visible columns found.</div>'
          }
        </div>
      </section>

      ${renderDdlSection(tableData.ddl)}
    </div>
  `;
}

export function buildGraphElements(schema) {
    const tables = schema?.tables ?? [];
    const tableMap = new Map(tables.map(table => [table.name, table]));
    const nodes = tables.map(table => ({
        group: 'nodes',
        data: {
            id: getTableId(table.name),
            label: table.name,
            tableName: table.name,
            width: Math.max(184, table.name.length * 9 + 64),
            height: 56,
            table,
        },
    }));
    const edges = [];

    tables.forEach(table => {
        (table.foreignKeys ?? []).forEach((foreignKey, foreignKeyIndex) => {
            if (!tableMap.has(foreignKey.referencedTable)) {
                return;
            }

            (foreignKey.mappings ?? []).forEach((mapping, mappingIndex) => {
                edges.push({
                    group: 'edges',
                    data: {
                        id: [
                            'edge',
                            table.name,
                            foreignKey.referencedTable,
                            mapping.from || `source_${mappingIndex}`,
                            mapping.to || `target_${mappingIndex}`,
                            foreignKeyIndex,
                            mappingIndex,
                        ].join(':'),
                        source: getTableId(table.name),
                        target: getTableId(foreignKey.referencedTable),
                        label: `${mapping.from || '?'} → ${mapping.to || 'rowid'}`,
                        sourceTable: table.name,
                        targetTable: foreignKey.referencedTable,
                        sourceColumn: mapping.from || '',
                        targetColumn: mapping.to || 'rowid',
                    },
                });
            });
        });
    });

    return [...nodes, ...edges];
}

export function getElkLayoutOptions(overrides = {}) {
    return {
        name: 'elk',
        fit: false,
        padding: 30,
        animate: false,
        nodeDimensionsIncludeLabels: false,
        elk: {
            algorithm: 'layered',
            'elk.direction': 'RIGHT',
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.spacing.nodeNodeBetweenLayers': 60,
            'elk.spacing.nodeNode': 40,
            'elk.padding': 30,
        },
        ...overrides,
    };
}

export function createCytoscapeInstance(container, elements) {
    if (!cytoscapeFactory) {
        throw new Error('Cytoscape runtime has not been initialized.');
    }

    return cytoscapeFactory({
        container,
        elements,
        layout: { name: 'preset' },
        minZoom: 0.2,
        maxZoom: 2.5,
        wheelSensitivity: 0.18,
        motionBlur: false,
        textureOnViewport: true,
        boxSelectionEnabled: false,
        style: [
            {
                selector: 'node',
                style: {
                    shape: 'roundrectangle',
                    width: 'data(width)',
                    height: 'data(height)',
                    label: 'data(label)',
                    'background-color': '#262421',
                    'border-color': '#8a7b34',
                    'border-width': 1.4,
                    color: '#f4efe8',
                    'font-family': 'Space Grotesk, Inter, sans-serif',
                    'font-size': 13,
                    'font-weight': 700,
                    'text-wrap': 'ellipsis',
                    'text-max-width': 150,
                    'text-halign': 'center',
                    'text-valign': 'center',
                    'overlay-opacity': 0,
                    'transition-property': 'background-color, border-color, opacity, color',
                    'transition-duration': '140ms',
                },
            },
            {
                selector: 'node.selected',
                style: {
                    'background-color': '#3b340b',
                    'border-color': '#fce300',
                    'border-width': 2.8,
                    color: '#fff6ae',
                },
            },
            {
                selector: 'node.related',
                style: {
                    'background-color': '#0d2d30',
                    'border-color': '#2dfaff',
                    'border-width': 2.2,
                    color: '#fbfffe',
                },
            },
            {
                selector: 'node.dimmed',
                style: {
                    opacity: 0.24,
                },
            },
            {
                selector: 'edge',
                style: {
                    width: 1.6,
                    label: 'data(label)',
                    color: '#e7dfbd',
                    'font-family': 'Roboto Mono, monospace',
                    'font-size': 8,
                    'text-background-color': '#171715',
                    'text-background-opacity': 0.94,
                    'text-background-padding': 4,
                    'line-color': '#8a7b34',
                    'target-arrow-color': '#8a7b34',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'taxi',
                    'taxi-direction': 'rightward',
                    'taxi-turn': 20,
                    'source-endpoint': 'outside-to-node',
                    'target-endpoint': 'outside-to-node',
                    'overlay-opacity': 0,
                    'transition-property': 'line-color, target-arrow-color, opacity, color',
                    'transition-duration': '120ms',
                },
            },
            {
                selector: 'edge.related',
                style: {
                    'line-color': '#2dfaff',
                    'target-arrow-color': '#2dfaff',
                    color: '#fbfffe',
                    width: 2.3,
                },
            },
            {
                selector: 'edge.hovered',
                style: {
                    'line-color': '#fce300',
                    'target-arrow-color': '#fce300',
                    color: '#fff6ae',
                    width: 2.8,
                },
            },
            {
                selector: 'edge.dimmed',
                style: {
                    opacity: 0.16,
                },
            },
        ],
    });
}

export function resetHighlights(cy) {
    if (!cy) {
        return;
    }

    cy.elements().removeClass('selected related hovered dimmed');
}

export function highlightConnectedElements(cy, element) {
    if (!cy || !element) {
        return;
    }

    resetHighlights(cy);
    const allElements = cy.elements();

    if (element.isNode()) {
        const connectedEdges = element.connectedEdges();
        const relatedNodes = connectedEdges.connectedNodes().union(element);
        const highlighted = relatedNodes.union(connectedEdges);

        allElements.difference(highlighted).addClass('dimmed');
        element.addClass('selected');
        relatedNodes.difference(element).addClass('related');
        connectedEdges.addClass('related');
        return;
    }

    const source = element.source();
    const target = element.target();
    const highlighted = source.union(target).union(element);

    allElements.difference(highlighted).addClass('dimmed');
    source.addClass('related');
    target.addClass('related');
    element.addClass('hovered');
}

function destroyCurrentGraph() {
    if (!currentGraph) {
        return;
    }

    if (currentGraph.cy && currentGraph.persistStateOnDestroy !== false) {
        const nodePositions = {};
        currentGraph.cy.nodes().forEach(node => {
            nodePositions[node.id()] = {
                x: node.position('x'),
                y: node.position('y'),
            };
        });

        persistedGraphState = {
            schemaSignature: getSchemaSignature(currentGraph.schema),
            nodePositions,
            pan: currentGraph.cy.pan(),
            zoom: currentGraph.cy.zoom(),
            inspectorHidden: currentGraph.inspectorHidden,
            selectedTableName: currentGraph.selectedTableName,
        };
    }

    currentGraph.cleanup.forEach(cleanup => cleanup());
    currentGraph.cleanup = [];

    if (currentGraph.resizeObserver) {
        currentGraph.resizeObserver.disconnect();
    }

    if (currentGraph.resizeHandler) {
        window.removeEventListener('resize', currentGraph.resizeHandler);
    }

    if (currentGraph.cy) {
        currentGraph.cy.destroy();
    }

    currentGraph = null;
}

export function resetPersistedStructureGraphState() {
    persistedGraphState = null;

    if (currentGraph) {
        currentGraph.persistStateOnDestroy = false;
    }
}

function syncEntryHighlights(selectedNames = [], relatedNames = []) {
    if (!currentGraph?.root) {
        return;
    }

    const selectedSet = new Set(selectedNames);
    const relatedSet = new Set(relatedNames);
    const scope = currentGraph.root.closest('.view-frame') ?? document;

    scope.querySelectorAll('[data-structure-entry-name]').forEach(node => {
        const tableName = node.dataset.structureEntryName ?? '';
        node.classList.toggle('structure-entry--graph-active', selectedSet.has(tableName));
        node.classList.toggle('structure-entry--graph-related', relatedSet.has(tableName));
    });
}

function getDefaultInspectorMarkup() {
    if (!currentGraph) {
        return clearInspector();
    }

    return currentGraph.initialSelectedTableName
        ? clearInspector()
        : currentGraph.initialInspectorMarkup || clearInspector();
}

function updateOpenDataButton() {
    if (!currentGraph?.openDataButton) {
        return;
    }

    const isEnabled = Boolean(currentGraph.selectedTableName);
    currentGraph.openDataButton.disabled = !isEnabled;
    currentGraph.openDataButton.classList.toggle('is-disabled', !isEnabled);
}

async function copyInspectorDdl(button) {
    const ddlNode = button?.closest('.structure-graph__section')?.querySelector('[data-structure-graph-ddl]');
    const ddl = ddlNode?.textContent ?? '';

    if (!ddl.trim()) {
        showToast('No DDL available to copy.', 'alert');
        return;
    }

    try {
        await navigator.clipboard.writeText(ddl);
        showToast('DDL copied.', 'success');
    } catch (error) {
        showToast('Clipboard access failed.', 'alert');
    }
}

function syncInspectorLayout() {
    if (!currentGraph?.root) {
        return;
    }

    currentGraph.root.classList.toggle('is-inspector-hidden', currentGraph.inspectorHidden);
    currentGraph.cy?.resize();
}

function updateInspectorToggleButton() {
    if (!currentGraph?.inspectorToggleButton) {
        return;
    }

    currentGraph.inspectorToggleButton.classList.toggle('is-active', currentGraph.inspectorHidden);
    const icon = document.createElement('span');
    const label = currentGraph.inspectorHidden ? 'Show Inspector' : 'Hide Inspector';

    icon.className = 'material-symbols-outlined text-sm';
    icon.textContent = currentGraph.inspectorHidden ? 'right_panel_open' : 'right_panel_close';
    currentGraph.inspectorToggleButton.replaceChildren(icon, document.createTextNode(` ${label}`));
}

function clearSelection() {
    if (!currentGraph) {
        return;
    }

    currentGraph.selectedTableName = null;
    resetHighlights(currentGraph.cy);
    syncEntryHighlights();
    replaceChildrenFromRenderedMarkup(currentGraph.inspector, getDefaultInspectorMarkup());
    updateOpenDataButton();
}

function applyTableSelection(node, { focus = true } = {}) {
    if (!currentGraph || !node) {
        return null;
    }

    const tableData = node.data('table');
    currentGraph.selectedTableName = tableData.name;
    replaceChildrenFromRenderedMarkup(currentGraph.inspector, renderInspector(tableData));
    highlightConnectedElements(currentGraph.cy, node);
    syncEntryHighlights([tableData.name]);
    updateOpenDataButton();

    if (focus) {
        currentGraph.cy.animate(
            {
                fit: {
                    eles: node.closedNeighborhood(),
                    padding: 120,
                },
                duration: 240,
            },
            {
                queue: false,
            },
        );
    }

    return node;
}

function restoreGraphState() {
    if (!currentGraph) {
        return;
    }

    if (currentGraph.selectedTableName) {
        const selectedNode = currentGraph.cy.getElementById(getTableId(currentGraph.selectedTableName));

        if (selectedNode.nonempty()) {
            highlightConnectedElements(currentGraph.cy, selectedNode);
            syncEntryHighlights([currentGraph.selectedTableName]);
            return;
        }
    }

    resetHighlights(currentGraph.cy);
    syncEntryHighlights();
    updateOpenDataButton();
}

function runLayout(cy, onStop) {
    const layout = cy.layout(
        getElkLayoutOptions({
            stop: () => {
                cy.fit(cy.elements(), 60);
                if (typeof onStop === 'function') {
                    onStop();
                }
            },
        }),
    );

    layout.run();
}

function restorePersistedViewport(cy, persistedState) {
    if (!persistedState?.nodePositions) {
        return false;
    }

    cy.batch(() => {
        cy.nodes().forEach(node => {
            const nextPosition = persistedState.nodePositions[node.id()];

            if (!nextPosition) {
                return;
            }

            node.position(nextPosition);
        });
    });

    if (typeof persistedState.zoom === 'number') {
        cy.zoom(persistedState.zoom);
    }

    if (persistedState.pan) {
        cy.pan(persistedState.pan);
    }

    return true;
}

export function setupToolbar(cy) {
    if (!currentGraph) {
        return () => {};
    }

    const { root } = currentGraph;
    const openDataButton = root.querySelector('[data-structure-graph-action="open-data"]');
    const inspectorToggleButton = root.querySelector('[data-structure-graph-action="toggle-inspector"]');

    currentGraph.openDataButton = openDataButton;
    currentGraph.inspectorToggleButton = inspectorToggleButton;
    updateOpenDataButton();
    updateInspectorToggleButton();
    syncInspectorLayout();

    const onToolbarClick = async event => {
        const button = event.target.closest('[data-structure-graph-action]');

        if (!button) {
            return;
        }

        switch (button.dataset.structureGraphAction) {
            case 'fit':
                cy.fit(cy.elements(), 60);
                break;
            case 'relayout':
                runLayout(cy, () => {
                    if (currentGraph?.selectedTableName) {
                        const selectedNode = cy.getElementById(getTableId(currentGraph.selectedTableName));
                        if (selectedNode.nonempty()) {
                            applyTableSelection(selectedNode, { focus: true });
                        }
                    }
                });
                break;
            case 'clear':
                clearSelection();
                break;
            case 'open-data':
                if (currentGraph?.selectedTableName) {
                    window.location.hash = `#/data/${encodeURIComponent(currentGraph.selectedTableName)}`;
                }
                break;
            case 'toggle-inspector':
                currentGraph.inspectorHidden = !currentGraph.inspectorHidden;
                updateInspectorToggleButton();
                syncInspectorLayout();
                break;
            case 'copy-ddl':
                await copyInspectorDdl(button);
                break;
            default:
        }
    };

    root.addEventListener('click', onToolbarClick);

    return () => {
        root.removeEventListener('click', onToolbarClick);
    };
}

export function teardownStructureGraph() {
    mountVersion += 1;
    destroyCurrentGraph();
}

export async function mountStructureGraph(snapshot) {
    const root = document.querySelector('[data-structure-graph-root]');

    if (!root) {
        teardownStructureGraph();
        return;
    }

    const version = ++mountVersion;
    destroyCurrentGraph();

    const [{ getCytoscape }] = await Promise.all([import('../lib/cytoscapeRuntime.js')]);

    if (version !== mountVersion || !root.isConnected) {
        return;
    }

    cytoscapeFactory = getCytoscape();

    const canvas = root.querySelector('[data-structure-graph-canvas]');
    const inspector = root.querySelector('[data-structure-graph-inspector]');
    const empty = root.querySelector('[data-structure-graph-empty]');
    const schema = snapshot.structure.data?.graph ?? { tables: [] };
    const { schemaSignature, state: cachedState } = getPersistedGraphState(schema);

    if (!(canvas instanceof HTMLElement) || !(inspector instanceof HTMLElement)) {
        return;
    }

    if (!schema.tables?.length) {
        empty?.removeAttribute('hidden');
        replaceChildrenFromRenderedMarkup(inspector, clearInspector());
        return;
    }

    empty?.setAttribute('hidden', 'hidden');

    const cy = createCytoscapeInstance(canvas, buildGraphElements(schema));

    currentGraph = {
        root,
        canvas,
        inspector,
        initialInspectorMarkup: inspector.innerHTML,
        initialSelectedTableName: null,
        schemaSignature,
        schema,
        cy,
        cleanup: [],
        resizeObserver: null,
        resizeHandler: null,
        openDataButton: null,
        inspectorToggleButton: null,
        inspectorHidden: cachedState?.inspectorHidden ?? false,
        persistStateOnDestroy: true,
        selectedTableName: null,
    };

    currentGraph.cleanup.push(setupToolbar(cy));

    cy.on('tap', 'node', event => {
        applyTableSelection(event.target, { focus: false });
    });

    cy.on('tap', event => {
        if (event.target === cy) {
            clearSelection();
        }
    });

    cy.on('mouseover', 'edge', event => {
        const edge = event.target;
        highlightConnectedElements(cy, edge);
        syncEntryHighlights([], [edge.data('sourceTable'), edge.data('targetTable')]);
    });

    cy.on('mouseout', 'edge', () => {
        restoreGraphState();
    });

    const selectedTableName = snapshot.structure.data?.grouped?.tables?.some(
        table => table.name === snapshot.structure.selectedName,
    )
        ? snapshot.structure.selectedName
        : null;

    currentGraph.initialSelectedTableName = selectedTableName;

    if (restorePersistedViewport(cy, cachedState)) {
        if (selectedTableName) {
            const selectedNode = cy.getElementById(getTableId(selectedTableName));
            if (selectedNode.nonempty()) {
                applyTableSelection(selectedNode, { focus: false });
            } else {
                restoreGraphState();
            }
        } else {
            restoreGraphState();
        }
    } else {
        runLayout(cy, () => {
            if (!currentGraph || version !== mountVersion) {
                return;
            }

            if (selectedTableName) {
                const selectedNode = cy.getElementById(getTableId(selectedTableName));
                if (selectedNode.nonempty()) {
                    applyTableSelection(selectedNode, { focus: false });
                }
            }
        });
    }

    if (typeof ResizeObserver === 'function') {
        currentGraph.resizeObserver = new ResizeObserver(() => {
            cy.resize();
        });
        currentGraph.resizeObserver.observe(canvas);
    } else {
        currentGraph.resizeHandler = () => {
            cy.resize();
        };
        window.addEventListener('resize', currentGraph.resizeHandler);
    }
}
