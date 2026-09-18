import { EventTouch, Node } from "cc";
import { mapHelper } from "../../singleton/mapHelper";
import { BaseConnectivityService } from "../services/baseConnectivityService";
import { BaseNode } from "../types/baseTypes";
import { initialNodeController } from "./initialNodeController";
import { slotTrayController } from "./slotTrayController";

export class baseController {
    private readonly nodeHandlers = new Map<Node, (event: EventTouch) => void>();
    private readonly boundBaseNodes = new Set<Node>();
    private readonly baseConnectivityService = new BaseConnectivityService();

    // 初始化 base 控制器并注入 initial 与 slot 协作依赖。
    public constructor(
        private readonly initialController: initialNodeController,
        private readonly slotController: slotTrayController,
    ) {}

    // 绑定 base 子节点触摸监听并初始化 base 运行态数据。
    public bind() {
        const baseNodes = mapHelper.Instance.getBaseNodes();
        for (const baseNode of baseNodes) {
            const typedBaseNode = baseNode as BaseNode;
            this.baseConnectivityService.prepareBaseNode(typedBaseNode);

            if (this.boundBaseNodes.has(typedBaseNode)) {
                continue;
            }

            for (const childNode of typedBaseNode.children) {
                const handler = (event: EventTouch) => this.onBaseChildClick(typedBaseNode, event);
                childNode.on(Node.EventType.TOUCH_END, handler, this);
                this.nodeHandlers.set(childNode, handler);
            }

            this.boundBaseNodes.add(typedBaseNode);
        }
    }

    // 解绑全部 base 监听并清理缓存。
    public destroy() {
        for (const [node, handler] of this.nodeHandlers) {
            node.off(Node.EventType.TOUCH_END, handler, this);
        }

        this.nodeHandlers.clear();
        this.boundBaseNodes.clear();
        this.baseConnectivityService.reset();
    }

    // 处理 base 点击：优先搬运连锁节点，失败时回落到 initial 兜底处理。
    private onBaseChildClick(baseNode: BaseNode, event: EventTouch) {
        const chainedInitialNodes = this.initialController.getChainedNodes();
        const highlightedSlotNodes = this.slotController.getHighlightedSlotVisualNodes();
        if (chainedInitialNodes.length === 0 && highlightedSlotNodes.length === 0) {
            this.initialController.tryHandleNearestInitialByTouch(event);
            return;
        }

        const preferInitial = chainedInitialNodes.length > 0;
        const incomingNodes = preferInitial ? chainedInitialNodes : highlightedSlotNodes;
        const incomingName = incomingNodes[0].name;

        const connectedBaseNodes = this.baseConnectivityService.findConnectedBaseNodes(baseNode);
        if (connectedBaseNodes.length === 0) {
            this.initialController.tryHandleNearestInitialByTouch(event);
            return;
        }

        const availableBaseNodes = this.baseConnectivityService.findMovableBaseNodes(
            connectedBaseNodes,
            incomingName,
        );
        if (availableBaseNodes.length === 0) {
            this.initialController.tryHandleNearestInitialByTouch(event);
            return;
        }

        const movedCount = preferInitial
            ? this.tryMoveInitialChainedNodes(chainedInitialNodes, availableBaseNodes)
            : this.tryMoveSlotHighlightedNodes(highlightedSlotNodes, availableBaseNodes);
        if (movedCount > 0) {
            event.propagationStopped = true;

            return;
        }

        this.initialController.tryHandleNearestInitialByTouch(event);
    }

    // 将 initial 连锁节点按可用 base 位置批量搬运。
    private tryMoveInitialChainedNodes(chainedInitialNodes: Node[], targetBaseNodes: BaseNode[]) {
        const moveCount = Math.min(chainedInitialNodes.length, targetBaseNodes.length);
        const movedInitialNodes: Node[] = [];

        for (let i = 0; i < moveCount; i += 1) {
            const initialNode = chainedInitialNodes[i];
            const targetBaseNode = targetBaseNodes[i];
            const movedVisualNode = this.initialController.moveNodeToTarget(
                initialNode,
                targetBaseNode,
                i,
            );
            if (!movedVisualNode) {
                continue;
            }

            this.initialController.resetNodeScale(initialNode, i);
            this.markBaseNodeOccupied(targetBaseNode, movedVisualNode);
            movedInitialNodes.push(initialNode);
        }

        this.initialController.removeChainedNodes(movedInitialNodes);
        return movedInitialNodes.length;
    }

    // 将 slot 浮起节点按可用 base 位置批量搬运。
    private tryMoveSlotHighlightedNodes(highlightedSlotNodes: Node[], targetBaseNodes: BaseNode[]) {
        const moveCount = Math.min(highlightedSlotNodes.length, targetBaseNodes.length);
        let movedCount = 0;
        let pendingAnimationCount = 0;

        for (let i = 0; i < moveCount; i += 1) {
            const slotVisualNode = highlightedSlotNodes[i];
            const targetBaseNode = targetBaseNodes[i];

            pendingAnimationCount += 1;
            const movedVisualNode = this.slotController.moveHighlightedNodeToTarget(
                slotVisualNode,
                targetBaseNode,
                i,
                true,
                () => {
                    pendingAnimationCount -= 1;
                    if (pendingAnimationCount === 0) {
                        this.slotController.compactSlotsAfterMoveOutBatch();
                    }
                },
            );
            if (!movedVisualNode) {
                pendingAnimationCount -= 1;
                continue;
            }

            this.markBaseNodeOccupied(targetBaseNode, movedVisualNode);
            movedCount += 1;
        }

        if (movedCount === 0 && pendingAnimationCount === 0) {
            this.slotController.compactSlotsAfterMoveOutBatch();
        }

        return movedCount;
    }

    // 标记 base 已被节点占用并保存视觉节点引用。
    private markBaseNodeOccupied(baseNode: BaseNode, movedVisualNode: Node) {
        baseNode.__hasMovedInNode = true;
        baseNode.__movedInVisualNode = movedVisualNode;
    }
}
