const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createStructureRouter({ structureService }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const data = structureService.getStructureOverview();
      res.json(
        successResponse({
          data,
          readOnly: true,
        })
      );
    })
  );

  router.get(
    "/:tableName",
    route((req, res) => {
      const data = structureService.getTableStructure(req.params.tableName);
      res.json(
        successResponse({
          data,
          readOnly: data.notSafelyUpdatable,
        })
      );
    })
  );

  router.post(
    "/:tableName/types",
    route((req, res) => {
      const result = structureService.generateTableTypes(
        req.params.tableName,
        req.body?.target,
        req.body?.options ?? {}
      );
      const { warnings, metadata, ...data } = result;

      res.json(
        successResponse({
          message: "Types generated.",
          data,
          metadata,
          warnings,
          readOnly: true,
        })
      );
    })
  );

  return router;
}

module.exports = {
  createStructureRouter,
};
