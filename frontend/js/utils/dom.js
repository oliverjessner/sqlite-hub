function createRenderedMarkupFragment(contextNode, markup) {
    const range = document.createRange();

    range.selectNodeContents(contextNode);
    return range.createContextualFragment(String(markup ?? ''));
}

// Renderers must escape user-controlled values before markup reaches this DOM boundary.
export function replaceChildrenFromRenderedMarkup(target, markup) {
    if (!(target instanceof Element)) {
        return false;
    }

    target.replaceChildren(createRenderedMarkupFragment(target, markup));
    return true;
}

export function replaceElementFromRenderedMarkup(target, markup) {
    if (!(target instanceof Element)) {
        return false;
    }

    const range = document.createRange();

    range.selectNode(target);
    target.replaceWith(range.createContextualFragment(String(markup ?? '')));
    return true;
}
