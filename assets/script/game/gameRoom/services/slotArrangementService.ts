import { Node } from "cc";
import { animationConfig } from "../animation/animationConfig";
import { SlotNode } from "../types/slotTypes";

type SlotArrangementDeps = {
    mapVisualToSlot: (visualNode: Node, slotNode: SlotNode) => void;
    getMoveTargetNode: (hostNode: Node) => Node | null;
    ensureSlotVisualListener: (visualNode: Node, slotNode: SlotNode) => void;
    moveNodeToSlot: (
        movingNode: Node,
        slotNode: SlotNode,
        order: number,
        delaySeconds?: number,
    ) => Node | null;
    resetNodeScale: (node: Node, order: number) => void;
    moveVisualToHost: (visualNode: Node, targetNode: Node, order: number) => void;
};

export class SlotArrangementService {
    // 注入与 Cocos 节点操作相关的依赖，保持编排逻辑可复用。
    public constructor(private readonly deps: SlotArrangementDeps) {}

    // 判断 slot 是否为空。
    public isSlotEmpty(slotNode: SlotNode) {
        return !(
            slotNode.__hasNode === true &&
            !!slotNode.__movedInNode &&
            !!slotNode.__movedInVisualNode
        );
    }

    // 清空 slot 的占用标记。
    public clearSlotNode(slotNode: SlotNode) {
        slotNode.__hasNode = false;
        slotNode.__movedInNode = null;
        slotNode.__movedInVisualNode = null;
    }

    // 按同名后插与必要右移策略将节点插入 slot。
    public tryInsertNodeIntoSlots(
        movingNode: Node,
        orderedSlotNodes: SlotNode[],
        order: number = 0,
    ) {
        if (orderedSlotNodes.length === 0) {
            return false;
        }

        const firstSameNameIndex = orderedSlotNodes.findIndex(
            (slotNode) => slotNode.__movedInNode?.name === movingNode.name,
        );

        let targetIndex = this.findFirstEmptyIndex(orderedSlotNodes, 0);
        let insertDelaySeconds = 0;
        if (firstSameNameIndex >= 0) {
            targetIndex = this.findIndexAfterSameNameBlock(
                orderedSlotNodes,
                firstSameNameIndex,
                movingNode.name,
            );

            if (targetIndex >= orderedSlotNodes.length) {
                console.log(
                    `[slotTrayController] 挪入失败: 同名组后无位置, name=${movingNode.name}`,
                );
                return false;
            }

            if (this.isSlotEmpty(orderedSlotNodes[targetIndex]) === false) {
                const emptyIndex = this.findFirstEmptyIndex(orderedSlotNodes, targetIndex + 1);
                if (emptyIndex < 0) {
                    console.log(
                        `[slotTrayController] 挪入失败: 同名组后无空位, name=${movingNode.name}`,
                    );
                    return false;
                }

                const movedCount = this.shiftSlotRangeRight(
                    orderedSlotNodes,
                    targetIndex,
                    emptyIndex,
                    order,
                );
                if (movedCount > 0) {
                    insertDelaySeconds = animationConfig.moveDuration;
                }
            }
        }

        if (targetIndex < 0 || targetIndex >= orderedSlotNodes.length) {
            console.log(`[slotTrayController] 挪入失败: 无空位, name=${movingNode.name}`);
            return false;
        }

        const targetSlotNode = orderedSlotNodes[targetIndex];
        const movedVisualNode = this.deps.moveNodeToSlot(
            movingNode,
            targetSlotNode,
            order,
            insertDelaySeconds,
        );
        if (!movedVisualNode) {
            return false;
        }

        this.deps.resetNodeScale(movingNode, order);
        this.deps.ensureSlotVisualListener(movedVisualNode, targetSlotNode);
        this.assignSlotNode(targetSlotNode, movingNode, movedVisualNode);

        console.log(
            `[slotTrayController] 挪入排序: name=${movingNode.name}, targetIndex=${targetIndex}, slot=${targetSlotNode.name}`,
        );
        this.logCurrentSlotOrder(orderedSlotNodes);
        return true;
    }

    // 压缩空洞：空槽向后找最近非空并前移填补。
    public compactSlotNodes(orderedSlotNodes: SlotNode[], orderStart: number = 0) {
        let writeIndex = 0;

        for (let readIndex = 0; readIndex < orderedSlotNodes.length; readIndex += 1) {
            if (this.isSlotEmpty(orderedSlotNodes[readIndex])) {
                continue;
            }

            if (readIndex !== writeIndex) {
                this.moveSlotOccupant(
                    orderedSlotNodes[readIndex],
                    orderedSlotNodes[writeIndex],
                    orderStart,
                );
            }

            writeIndex += 1;
        }

        this.logCurrentSlotOrder(orderedSlotNodes);
    }

    // 将指定区间整体右移一位，为插入位置腾挪空间。
    private shiftSlotRangeRight(
        orderedSlotNodes: SlotNode[],
        fromIndex: number,
        toIndex: number,
        orderStart: number,
    ) {
        let movedCount = 0;
        for (let index = toIndex; index > fromIndex; index -= 1) {
            this.moveSlotOccupant(orderedSlotNodes[index - 1], orderedSlotNodes[index], orderStart);
            movedCount += 1;
        }

        return movedCount;
    }

    // 将一个 slot 的占用数据与视觉节点迁移到另一个 slot。
    private moveSlotOccupant(fromSlotNode: SlotNode, toSlotNode: SlotNode, order: number) {
        const movedInNode = fromSlotNode.__movedInNode;
        const movedInVisualNode = fromSlotNode.__movedInVisualNode;
        if (!movedInNode || !movedInVisualNode) {
            this.clearSlotNode(toSlotNode);
            return;
        }

        const targetNode = this.deps.getMoveTargetNode(toSlotNode);
        if (!targetNode) {
            return;
        }

        this.deps.moveVisualToHost(movedInVisualNode, targetNode, order);

        this.assignSlotNode(toSlotNode, movedInNode, movedInVisualNode);
        this.clearSlotNode(fromSlotNode);
    }

    // 写入 slot 的占用状态与映射关系。
    private assignSlotNode(slotNode: SlotNode, movedInNode: Node, movedInVisualNode: Node) {
        slotNode.__hasNode = true;
        slotNode.__movedInNode = movedInNode;
        slotNode.__movedInVisualNode = movedInVisualNode;
        this.deps.mapVisualToSlot(movedInVisualNode, slotNode);
    }

    // 从指定起点开始查找第一个空 slot 索引。
    private findFirstEmptyIndex(orderedSlotNodes: SlotNode[], startIndex: number) {
        for (let i = startIndex; i < orderedSlotNodes.length; i += 1) {
            if (this.isSlotEmpty(orderedSlotNodes[i])) {
                return i;
            }
        }

        return -1;
    }

    // 找到同名连续块结束后第一个可插入的索引位置。
    private findIndexAfterSameNameBlock(
        orderedSlotNodes: SlotNode[],
        startIndex: number,
        targetName: string,
    ) {
        let index = startIndex;
        while (index < orderedSlotNodes.length) {
            const movedInName = orderedSlotNodes[index].__movedInNode?.name;
            if (movedInName !== targetName) {
                break;
            }

            index += 1;
        }

        return index;
    }

    // 打印当前 slot 占用顺序，用于调试插入与压缩流程。
    private logCurrentSlotOrder(orderedSlotNodes: SlotNode[]) {
        const orderedInfo = orderedSlotNodes
            .map(
                (slotNode, index) =>
                    `${index}:${slotNode.name}(${slotNode.__movedInNode?.name || "empty"})`,
            )
            .join(" | ");
        console.log(`[slotTrayController] 当前slot顺序: ${orderedInfo}`);
    }
}
