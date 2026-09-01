const express = require("express");
const { route } = require("../utils/errors");

function createChartImagesRouter({ chartImageService }) {
  const router = express.Router();

  router.get(
    "/:databaseId/chart/:chartId.png",
    route((req, res) => {
      const imagePath = chartImageService.requireChartImage(
        req.params.databaseId,
        req.params.chartId
      );

      res.set({
        "Cache-Control": "no-cache, must-revalidate",
        "Content-Type": "image/png",
      });
      res.sendFile(imagePath);
    })
  );

  return router;
}

module.exports = {
  createChartImagesRouter,
};
