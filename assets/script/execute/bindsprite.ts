/** @format */

import { _decorator, Component, Node, Sprite, SpriteFrame } from "cc";
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass("bindsprite")
@executeInEditMode(true)
export class bindsprite extends Component {
  @property({
    tooltip: "在编辑器中勾选后，将已设置图片的叶子节点同步给所有同名叶子节点",
  })
  bindInEditor = false;

  private bindScheduled = false;

  start() {
    if (!this.bindInEditor) {
      return;
    }

    this.bindInEditor = false;
    this.requestBindSprites();
  }

  protected onValidate() {
    if (!this.bindInEditor) {
      return;
    }

    this.scheduleOnce(() => {
      this.start();
    }, 0);
  }

  private requestBindSprites() {
    if (this.bindScheduled) {
      return;
    }

    this.bindScheduled = true;
    this.scheduleOnce(() => {
      this.bindScheduled = false;
      this.bindLeafSprites();
    }, 0);
  }

  private bindLeafSprites() {
    const leafNodes = this.collectLeafNodes(this.node);
    const spriteFramesByName = new Map<string, SpriteFrame>();

    for (const leafNode of leafNodes) {
      const spriteFrame = leafNode.getComponent(Sprite)?.spriteFrame;
      if (spriteFrame && !spriteFramesByName.has(leafNode.name)) {
        spriteFramesByName.set(leafNode.name, spriteFrame);
      }
    }

    let appliedCount = 0;
    let missingSourceCount = 0;

    for (const targetNode of leafNodes) {
      const spriteFrame = spriteFramesByName.get(targetNode.name);
      if (!spriteFrame) {
        missingSourceCount += 1;
        continue;
      }

      const sprite =
        targetNode.getComponent(Sprite) || targetNode.addComponent(Sprite);
      sprite.spriteFrame = spriteFrame;
      appliedCount += 1;
    }

    console.log(
      `[bindsprite] 已同步 ${appliedCount} 个叶子节点，缺少图片来源 ${missingSourceCount} 个`,
    );
  }

  private collectLeafNodes(rootNode: Node) {
    const leafNodes: Node[] = [];

    const visitNode = (currentNode: Node) => {
      if (currentNode.children.length === 0) {
        leafNodes.push(currentNode);
        return;
      }

      for (const childNode of currentNode.children) {
        visitNode(childNode);
      }
    };

    for (const childNode of rootNode.children) {
      visitNode(childNode);
    }

    return leafNodes;
  }
}
