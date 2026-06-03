import { escapeHtml } from '../utils/format.js';
import { renderConnectionLogo } from './connectionLogo.js';

const sidebarItems = [
    { label: 'Connections', href: '#/connections', key: 'connections', icon: 'database' },
    { label: 'Overview', href: '#/overview', key: 'overview', icon: 'dashboard' },
    { label: 'Data', href: '#/data', key: 'data', icon: 'table_rows' },
    { label: 'Structure', href: '#/structure', key: 'structure', icon: 'account_tree' },
    { label: 'SQL_Editor', href: '#/editor', key: 'editor', icon: 'terminal' },
    { label: 'Charts', href: '#/charts', key: 'charts', icon: 'bar_chart' },
    { label: 'Table_Designer', href: '#/table-designer', key: 'tableDesigner', icon: 'table_chart' },
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

    return routeName;
}

export function renderSidebar(state) {
    const activeKey = getActiveSidebarKey(state.route.name);
    const activeConnection = state.connections.active;
    const expandedKey = activeKey === 'mediaTagging' ? 'mediaTagging' : null;

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
      <div class="sidebar-footer-card">
        ${renderConnectionLogo(activeConnection, {
            containerClass: 'sidebar-footer-mark overflow-hidden bg-primary-container text-on-primary',
            imageClassName: 'h-full w-full object-cover',
            iconClassName: 'text-[15px]',
            icon: 'memory',
        })}
        <div class="min-w-0">
          <p class="truncate text-[10px] font-bold text-on-surface">
            ${escapeHtml(activeConnection?.label ?? 'NO_ACTIVE_DATABASE')}
          </p>
          <p class="text-[8px] text-on-surface-variant/60">
            ${activeConnection?.readOnly ? 'READ_ONLY' : 'READ_WRITE'}
          </p>
        </div>
      </div>
    </div>
  `;
}
