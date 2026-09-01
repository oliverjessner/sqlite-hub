export function buildChartPublicPath(chart, databaseId) {
    const normalizedDatabaseId = String(databaseId ?? '').trim();
    const chartId = Number(chart?.id);

    if (!normalizedDatabaseId || !Number.isSafeInteger(chartId) || chartId <= 0) {
        return '';
    }

    return `/${encodeURIComponent(normalizedDatabaseId)}/chart/${chartId}.png`;
}

export function buildChartPublicUrl(chart, databaseId, origin = null) {
    const pathname = buildChartPublicPath(chart, databaseId);

    if (!pathname) {
        return '';
    }

    const resolvedOrigin =
        origin === null
            ? typeof window !== 'undefined'
                ? String(window.location?.origin ?? '')
                : ''
            : String(origin ?? '').replace(/\/$/, '');

    return `${resolvedOrigin}${pathname}`;
}

export function buildChartMarkdownImage(chart, databaseId, origin = null) {
    const publicUrl = buildChartPublicUrl(chart, databaseId, origin);

    if (!publicUrl) {
        return '';
    }

    const fallbackName = Number.isSafeInteger(Number(chart?.id)) ? `Chart ${Number(chart.id)}` : 'Chart';
    const altText = String(chart?.name || fallbackName)
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');

    return `![${altText}](${publicUrl})`;
}
