import { renderEmptyState } from "../components/emptyState.js";

export function renderLandingView(state) {
  return {
    main: renderEmptyState({
      activeConnection: state.connections.active,
      recentConnections: state.connections.recent,
    }),
    panel: "",
  };
}
