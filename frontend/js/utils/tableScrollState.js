export function captureTableHorizontalScrollState({ routeName = "", scrollNodes = [] } = {}) {
  return {
    routeName: String(routeName ?? ""),
    positions: Array.from(scrollNodes)
      .map((scrollNode) => ({
        key: String(scrollNode?.dataset?.tableScrollKey ?? ""),
        scrollLeft: Number(scrollNode?.scrollLeft) || 0,
      }))
      .filter((position) => position.key),
  };
}

export function restoreTableHorizontalScrollState({
  snapshot,
  routeName = "",
  scrollNodes = [],
} = {}) {
  if (!snapshot || snapshot.routeName !== String(routeName ?? "")) {
    return false;
  }

  const candidates = Array.from(scrollNodes);
  let restored = false;

  for (const position of snapshot.positions ?? []) {
    const scrollNode = candidates.find(
      (candidate) => String(candidate?.dataset?.tableScrollKey ?? "") === position.key
    );

    if (!scrollNode) {
      continue;
    }

    scrollNode.scrollLeft = position.scrollLeft;
    restored = true;
  }

  return restored;
}
