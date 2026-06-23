import { renderDropdownButton } from './dropdownButton.js';

export function renderGenerateTypesDropdown({ selectedTableName = '', hasTables = false } = {}) {
    const hasSelectedTable = Boolean(String(selectedTableName ?? '').trim());

    return renderDropdownButton({
        align: 'left',
        icon: 'code',
        label: 'Generate Types',
        title: 'Generate types',
        items: [
            {
                action: 'open-generate-types-modal',
                disabled: !hasSelectedTable,
                icon: 'select_check_box',
                label: 'Selected table',
                dataAttributes: {
                    tableName: selectedTableName,
                    typeScope: 'selected',
                },
            },
            {
                action: 'open-generate-types-modal',
                disabled: !hasTables,
                icon: 'library_books',
                label: 'All tables',
                dataAttributes: {
                    typeScope: 'all',
                },
            },
        ],
    });
}
