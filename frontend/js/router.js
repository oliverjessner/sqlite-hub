function decodeRouteValue(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function parseHash(hash = window.location.hash) {
    const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
    const queryIndex = normalized.indexOf('?');
    const pathWithFragment = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
    const queryWithFragment = queryIndex >= 0 ? normalized.slice(queryIndex + 1) : '';
    const pathFragmentIndex = pathWithFragment.indexOf('#');
    const queryFragmentIndex = queryWithFragment.indexOf('#');
    const pathname =
        pathFragmentIndex >= 0 ? pathWithFragment.slice(0, pathFragmentIndex) : pathWithFragment || '/';
    const routeFragment =
        pathFragmentIndex >= 0
            ? pathWithFragment.slice(pathFragmentIndex + 1)
            : queryFragmentIndex >= 0
              ? queryWithFragment.slice(queryFragmentIndex + 1)
              : null;
    const cleanPath = pathname || '/';
    const segments = cleanPath.split('/').filter(Boolean);
    const decodedRouteFragment = routeFragment ? decodeRouteValue(routeFragment) : null;

    if (segments.length === 0) {
        return { name: 'landing', path: '/', params: {} };
    }

    switch (segments[0]) {
        case 'connections':
            return { name: 'connections', path: '/connections', params: {} };
        case 'backups':
            return { name: 'backups', path: '/backups', params: {} };
        case 'overview':
            return { name: 'overview', path: '/overview', params: {} };
        case 'charts':
            return {
                name: 'charts',
                path: cleanPath,
                params: {
                    historyId: segments[1] ? decodeRouteValue(segments[1]) : null,
                },
            };
        case 'documents':
            return {
                name: 'documents',
                path: cleanPath,
                params: {
                    documentId: segments[1] ? decodeRouteValue(segments[1]) : null,
                },
            };
        case 'editor':
            if (segments[1] === 'results') {
                return { name: 'editorResults', path: '/editor/results', params: {} };
            }

            return { name: 'editor', path: '/editor', params: {} };
        case 'data':
            return {
                name: 'data',
                path: cleanPath,
                params: {
                    tableName: segments[1] ? decodeRouteValue(segments[1]) : null,
                    rowPrimaryKey: decodedRouteFragment,
                },
            };
        case 'structure':
            return {
                name: 'structure',
                path: cleanPath,
                params: {
                    tableName: segments[1] ? decodeRouteValue(segments[1]) : null,
                },
            };
        case 'table-designer':
            return {
                name: 'tableDesigner',
                path: cleanPath,
                params: {
                    isNew: segments[1] === 'new',
                    tableName: segments[1] && segments[1] !== 'new' ? decodeRouteValue(segments[1]) : null,
                },
            };
        case 'table-advisor':
            return {
                name: 'tableAdvisor',
                path: cleanPath,
                params: {
                    tableName: segments[1] ? decodeRouteValue(segments[1]) : null,
                },
            };
        case 'media-tagging':
            if (segments[1] === 'queue') {
                return { name: 'mediaTaggingQueue', path: '/media-tagging/queue', params: {} };
            }
            return { name: 'mediaTaggingSetup', path: '/media-tagging', params: {} };
        case 'settings':
            return { name: 'settings', path: '/settings', params: {} };
        case 'logs':
            return { name: 'logs', path: '/logs', params: {} };
        default:
            return { name: 'notFound', path: cleanPath, params: {} };
    }
}

export function createRouter(onRouteChange) {
    const handleRouteChange = () => {
        onRouteChange(parseHash(window.location.hash));
    };

    return {
        start() {
            window.addEventListener('hashchange', handleRouteChange);

            if (!window.location.hash) {
                window.location.hash = '#/';
                return;
            }

            handleRouteChange();
        },
        navigate(path) {
            const nextHash = path.startsWith('#') ? path : `#${path}`;

            if (window.location.hash === nextHash) {
                handleRouteChange();
                return;
            }

            window.location.hash = nextHash;
        },
    };
}
