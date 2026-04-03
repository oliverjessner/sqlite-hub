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

  return router;
}

module.exports = {
  createStructureRouter,
};
