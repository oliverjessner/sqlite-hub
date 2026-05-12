const express = require("express");
const { route, successResponse } = require("../utils/errors");

function createMediaTaggingRouter({ mediaTaggingService }) {
  const router = express.Router();

  router.get(
    "/",
    route((req, res) => {
      const data = mediaTaggingService.getViewState();

      res.json(
        successResponse({
          data,
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/preview",
    route((req, res) => {
      const data = mediaTaggingService.getViewState({
        config: req.body?.config ?? {},
        skippedMediaKeys: req.body?.skippedMediaKeys ?? [],
      });

      res.json(
        successResponse({
          data,
          message: "Media tagging preview updated.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/config",
    route((req, res) => {
      const data = mediaTaggingService.saveConfig(req.body?.config ?? {}, {
        skippedMediaKeys: req.body?.skippedMediaKeys ?? [],
      });

      res.json(
        successResponse({
          data,
          message: "Media tagging configuration saved.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/tag-table/create",
    route((req, res) => {
      const data = mediaTaggingService.createDefaultTagTable(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "Tag table created.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/mapping-table/create",
    route((req, res) => {
      const data = mediaTaggingService.createDefaultMappingTable(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "Mapping table created.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/tags",
    route((req, res) => {
      const data = mediaTaggingService.createTag(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "Tag created.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/tags/delete",
    route((req, res) => {
      const data = mediaTaggingService.deleteTag(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "Tag removed.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/skip",
    route((req, res) => {
      const data = mediaTaggingService.skipCurrentMedia(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "Media item skipped and marked tagged.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.post(
    "/apply",
    route((req, res) => {
      const data = mediaTaggingService.applyTagging(req.body ?? {});

      res.json(
        successResponse({
          data,
          message: "Media item tagged.",
          readOnly: Boolean(data.connection?.readOnly),
        })
      );
    })
  );

  router.get(
    "/media-file",
    route((req, res) => {
      mediaTaggingService.sendMediaFile(req.query.path, res);
    })
  );

  return router;
}

module.exports = {
  createMediaTaggingRouter,
};
