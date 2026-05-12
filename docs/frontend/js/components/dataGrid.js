export function renderDataGrid({
  columns,
  rows,
  tableClass = "",
  theadClass = "",
  headerRowClass = "",
  tbodyClass = "",
  getRowClass = () => "",
  getRowAttrs = () => "",
}) {
  return `
    <table class="${tableClass}">
      <thead class="${theadClass}">
        <tr class="${headerRowClass}">
          ${columns
            .map(
            (column) => `
                <th class="${column.headerClassName ?? ""}" ${column.headerAttrs ?? ""}>
                  ${column.renderHeader ? column.renderHeader() : column.label}
                </th>
              `
            )
            .join("")}
        </tr>
      </thead>
      <tbody class="${tbodyClass}">
        ${rows
          .map(
            (row, index) => `
              <tr class="${getRowClass(row, index)}" ${getRowAttrs(row, index)}>
                ${columns
                  .map(
                    (column) => `
                      <td class="${column.cellClassName ?? ""}">
                        ${column.render ? column.render(row, index) : row[column.key]}
                      </td>
                    `
                  )
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}
