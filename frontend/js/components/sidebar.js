import { escapeHtml, formatCompactDateTime, truncateMiddle } from '../utils/format.js';
import { renderConnectionLogo } from './connectionLogo.js';

const sidebarItems = [
    { label: 'Connections', href: '#/connections', key: 'connections', icon: 'database' },
    { label: 'Data', href: '#/data', key: 'data', icon: 'table_rows' },
    { label: 'SQL_Editor', href: '#/editor', key: 'editor', icon: 'terminal' },
    {
        label: 'SCHEMA',
        key: 'schema',
        icon: 'account_tree',
        children: [
            { label: 'STRUCTURE', href: '#/structure', key: 'structure' },
            { label: 'ADVISOR', href: '#/table-advisor', key: 'tableAdvisor' },
            { label: 'DESIGNER', href: '#/table-designer', key: 'tableDesigner' },
        ],
    },
    {
        label: 'Insights',
        key: 'insights',
        icon: 'monitoring',
        children: [
            { label: 'CHARTS', href: '#/charts', key: 'charts' },
            { label: 'OVERVIEW', href: '#/overview', key: 'overview' },
        ],
    },
    {
        label: 'Workspace',
        key: 'workspace',
        icon: 'folder_open',
        children: [
            { label: 'DOCUMENTS', href: '#/documents', key: 'documents' },
            { label: 'BACKUPS', href: '#/backups', key: 'backups' },
        ],
    },
    {
        label: 'MEDIA_TAGGING',
        key: 'mediaTagging',
        icon: 'sell',
        children: [
            { label: 'SETUP', href: '#/media-tagging', key: 'mediaTaggingSetup' },
            { label: 'TAGGING_QUEUE', href: '#/media-tagging/queue', key: 'mediaTaggingQueue' },
        ],
    },
    { label: 'Settings', href: '#/settings', key: 'settings', icon: 'settings' },
];

function getActiveSidebarKey(routeName) {
    if (routeName === 'landing') {
        return 'connections';
    }

    if (routeName === 'editorResults') {
        return 'editor';
    }

    if (routeName === 'mediaTaggingSetup' || routeName === 'mediaTaggingQueue') {
        return 'mediaTagging';
    }

    if (routeName === 'structure' || routeName === 'tableAdvisor' || routeName === 'tableDesigner') {
        return 'schema';
    }

    if (routeName === 'charts' || routeName === 'overview') {
        return 'insights';
    }

    if (routeName === 'documents' || routeName === 'backups') {
        return 'workspace';
    }

    return routeName;
}

function getConnectionTimeValue(connection) {
    const value = connection?.lastOpenedAt ?? connection?.lastModifiedAt ?? 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function getQuickPickConnections(state) {
    const byId = new Map();

    [state.connections.active, ...(state.connections.recent ?? [])].forEach(connection => {
        if (!connection?.id || byId.has(connection.id)) {
            return;
        }

        byId.set(connection.id, connection);
    });

    return [...byId.values()]
        .sort((left, right) => getConnectionTimeValue(right) - getConnectionTimeValue(left))
        .slice(0, 5);
}

function renderQuickPickCard(connection, activeConnectionId) {
    const isActive = connection.id === activeConnectionId;
    const label = connection.label || 'Untitled database';
    const path = connection.path || '';

    return `
      <button
        class="sidebar-db-picker-card ${isActive ? 'is-active' : ''}"
        data-action="select-connection"
        data-connection-id="${escapeHtml(connection.id)}"
        type="button"
      >
        ${renderConnectionLogo(connection, {
            containerClass: 'sidebar-db-picker-card__mark overflow-hidden',
            imageClassName: 'h-full w-full object-cover',
            iconClassName: 'text-[15px]',
            icon: 'database',
        })}
        <span class="sidebar-db-picker-card__body">
          <span class="sidebar-db-picker-card__label" title="${escapeHtml(label)}">
            ${escapeHtml(label)}
          </span>
          <span class="sidebar-db-picker-card__path" title="${escapeHtml(path)}">
            ${escapeHtml(path ? truncateMiddle(path, 34) : 'path:n/a')}
          </span>
          <span class="sidebar-db-picker-card__meta">
            ${isActive ? 'ACTIVE' : escapeHtml(formatCompactDateTime(connection.lastOpenedAt))}
            ${connection.readOnly ? ' // READ_ONLY' : ''}
          </span>
        </span>
      </button>
    `;
}

function renderConnectionQuickPicker(state) {
    const activeConnection = state.connections.active;
    const quickPicks = getQuickPickConnections(state);
    const hasQuickPicks = quickPicks.length > 0;

    return `
      <details class="sidebar-db-picker">
        <summary class="sidebar-footer-card" title="Switch active database">
          ${renderConnectionLogo(activeConnection, {
              containerClass: 'sidebar-footer-mark overflow-hidden bg-primary-container text-on-primary',
              imageClassName: 'h-full w-full object-cover',
              iconClassName: 'text-[15px]',
              icon: 'memory',
          })}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[10px] font-bold text-on-surface">
              ${escapeHtml(activeConnection?.label ?? 'NO_ACTIVE_DATABASE')}
            </span>
            <span class="block text-[8px] text-on-surface-variant/60">
              ${activeConnection?.readOnly ? 'READ_ONLY' : activeConnection ? 'READ_WRITE' : 'SELECT_DATABASE'}
            </span>
          </span>
          <span class="material-symbols-outlined sidebar-db-picker__chevron" aria-hidden="true">expand_less</span>
        </summary>
        <div class="sidebar-db-picker__panel">
          <div class="sidebar-db-picker__header">
            <span>Quick Picks</span>
            <span>${escapeHtml(String(quickPicks.length))}/5</span>
          </div>
          ${
              hasQuickPicks
                  ? `<div class="sidebar-db-picker__list">
                      ${quickPicks
                          .map(connection => renderQuickPickCard(connection, activeConnection?.id))
                          .join('')}
                    </div>`
                  : `<div class="sidebar-db-picker__empty">No recent databases</div>`
          }
        </div>
      </details>
    `;
}

export function renderSidebar(state) {
    const activeKey = getActiveSidebarKey(state.route.name);
    const expandedKey = sidebarItems.some(item => item.key === activeKey && item.children) ? activeKey : null;

    return `
    <nav class="sidebar-links">
      ${sidebarItems
          .map(item => {
              if (item.children) {
                  const isExpanded = expandedKey === item.key;
                  const isActive = activeKey === item.key;
                  return `
            <div class="sidebar-group">
              <a class="sidebar-link ${isActive ? 'is-active' : ''}" href="${item.children[0].href}" data-group="${item.key}">
                <span class="material-symbols-outlined">${item.icon}</span>
                <span>${item.label}</span>
                <span class="material-symbols-outlined ml-auto text-[14px] ${isExpanded ? 'rotate-180' : ''}">expand_more</span>
              </a>
              ${
                  isExpanded
                      ? `
              <div class="sidebar-sublinks">
                ${item.children
                    .map(
                        child => `
                <a class="sidebar-sublink ${state.route.name === child.key ? 'is-active' : ''}" href="${child.href}">
                  ${child.label}
                </a>
                `,
                    )
                    .join('')}
              </div>
              `
                      : ''
              }
            </div>
          `;
              }
              return `
            <a class="sidebar-link ${item.key === activeKey ? 'is-active' : ''}" href="${item.href}">
              <span class="material-symbols-outlined">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `;
          })
          .join('')}
    </nav>
    <div class="sidebar-footer">
      ${renderConnectionQuickPicker(state)}
    </div>
  `;
}
