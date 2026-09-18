/** @format */

import { _decorator, Component, Node } from "cc";
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass("slotSort")
@executeInEditMode(true)
export class slotSort extends Component {
  @property({ tooltip: "组件启用时自动排序并重命名一次" })
  sortOnEnable = true;

  @property({
    tooltip: "在编辑器中勾选后，按从左到右、从上到下重排并重命名子节点",
  })
  sortInEditor = false;

  private sortScheduled = false;

  protected onEnable() {
    if (!this.sortOnEnable) {
      return;
    }

    this.requestSort();
  }

  protected onValidate() {
    if (!this.sortInEditor) {
      return;
    }

    this.sortInEditor = false;
    this.requestSort();
  }

  sortChildren() {
    const sortedChildren = [...this.node.children].sort(
      (leftNode, rightNode) => {
        const leftPosition = leftNode.position;
        const rightPosition = rightNode.position;

        if (Math.abs(leftPosition.y - rightPosition.y) > 0.01) {
          return rightPosition.y - leftPosition.y;
        }

        return leftPosition.x - rightPosition.x;
      },
    );

    sortedChildren.forEach((childNode, index) => {
      childNode.setSiblingIndex(index);
      childNode.name = `slot${index + 1}`;
    });
  }

  private requestSort() {
    if (this.sortScheduled) {
      return;
    }

    this.sortScheduled = true;
    this.scheduleOnce(() => {
      this.sortScheduled = false;
      this.sortChildren();
    }, 0);
  }

  update(deltaTime: number) {}
}
