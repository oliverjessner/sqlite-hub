export function renderDataGrid({
  columns,
  rows,
  tableClass = "",
  tableStyle = "",
  theadClass = "",
  headerRowClass = "",
  tbodyClass = "",
  getRowClass = () => "",
  getRowAttrs = () => "",
}) {
  return `
    <table class="${tableClass}" ${tableStyle ? `style="${tableStyle}"` : ""}>
      ${columns.some((column) => column.colStyle || column.colAttrs) ? `
      <colgroup>
        ${columns.map((column) => `<col ${column.colAttrs ?? ""} ${column.colStyle ? `style="${column.colStyle}"` : ""}>`).join("")}
      </colgroup>` : ""}
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
                      <td class="${column.cellClassName ?? ""}" ${column.getCellAttrs ? column.getCellAttrs(row, index) : ""}>
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
