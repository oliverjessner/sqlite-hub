import { showToast } from '../store.js';
import { replaceChildrenFromRenderedMarkup } from '../utils/dom.js';
import { escapeHtml, formatNumber } from '../utils/format.js';

let cytoscapeFactory = null;
let currentGraph = null;
let mountVersion = 0;
let persistedGraphState = null;
const STRUCTURE_INSPECTOR_VISIBLE_STORAGE_KEY = 'sqlite_hub_structure_inspector_visible';
const STRUCTURE_GRAPH_STATE_STORAGE_PREFIX = 'sqlite_hub_structure_graph_state';
const STRUCTURE_GRAPH_STATE_STORAGE_VERSION = 1;

function getHash(input) {
    let hash = 2166136261;
    const text = String(input ?? '');

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
}

function getGraphStateStorageKey(schemaSignature) {
    return `${STRUCTURE_GRAPH_STATE_STORAGE_PREFIX}:${getHash(schemaSignature)}`;
}

function readStoredInspectorHidden() {
    try {
        const value = globalThis.localStorage?.getItem(STRUCTURE_INSPECTOR_VISIBLE_STORAGE_KEY);

        if (value === 'true') {
            return false;
        }

        if (value === 'false') {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

function storeInspectorHidden(hidden) {
    try {
        globalThis.localStorage?.setItem(STRUCTURE_INSPECTOR_VISIBLE_STORAGE_KEY, String(!hidden));
    } catch {
        // Ignore unavailable browser storage; the in-memory setting still applies.
    }
}

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

function normalizeGraphNodePositions(nodePositions) {
    if (!nodePositions || typeof nodePositions !== 'object') {
        return null;
    }

    const normalized = {};

    Object.entries(nodePositions).forEach(([nodeId, position]) => {
        if (!position || typeof position !== 'object') {
            return;
        }

        const x = Number(position.x);
        const y = Number(position.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        normalized[nodeId] = { x, y };
    });

    return Object.keys(normalized).length ? normalized : null;
}

function normalizeGraphStatePayload(payload, schemaSignature) {
    if (
        !payload ||
        typeof payload !== 'object' ||
        payload.version !== STRUCTURE_GRAPH_STATE_STORAGE_VERSION ||
        payload.schemaSignature !== schemaSignature
    ) {
        return null;
    }

    const nodePositions = normalizeGraphNodePositions(payload.nodePositions);

    if (!nodePositions) {
        return null;
    }

    const zoom = Number(payload.zoom);
    const panX = Number(payload.pan?.x);
    const panY = Number(payload.pan?.y);

    return {
        schemaSignature,
        nodePositions,
        pan: Number.isFinite(panX) && Number.isFinite(panY) ? { x: panX, y: panY } : null,
        zoom: Number.isFinite(zoom) ? zoom : null,
        inspectorHidden: Boolean(payload.inspectorHidden),
        selectedTableName: typeof payload.selectedTableName === 'string' ? payload.selectedTableName : null,
        layoutVariant: Number.isFinite(Number(payload.layoutVariant)) ? Number(payload.layoutVariant) : 0,
    };
}

function readStoredGraphState(schemaSignature) {
    try {
        const rawValue = globalThis.localStorage?.getItem(getGraphStateStorageKey(schemaSignature));

        if (!rawValue) {
            return null;
        }

        return normalizeGraphStatePayload(JSON.parse(rawValue), schemaSignature);
    } catch {
        return null;
    }
}

function writeStoredGraphState(graphState) {
    if (!graphState?.schemaSignature || !graphState.nodePositions) {
        return false;
    }

    try {
        globalThis.localStorage?.setItem(
            getGraphStateStorageKey(graphState.schemaSignature),
            JSON.stringify({
                version: STRUCTURE_GRAPH_STATE_STORAGE_VERSION,
                schemaSignature: graphState.schemaSignature,
                nodePositions: graphState.nodePositions,
                pan: graphState.pan ?? null,
                zoom: graphState.zoom ?? null,
                inspectorHidden: Boolean(graphState.inspectorHidden),
                selectedTableName: graphState.selectedTableName ?? null,
                layoutVariant: Number.isFinite(Number(graphState.layoutVariant)) ? Number(graphState.layoutVariant) : 0,
                savedAt: new Date().toISOString(),
            }),
        );
        return true;
    } catch {
        return false;
    }
}

function getPersistedGraphState(schema) {
    const schemaSignature = getSchemaSignature(schema);

    if (persistedGraphState?.schemaSignature === schemaSignature) {
        return {
            schemaSignature,
            state: persistedGraphState,
        };
    }

    const storedState = readStoredGraphState(schemaSignature);
    persistedGraphState = storedState;

    return {
        schemaSignature,
        state: storedState,
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

function getReadableLayoutGeometry(variant = 0) {
    return {
        connectedBaseY: 150,
        isolatedY: -170,
        isolatedSpacing: 380,
        rankSpacing: 440,
        rowSpacing: 230,
        variant,
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
                    'background-color': '#302b12',
                    'border-color': '#c0a31d',
                    'border-width': 1.8,
                    color: '#fff8dc',
                    'font-family': 'Space Grotesk, Inter, sans-serif',
                    'font-size': 13.5,
                    'font-weight': 700,
                    'text-wrap': 'ellipsis',
                    'text-max-width': 170,
                    'text-halign': 'center',
                    'text-valign': 'center',
                    'text-outline-color': '#11100b',
                    'text-outline-width': 1.5,
                    'overlay-opacity': 0,
                    'transition-property': 'background-color, border-color, opacity, color, width',
                    'transition-duration': '140ms',
                },
            },
            {
                selector: 'node.selected',
                style: {
                    'background-color': '#5a4e00',
                    'border-color': '#ffea00',
                    'border-width': 3.2,
                    color: '#fffbd3',
                },
            },
            {
                selector: 'node.related',
                style: {
                    'background-color': '#06454a',
                    'border-color': '#1ef6ff',
                    'border-width': 2.8,
                    color: '#edfeff',
                },
            },
            {
                selector: 'node.dimmed',
                style: {
                    opacity: 0.46,
                },
            },
            {
                selector: 'edge',
                style: {
                    width: 2.2,
                    label: 'data(label)',
                    color: '#fff5b8',
                    'font-family': 'Roboto Mono, monospace',
                    'font-size': 9.5,
                    'font-weight': 700,
                    'text-background-color': '#050706',
                    'text-background-opacity': 0.98,
                    'text-background-padding': 5,
                    'text-background-shape': 'roundrectangle',
                    'text-border-color': '#3d3510',
                    'text-border-opacity': 0.9,
                    'text-border-width': 1,
                    'text-outline-color': '#050706',
                    'text-outline-width': 1.8,
                    'text-wrap': 'wrap',
                    'text-max-width': 170,
                    'text-margin-y': -7,
                    'line-color': '#c8a81d',
                    'target-arrow-color': '#c8a81d',
                    'arrow-scale': 1.18,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'control-point-step-size': 82,
                    'loop-direction': '45deg',
                    'loop-sweep': '90deg',
                    'source-endpoint': 'outside-to-node',
                    'target-endpoint': 'outside-to-node',
                    'overlay-opacity': 0,
                    'z-index': 1,
                    'transition-property': 'line-color, target-arrow-color, opacity, color, width',
                    'transition-duration': '120ms',
                },
            },
            {
                selector: 'edge.related',
                style: {
                    'line-color': '#1ef6ff',
                    'target-arrow-color': '#1ef6ff',
                    color: '#edfeff',
                    'text-border-color': '#1ef6ff',
                    width: 3.1,
                    'z-index': 24,
                },
            },
            {
                selector: 'edge.hovered',
                style: {
                    'line-color': '#ffea00',
                    'target-arrow-color': '#ffea00',
                    'arrow-scale': 1.35,
                    color: '#fffbd3',
                    'text-border-color': '#ffea00',
                    width: 3.6,
                    'z-index': 32,
                },
            },
            {
                selector: 'edge.dimmed',
                style: {
                    opacity: 0.36,
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

function formatQualifiedEdgeColumn(tableName, columnName) {
    const safeTableName = String(tableName || '?');
    const safeColumnName = String(columnName || 'rowid');

    return `${safeTableName}.${safeColumnName}`;
}

function positionEdgeReadout(renderedPosition) {
    if (!currentGraph?.edgeReadout || !currentGraph.canvasShell || !renderedPosition) {
        return;
    }

    const readout = currentGraph.edgeReadout;
    const shell = currentGraph.canvasShell;
    const width = readout.offsetWidth || 280;
    const height = readout.offsetHeight || 64;
    const maxLeft = Math.max(12, shell.clientWidth - width - 12);
    const maxTop = Math.max(12, shell.clientHeight - height - 12);
    const left = Math.min(Math.max(renderedPosition.x + 16, 12), maxLeft);
    const top = Math.min(Math.max(renderedPosition.y - height / 2, 12), maxTop);

    readout.style.left = `${left}px`;
    readout.style.top = `${top}px`;
}

function showEdgeReadout(edge, renderedPosition) {
    if (!currentGraph?.edgeReadout || !edge) {
        return;
    }

    const sourceTable = edge.data('sourceTable') || edge.source().data('tableName') || '?';
    const targetTable = edge.data('targetTable') || edge.target().data('tableName') || '?';
    const sourceColumn = edge.data('sourceColumn') || '?';
    const targetColumn = edge.data('targetColumn') || 'rowid';
    const sourceLabel = formatQualifiedEdgeColumn(sourceTable, sourceColumn);
    const targetLabel = formatQualifiedEdgeColumn(targetTable, targetColumn);

    currentGraph.edgeReadout.innerHTML = `
      <div class="structure-graph__edge-readout-meta">
        ${escapeHtml(sourceTable)} <span aria-hidden="true">→</span> ${escapeHtml(targetTable)}
      </div>
      <div class="structure-graph__edge-readout-path">
        ${escapeHtml(sourceLabel)} <span aria-hidden="true">→</span> ${escapeHtml(targetLabel)}
      </div>
    `;
    currentGraph.edgeReadout.removeAttribute('hidden');
    positionEdgeReadout(renderedPosition);
}

function hideEdgeReadout() {
    if (!currentGraph?.edgeReadout) {
        return;
    }

    currentGraph.edgeReadout.setAttribute('hidden', 'hidden');
}

function createGraphStateSnapshot(graph = currentGraph) {
    if (!graph?.cy) {
        return null;
    }

    const nodePositions = {};

    graph.cy.nodes().forEach(node => {
        const x = node.position('x');
        const y = node.position('y');

        if (Number.isFinite(x) && Number.isFinite(y)) {
            nodePositions[node.id()] = { x, y };
        }
    });

    if (!Object.keys(nodePositions).length) {
        return null;
    }

    return {
        schemaSignature: getSchemaSignature(graph.schema),
        nodePositions,
        pan: graph.cy.pan(),
        zoom: graph.cy.zoom(),
        inspectorHidden: graph.inspectorHidden,
        selectedTableName: graph.selectedTableName,
        layoutVariant: graph.layoutVariant ?? 0,
    };
}

function persistCurrentGraphState({ persistToStorage = true } = {}) {
    const graphState = createGraphStateSnapshot();

    if (!graphState) {
        return false;
    }

    persistedGraphState = graphState;

    if (persistToStorage) {
        writeStoredGraphState(graphState);
    }

    return true;
}

function scheduleGraphStatePersist(delay = 180) {
    if (!currentGraph || currentGraph.persistStateOnDestroy === false) {
        return;
    }

    if (currentGraph.persistTimer) {
        window.clearTimeout(currentGraph.persistTimer);
    }

    currentGraph.persistTimer = window.setTimeout(() => {
        if (!currentGraph || currentGraph.persistStateOnDestroy === false) {
            return;
        }

        currentGraph.persistTimer = null;
        persistCurrentGraphState();
    }, delay);
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
        persistCurrentGraphState();
    }

    currentGraph.cleanup.forEach(cleanup => cleanup());
    currentGraph.cleanup = [];

    if (currentGraph.persistTimer) {
        window.clearTimeout(currentGraph.persistTimer);
        currentGraph.persistTimer = null;
    }

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
    if (currentGraph?.persistStateOnDestroy !== false) {
        persistCurrentGraphState();
    }

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

    hideEdgeReadout();
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

    hideEdgeReadout();
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

function getSortedGraphNodes(nodes) {
    return nodes
        .toArray()
        .sort((left, right) => String(left.data('tableName')).localeCompare(String(right.data('tableName'))));
}

function getIncomingAverageY(node) {
    const incomingY = [];

    node.incomers('edge').forEach(edge => {
        const y = edge.source().position('y');

        if (Number.isFinite(y)) {
            incomingY.push(y);
        }
    });

    if (!incomingY.length) {
        return null;
    }

    return incomingY.reduce((sum, value) => sum + value, 0) / incomingY.length;
}

function getLayoutVariantOffset(variant, rank, index, axis) {
    if (!variant) {
        return 0;
    }

    const factor = axis === 'x' ? 28 : 46;
    const wave = axis === 'x' ? Math.cos : Math.sin;

    return wave((variant + 1) * (rank + 1.7) * (index + 2.3)) * factor;
}

function applyReadableLayoutPositions(cy, { variant = 0 } = {}) {
    const nodes = getSortedGraphNodes(cy.nodes());

    if (!nodes.length) {
        return;
    }

    const geometry = getReadableLayoutGeometry(variant);
    const rankById = new Map(nodes.map(node => [node.id(), 0]));

    for (let iteration = 0; iteration < nodes.length; iteration += 1) {
        let changed = false;

        cy.edges().forEach(edge => {
            const source = edge.source();
            const target = edge.target();

            if (source.id() === target.id()) {
                return;
            }

            const sourceRank = rankById.get(source.id()) ?? 0;
            const targetRank = rankById.get(target.id()) ?? 0;

            if (targetRank < sourceRank + 1) {
                rankById.set(target.id(), sourceRank + 1);
                changed = true;
            }
        });

        if (!changed) {
            break;
        }
    }

    const connectedNodes = nodes.filter(node => node.connectedEdges().nonempty());
    const isolatedNodes = nodes.filter(node => node.connectedEdges().empty());
    const nodesByRank = new Map();

    connectedNodes.forEach(node => {
        const rank = rankById.get(node.id()) ?? 0;
        const group = nodesByRank.get(rank) ?? [];

        group.push(node);
        nodesByRank.set(rank, group);
    });

    const ranks = [...nodesByRank.keys()].sort((left, right) => left - right);
    const maxRank = ranks.at(-1) ?? 0;
    const connectedBaseX = -(maxRank * geometry.rankSpacing) / 2;

    ranks.forEach(rank => {
        const group = (nodesByRank.get(rank) ?? []).sort((left, right) => {
            const leftAverageY = getIncomingAverageY(left);
            const rightAverageY = getIncomingAverageY(right);

            if (leftAverageY !== null && rightAverageY !== null && leftAverageY !== rightAverageY) {
                return leftAverageY - rightAverageY;
            }

            const degreeDelta = right.degree(false) - left.degree(false);

            if (degreeDelta !== 0) {
                return degreeDelta;
            }

            return String(left.data('tableName')).localeCompare(String(right.data('tableName')));
        });

        group.forEach((node, index) => {
            node.position({
                x:
                    connectedBaseX +
                    rank * geometry.rankSpacing +
                    getLayoutVariantOffset(geometry.variant, rank, index, 'x'),
                y:
                    geometry.connectedBaseY +
                    (index - (group.length - 1) / 2) * geometry.rowSpacing +
                    (rank % 2 === 0 ? 0 : 58) +
                    getLayoutVariantOffset(geometry.variant, rank, index, 'y'),
            });
        });
    });

    isolatedNodes.forEach((node, index) => {
        node.position({
            x:
                (index - (isolatedNodes.length - 1) / 2) * geometry.isolatedSpacing +
                getLayoutVariantOffset(geometry.variant, -1, index, 'x'),
            y: geometry.isolatedY + getLayoutVariantOffset(geometry.variant, -1, index, 'y'),
        });
    });
}

function runLayout(cy, onStop, { randomize = false } = {}) {
    if (currentGraph) {
        currentGraph.layoutVariant = randomize ? (currentGraph.layoutVariant ?? 0) + 1 : 0;
    }

    applyReadableLayoutPositions(cy, { variant: currentGraph?.layoutVariant ?? 0 });
    cy.fit(cy.elements(), 90);

    if (typeof onStop === 'function') {
        onStop();
    }

    persistCurrentGraphState();
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
                scheduleGraphStatePersist();
                break;
            case 'relayout':
                hideEdgeReadout();
                runLayout(cy, () => {
                    if (currentGraph?.selectedTableName) {
                        const selectedNode = cy.getElementById(getTableId(currentGraph.selectedTableName));
                        if (selectedNode.nonempty()) {
                            applyTableSelection(selectedNode, { focus: false });
                        }
                    }
                }, { randomize: true });
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
                storeInspectorHidden(currentGraph.inspectorHidden);
                updateInspectorToggleButton();
                syncInspectorLayout();
                scheduleGraphStatePersist();
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
    const canvasShell = canvas?.closest('.structure-graph__canvas-shell');
    const edgeReadout = root.querySelector('[data-structure-graph-edge-readout]');
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
        canvasShell: canvasShell instanceof HTMLElement ? canvasShell : null,
        edgeReadout: edgeReadout instanceof HTMLElement ? edgeReadout : null,
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
        inspectorHidden: cachedState?.inspectorHidden ?? readStoredInspectorHidden(),
        layoutVariant: cachedState?.layoutVariant ?? 0,
        persistStateOnDestroy: true,
        selectedTableName: null,
    };

    currentGraph.cleanup.push(setupToolbar(cy));

    const persistBeforeUnload = () => {
        persistCurrentGraphState();
    };

    window.addEventListener('beforeunload', persistBeforeUnload);
    currentGraph.cleanup.push(() => {
        window.removeEventListener('beforeunload', persistBeforeUnload);
    });

    cy.on('tap', 'node', event => {
        applyTableSelection(event.target, { focus: false });
        scheduleGraphStatePersist();
    });

    cy.on('tap', event => {
        if (event.target === cy) {
            clearSelection();
        }
    });

    cy.on('tap', 'edge', event => {
        const edge = event.target;
        currentGraph.selectedTableName = null;
        highlightConnectedElements(cy, edge);
        syncEntryHighlights([], [edge.data('sourceTable'), edge.data('targetTable')]);
        showEdgeReadout(edge, event.renderedPosition);
        updateOpenDataButton();
        scheduleGraphStatePersist();
    });

    cy.on('dragfree', 'node', () => {
        scheduleGraphStatePersist(0);
    });

    cy.on('mouseover', 'edge', event => {
        const edge = event.target;
        highlightConnectedElements(cy, edge);
        syncEntryHighlights([], [edge.data('sourceTable'), edge.data('targetTable')]);
        showEdgeReadout(edge, event.renderedPosition);
    });

    cy.on('mousemove', 'edge', event => {
        showEdgeReadout(event.target, event.renderedPosition);
    });

    cy.on('mouseout', 'edge', () => {
        hideEdgeReadout();
        restoreGraphState();
    });

    cy.on('pan zoom', () => {
        hideEdgeReadout();
        scheduleGraphStatePersist(300);
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
