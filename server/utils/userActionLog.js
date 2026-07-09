function getActiveConnection(connectionManager) {
  try {
    return connectionManager?.getActiveConnection?.() ?? null;
  } catch {
    return null;
  }
}

function recordUserAction({
  appStateStore,
  connectionManager,
  action,
  targetType = "database",
  targetName = null,
  metadata = {},
  databaseKey = null,
  durationMs = null,
} = {}) {
  if (!appStateStore?.recordAccessLog || !action) {
    return null;
  }

  const activeConnection = getActiveConnection(connectionManager);
  const resolvedDatabaseKey = databaseKey ?? activeConnection?.id ?? null;
  const resolvedTargetName =
    targetName ?? activeConnection?.label ?? activeConnection?.path ?? resolvedDatabaseKey ?? targetType;

  try {
    return appStateStore.recordAccessLog({
      source: "user",
      action,
      databaseKey: resolvedDatabaseKey,
      targetType,
      targetName: resolvedTargetName,
      status: "success",
      durationMs,
      metadata: {
        databaseLabel: activeConnection?.label ?? null,
        ...metadata,
      },
    });
  } catch {
    return null;
  }
}

module.exports = {
  recordUserAction,
};
