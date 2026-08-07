const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createTextToStructRouter({ textToStructService }) {
  const router = express.Router();

  router.post(
    "/convert",
    route(async (req, res) => {
      const result = await textToStructService.convert(req.body ?? {});

      res.json(
        successResponse({
          message: "Text converted.",
          data: {
            output: result.output,
            records: result.records,
            errors: result.errors,
          },
          metadata: result.metadata,
        })
      );
    })
  );

  return router;
}

module.exports = {
  createTextToStructRouter,
};
