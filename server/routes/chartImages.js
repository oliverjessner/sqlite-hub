const express = require("express");
const rateLimit = require("express-rate-limit");
const { route } = require("../utils/errors");

function createChartImagesRouter({ chartImageService }) {
  const router = express.Router();
  const chartImageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  });

  router.get(
    "/:databaseId/chart/:chartId.png",
    chartImageLimiter,
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
