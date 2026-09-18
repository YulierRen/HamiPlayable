/** @format */

"use strict";

const { join } = require("path");
module.paths.push(join(Editor.App.path, "node_modules"));

function getNodeByPath(rootNode, pathSegments) {
  let currentNode = rootNode;

  for (const segment of pathSegments) {
    currentNode = currentNode?.getChildByName(segment) || null;
    if (!currentNode) {
      return null;
    }
  }

  return currentNode;
}

async function loadSpriteFrame(uuid) {
  const { assetManager } = require("cc");

  return await new Promise((resolve, reject) => {
    assetManager.loadAny(uuid, (error, asset) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(asset);
    });
  });
}

module.exports = {
  load() {},

  unload() {},

  methods: {
    async applyBoluoImages(spriteFrameMap) {
      const { director, Sprite, UITransform } = require("cc");
      const scene = director.getScene();

      if (!scene) {
        return { ok: false, message: "Scene is not ready." };
      }

      const layoutNode = getNodeByPath(scene, ["Canvas", "Layout"]);
      if (!layoutNode) {
        return { ok: false, message: "Canvas/Layout not found." };
      }

      const boluoNode = layoutNode.getChildByName("boluo");
      if (!boluoNode) {
        return { ok: false, message: "boluo node not found." };
      }

      const baseNode = boluoNode.getChildByName("Base");
      const initialNode = boluoNode.getChildByName("Initial");
      if (!baseNode || !initialNode) {
        return {
          ok: false,
          message: "Base or Initial node not found under boluo.",
        };
      }

      const spriteFrameCache = new Map();
      const stats = {
        ok: true,
        applied: 0,
        skipped: 0,
        missingAssets: [],
        missingTargets: [],
        loadErrors: [],
      };

      async function applyToContainer(containerNode, containerName) {
        for (const childNode of containerNode.children) {
          if (!childNode?.name) {
            stats.skipped += 1;
            continue;
          }

          const targetNode = childNode.getChildByName(childNode.name);
          if (!targetNode) {
            stats.missingTargets.push(`${containerName}/${childNode.name}`);
            continue;
          }

          const spriteFrameUuid = spriteFrameMap[childNode.name];
          if (!spriteFrameUuid) {
            stats.missingAssets.push(childNode.name);
            continue;
          }

          let spriteFrame = spriteFrameCache.get(spriteFrameUuid);
          if (!spriteFrame) {
            try {
              spriteFrame = await loadSpriteFrame(spriteFrameUuid);
              spriteFrameCache.set(spriteFrameUuid, spriteFrame);
            } catch (error) {
              stats.loadErrors.push(
                `${childNode.name}: ${error.message || error}`,
              );
              continue;
            }
          }

          if (!targetNode.getComponent(UITransform)) {
            targetNode.addComponent(UITransform);
          }

          const sprite =
            targetNode.getComponent(Sprite) || targetNode.addComponent(Sprite);
          sprite.spriteFrame = spriteFrame;
          stats.applied += 1;
        }
      }

      await applyToContainer(baseNode, "Base");
      await applyToContainer(initialNode, "Initial");

      return stats;
    },
  },
};
