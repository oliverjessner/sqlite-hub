export function parseHash(hash = window.location.hash) {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathname = "/"] = normalized.split("?");
  const cleanPath = pathname || "/";
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { name: "landing", path: "/", params: {} };
  }

  switch (segments[0]) {
    case "connections":
      return { name: "connections", path: "/connections", params: {} };
    case "overview":
      return { name: "overview", path: "/overview", params: {} };
    case "editor":
      if (segments[1] === "results") {
        return { name: "editorResults", path: "/editor/results", params: {} };
      }

      return { name: "editor", path: "/editor", params: {} };
    case "data":
      return {
        name: "data",
        path: cleanPath,
        params: {
          tableName: segments[1] ? decodeURIComponent(segments[1]) : null,
        },
      };
    case "structure":
      return { name: "structure", path: "/structure", params: {} };
    case "table-designer":
      return {
        name: "tableDesigner",
        path: cleanPath,
        params: {
          isNew: segments[1] === "new",
          tableName:
            segments[1] && segments[1] !== "new" ? decodeURIComponent(segments[1]) : null,
        },
      };
    case "settings":
      return { name: "settings", path: "/settings", params: {} };
    default:
      return { name: "notFound", path: cleanPath, params: {} };
  }
}

export function createRouter(onRouteChange) {
  const handleRouteChange = () => {
    onRouteChange(parseHash(window.location.hash));
  };

  return {
    start() {
      window.addEventListener("hashchange", handleRouteChange);

      if (!window.location.hash) {
        window.location.hash = "#/";
        return;
      }

      handleRouteChange();
    },
    navigate(path) {
      const nextHash = path.startsWith("#") ? path : `#${path}`;

      if (window.location.hash === nextHash) {
        handleRouteChange();
        return;
      }

      window.location.hash = nextHash;
    },
  };
}
