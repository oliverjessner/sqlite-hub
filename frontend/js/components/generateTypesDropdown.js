import { renderDropdownButton } from './dropdownButton.js';

const TYPE_TARGETS = [
    ['typescript', 'TypeScript'],
    ['rust', 'Rust'],
    ['kotlin', 'Kotlin'],
    ['swift', 'Swift'],
];

export function renderGenerateTypesDropdown(tableName) {
    return renderDropdownButton({
        align: 'left',
        icon: 'code',
        label: 'Generate Types',
        title: 'Generate types',
        items: TYPE_TARGETS.map(([target, label]) => ({
            action: 'open-generate-types-modal',
            icon: 'code',
            label,
            dataAttributes: {
                tableName,
                typeTarget: target,
            },
        })),
    });
}
