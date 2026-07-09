const express = require("express");
const {
  DatabaseRequiredError,
  route,
  successResponse,
} = require("../utils/errors");
const { recordUserAction } = require("../utils/userActionLog");

function getActiveDatabaseKey(connectionManager) {
  return connectionManager.getActiveConnection()?.id ?? null;
}

function requireActiveDatabaseKey(connectionManager) {
  const databaseKey = getActiveDatabaseKey(connectionManager);

  if (!databaseKey) {
    throw new DatabaseRequiredError();
  }

  return databaseKey;
}

function createChartsRouter({ appStateStore, connectionManager, sqlExecutor }) {
  const router = express.Router();

  router.get(
    "/query-history",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);

      res.json(
        successResponse({
          data: appStateStore.getChartQueryHistoryList(databaseKey),
          metadata: { databaseKey },
        })
      );
    })
  );

  router.get(
    "/query-history/:historyId",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);

      res.json(
        successResponse({
          data: appStateStore.getQueryHistoryChartsDetail(req.params.historyId, databaseKey),
          metadata: {
            databaseKey,
            historyId: Number(req.params.historyId),
          },
        })
      );
    })
  );

  router.post(
    "/query-history/:historyId/execute",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const item = appStateStore.getChartQueryHistoryItemForDatabase(
        req.params.historyId,
        databaseKey
      );
      const result = sqlExecutor.execute(item.rawSql, {
        persistHistory: false,
        requireReader: true,
      });

      res.json(
        successResponse({
          message: "Query results loaded for charts.",
          data: {
            ...result,
            queryHistoryId: item.id,
          },
          metadata: {
            databaseKey,
            historyId: item.id,
          },
          timingMs: result.timingMs,
        })
      );
    })
  );

  router.post(
    "/",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const chart = appStateStore.createQueryHistoryChart({
        databaseKey,
        queryHistoryId: req.body?.queryHistoryId,
        name: req.body?.name,
        chartType: req.body?.chartType,
        config: req.body?.config,
        resultColumns: req.body?.resultColumns,
        tableVisible: req.body?.tableVisible,
      });
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "chart.create",
        databaseKey,
        targetType: "chart",
        targetName: chart.name ?? chart.id,
        metadata: {
          chartId: chart.id,
          chartType: chart.chartType ?? req.body?.chartType ?? null,
          queryHistoryId: chart.queryHistoryId ?? req.body?.queryHistoryId ?? null,
        },
      });

      res.json(
        successResponse({
          message: "Chart created.",
          data: chart,
          metadata: { databaseKey },
        })
      );
    })
  );

  router.patch(
    "/:chartId",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const chart = appStateStore.updateQueryHistoryChart(req.params.chartId, {
        databaseKey,
        name: req.body?.name,
        chartType: req.body?.chartType,
        config: req.body?.config,
        resultColumns: req.body?.resultColumns,
        tableVisible: req.body?.tableVisible,
      });

      res.json(
        successResponse({
          message: "Chart updated.",
          data: chart,
          metadata: { databaseKey },
        })
      );
    })
  );

  router.delete(
    "/:chartId",
    route((req, res) => {
      const databaseKey = requireActiveDatabaseKey(connectionManager);
      const chart = appStateStore.getQueryHistoryChartForDatabase(req.params.chartId, databaseKey);
      appStateStore.deleteQueryHistoryChart(req.params.chartId, databaseKey);
      recordUserAction({
        appStateStore,
        connectionManager,
        action: "chart.delete",
        databaseKey,
        targetType: "chart",
        targetName: chart.name ?? req.params.chartId,
        metadata: {
          chartId: Number(req.params.chartId),
          chartType: chart.chartType ?? null,
          queryHistoryId: chart.queryHistoryId ?? null,
        },
      });

      res.json(
        successResponse({
          message: "Chart deleted.",
          data: {
            id: Number(req.params.chartId),
          },
          metadata: { databaseKey },
        })
      );
    })
  );

  return router;
}

module.exports = {
  createChartsRouter,
};
