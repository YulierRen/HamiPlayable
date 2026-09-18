/** @format */

"use strict";

const fs = require("fs");
const path = require("path");

function collectSpriteFrameMap() {
  const componentDir = path.join(
    Editor.Project.path,
    "assets",
    "asset",
    "component",
  );
  const spriteFrameMap = {};

  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".png.meta")) {
        continue;
      }

      const meta = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const spriteFrameUuid = Object.values(meta.subMetas || {}).find(
        (subMeta) => subMeta && subMeta.importer === "sprite-frame",
      )?.uuid;

      if (!spriteFrameUuid) {
        continue;
      }

      const relativePath = path
        .relative(componentDir, fullPath)
        .replace(/\\/g, "/")
        .replace(/\.png\.meta$/, "");

      spriteFrameMap[relativePath] = spriteFrameUuid;
    }
  }

  walk(componentDir);
  return spriteFrameMap;
}

module.exports = {
  load() {
    console.log("[hami-editor-tools] loaded");
  },

  unload() {
    console.log("[hami-editor-tools] extension unloaded");
  },

  methods: {
    async applyBoluoImages() {
      const spriteFrameMap = collectSpriteFrameMap();
      const result = await Editor.Message.request(
        "scene",
        "execute-scene-script",
        {
          name: "hami-editor-tools",
          method: "applyBoluoImages",
          args: [spriteFrameMap],
        },
      );

      console.log("[hami-editor-tools] apply boluo images result:", result);
      return result;
    },

    logHello() {
      console.log("[hami-editor-tools] hello extensions");
    },
  },
};
