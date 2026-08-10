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

export function resolveDocumentTitle(state) {
    const activeDatabase = String(state.connections.active?.label ?? '').trim();
    const prefix = activeDatabase || APP_TITLE;
    const segment = ROUTE_TITLE_SEGMENTS[state.route.name];
    const running = ['editor', 'editorResults'].includes(state.route.name) && state.editor.executing;
    const documentName =
        state.route.name === 'documents' && state.documents?.selectedId
            ? String(state.documents.draftFilename ?? state.documents.selected?.filename ?? '').trim()
            : '';

    if (!segment) {
        return prefix;
    }

    return [prefix, segment, ...(documentName ? [documentName] : []), ...(running ? ['Running'] : [])].join(' | ');
}
