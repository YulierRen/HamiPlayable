/** @format */

import { _decorator, Component, JsonAsset, Node, Size, UITransform } from "cc";
const { ccclass, property, executeInEditMode } = _decorator;

interface LayoutJsonNode {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: LayoutJsonNode[];
}

@ccclass("BaseCreate")
@executeInEditMode(true)
export class BaseCreate extends Component {
  @property({ type: JsonAsset, tooltip: "拖入 Final_Base.json" })
  layoutJson: JsonAsset | null = null;

  @property({ tooltip: "生成前删除当前节点下已有子节点" })
  clearBeforeCreate = true;

  @property({ tooltip: "在编辑器中勾选后按 JSON 重建节点树" })
  rebuildInEditor = false;

  private rebuildScheduled = false;

  protected onValidate() {
    if (this.rebuildInEditor) {
      this.rebuildInEditor = false;
      this.requestRebuild();
      return;
    }

    if (this.layoutJson) {
      this.requestRebuild();
    }
  }

  protected onEnable() {
    if (this.layoutJson) {
      this.requestRebuild();
    }
  }

  createLayoutNodes() {
    if (!this.layoutJson) {
      console.warn("[BaseCreate] 未指定 layoutJson");
      return;
    }

    const rootData = this.layoutJson.json as LayoutJsonNode;
    const children = Array.isArray(rootData?.children) ? rootData.children : [];

    this.applyRectToNode(this.node, rootData);

    if (this.clearBeforeCreate) {
      this.node.removeAllChildren();
    }

    for (const childData of children) {
      this.createNodeTree(childData, rootData, this.node);
    }
  }

  private createNodeTree(
    data: LayoutJsonNode,
    parentRect: LayoutJsonNode,
    parentNode: Node,
  ) {
    const childNode = new Node(data.name || "Node");
    parentNode.addChild(childNode);

    this.applyRectToNode(childNode, data);

    const localLeft = (data.x ?? 0) - (parentRect.x ?? 0);
    const localTop = (data.y ?? 0) - (parentRect.y ?? 0);
    const childWidth = data.width ?? 0;
    const childHeight = data.height ?? 0;
    const parentWidth = parentRect.width ?? 0;
    const parentHeight = parentRect.height ?? 0;

    const localCenterX = localLeft + childWidth * 0.5 - parentWidth * 0.5;
    const localCenterY = parentHeight * 0.5 - localTop - childHeight * 0.5;

    childNode.setPosition(localCenterX, localCenterY, 0);

    if (!Array.isArray(data.children) || data.children.length === 0) {
      return;
    }

    for (const childData of data.children) {
      this.createNodeTree(childData, data, childNode);
    }
  }

  private applyRectToNode(targetNode: Node, data: LayoutJsonNode) {
    const transform =
      targetNode.getComponent(UITransform) ||
      targetNode.addComponent(UITransform);
    transform.setContentSize(new Size(data.width ?? 0, data.height ?? 0));
  }

  private requestRebuild() {
    if (this.rebuildScheduled) {
      return;
    }

    this.rebuildScheduled = true;
    this.scheduleOnce(() => {
      this.rebuildScheduled = false;
      this.createLayoutNodes();
    }, 0);
  }
}
