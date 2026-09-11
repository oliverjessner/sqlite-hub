import { escapeHtml, formatCellValue, isBlobPreview, truncateMiddle } from '../utils/format.js';

export function getDataCellReadonlyReason(state, row, columnName) {
    const table = state.dataBrowser.table;
    const column = table?.columnMeta?.find(item => item.name === columnName);
    if (state.connections?.active?.readOnly || table?.readOnly) return 'This database or table is read-only.';
    if (table?.isShadow) return 'Shadow tables are read-only.';
    if (table?.notSafelyUpdatable || !row?.__identity) return 'This row has no stable identity for safe updates.';
    if (column?.generated) return 'Generated columns cannot be edited.';
    if (!column || !column.visible) return 'Column metadata does not allow editing.';
    if (column.primaryKeyPosition > 0 || table.identityStrategy?.columns?.includes(columnName)) {
        return 'Primary-key identity columns cannot be edited.';
    }
    const value = row[columnName];
    if (isBlobPreview(value) || (value !== null && typeof value === 'object')) return 'BLOB values cannot be edited in Sheets.';
    return '';
}

export function isSameDataCell(cell, rowIndex, columnName) {
    return cell?.rowIndex === rowIndex && cell?.columnName === columnName;
}

export function getAdjacentDataCell(state, cell, direction) {
    if (direction !== 1 && direction !== -1) return null;
    const table = state.dataBrowser.table;
    const columns = table?.columns ?? [];
    const rows = table?.rows ?? [];
    const start = cell.rowIndex * columns.length + columns.indexOf(cell.columnName);
    for (let index = start + direction; index >= 0 && index < rows.length * columns.length; index += direction) {
        const rowIndex = Math.floor(index / columns.length);
        const columnName = columns[index % columns.length];
        if (!getDataCellReadonlyReason(state, rows[rowIndex], columnName)) return { rowIndex, columnName };
    }
    return null;
}

export function renderEditableDataCell(state, row, rowIndex, columnName, widthClass) {
    const reason = getDataCellReadonlyReason(state, row, columnName);
    const editing = isSameDataCell(state.dataBrowser.editingCell, rowIndex, columnName);
    const saving = isSameDataCell(state.dataBrowser.savingCell, rowIndex, columnName);
    const display = formatCellValue(row[columnName]);
    const attrs = `data-sheet-cell data-row-index="${rowIndex}" data-column-name="${escapeHtml(columnName)}"`;
    return {
        attrs: `${attrs} ${reason ? '' : 'data-action="edit-data-cell" tabindex="0"'} title="${escapeHtml(reason || 'Click to edit. Enter saves; Escape cancels; Tab saves and moves. Empty input saves an empty string; use Browse to set NULL.')}"`,
        markup: `<span class="block ${widthClass} overflow-hidden text-ellipsis whitespace-nowrap ${editing ? 'invisible' : ''} ${row[columnName] === null ? 'text-on-surface-variant/45' : ''}">${escapeHtml(truncateMiddle(display, 48))}</span>${editing ? `
          <input class="control-input absolute inset-0 h-full w-full min-w-0 border border-primary-container bg-surface-container-high px-4 text-[11px] text-on-surface outline-none ${saving ? 'opacity-60' : ''}"
            data-bind="data-sheet-value" aria-label="${escapeHtml(columnName)}, row ${rowIndex + 1}" aria-busy="${saving}"
            title="${saving ? 'Saving…' : 'Enter saves; Escape cancels; Tab saves and moves.'}"
            type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(state.dataBrowser.editingCell.value)}" ${saving ? 'readonly' : ''} />` : ''}`,
    };
}

// Called by the application's single delegated keyboard listener, before global Escape handling.
export async function handleDataCellKeydown(event, { commit, cancel, focus }) {
    if (event.isComposing || !['Enter', 'Escape', 'Tab'].includes(event.key)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') cancel();
    else await commit(event.key === 'Tab' ? (event.shiftKey ? -1 : 1) : 0);
    focus();
    return true;
}

export function focusDataCellEditor(root) {
    const input = root.querySelector('[data-bind="data-sheet-value"]');
    if (input) {
        input.focus({ preventScroll: true });
        input.select();
    }
}

// Keep the existing grid and scroll container mounted when only cell content changed.
export function patchDataGridCells(currentWorkspace, nextWorkspace) {
    const stripRows = markup => markup.replace(/(<tbody\b[^>]*>)[\s\S]*?<\/tbody>/, '$1</tbody>');
    if (stripRows(currentWorkspace.innerHTML) !== stripRows(nextWorkspace.innerHTML)) return false;
    const currentCells = currentWorkspace.querySelectorAll('[data-sheet-cell]');
    const nextCells = nextWorkspace.querySelectorAll('[data-sheet-cell]');
    if (!currentCells.length || currentCells.length !== nextCells.length) return false;
    currentCells.forEach((cell, index) => {
        if (cell.outerHTML !== nextCells[index].outerHTML) cell.replaceWith(nextCells[index]);
    });
    return true;
}
