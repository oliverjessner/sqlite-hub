const APP_TITLE = 'SQLite Hub';

const ROUTE_TITLE_SEGMENTS = {
    landing: 'Home',
    connections: 'Connections',
    backups: 'Backups',
    overview: 'Overview',
    data: 'Data',
    tableAdvisor: 'Table Advisor',
    structure: 'Structure',
    editor: 'SQL Editor',
    editorResults: 'SQL Editor',
    charts: 'Charts',
    documents: 'Docs.',
    textToStruct: 'Text2Struct',
    tableDesigner: 'Table Designer',
    mediaTaggingSetup: 'Media Tagging',
    mediaTaggingQueue: 'Tagging Queue',
    settings: 'Settings',
    logs: 'Logs',
    notFound: 'Not Found',
};

function resolveDataRowName(state) {
    if (state.route.name !== 'data') {
        return '';
    }

    const dataBrowser = state.dataBrowser ?? {};
    const rowIndex = dataBrowser.selectedRowIndex;
    const row =
        dataBrowser.selectedRow ??
        (Number.isInteger(rowIndex) ? dataBrowser.table?.rows?.[rowIndex] : null);

    if (!row) {
        return '';
    }

    const nameColumn = Object.keys(row).find(columnName => columnName.toLowerCase() === 'name');
    const name = nameColumn ? row[nameColumn] : '';

    if (['string', 'number', 'bigint'].includes(typeof name) && String(name).trim()) {
        return String(name).trim();
    }

    return Number.isInteger(rowIndex) ? `Row ${rowIndex + 1}` : 'Row';
}

function resolveEditorTabTitle(state) {
    if (!['editor', 'editorResults'].includes(state.route.name)) {
        return '';
    }

    const activeTab = state.editor?.queryTabs?.find(tab => tab.id === state.editor.activeQueryTabId);
    return String(activeTab?.title ?? '').trim();
}

export function resolveDocumentTitle(state) {
    const activeDatabase = String(state.connections.active?.label ?? '').trim();
    const prefix = activeDatabase || APP_TITLE;
    const segment = ROUTE_TITLE_SEGMENTS[state.route.name];
    const running = ['editor', 'editorResults'].includes(state.route.name) && state.editor.executing;
    const documentName =
        state.route.name === 'documents' && state.documents?.selectedId
            ? String(state.documents.draftFilename ?? state.documents.selected?.filename ?? '').trim()
            : '';
    const dataRowName = resolveDataRowName(state);
    const editorTabTitle = resolveEditorTabTitle(state);

    if (!segment) {
        return prefix;
    }

    return [
        prefix,
        segment,
        ...(documentName ? [documentName] : []),
        ...(dataRowName ? [dataRowName] : []),
        ...(editorTabTitle ? [editorTabTitle] : []),
        ...(running ? ['Running'] : []),
    ].join(' | ');
}
