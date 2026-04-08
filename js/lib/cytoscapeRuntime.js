import cytoscape from "/vendor/cytoscape/dist/cytoscape.esm.min.mjs";

let elkRegistered = false;

export function getCytoscape() {
  if (!elkRegistered) {
    if (typeof window.cytoscapeElk !== "function") {
      throw new Error("cytoscape-elk is not available on window.");
    }

    cytoscape.use(window.cytoscapeElk);
    elkRegistered = true;
  }

  return cytoscape;
}
