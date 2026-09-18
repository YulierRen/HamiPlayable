import { EventTouch, Node, UITransform, Vec3 } from "cc";
import { mapHelper } from "../../singleton/mapHelper";
import { nodeAnimationService } from "../animation/nodeAnimationService";
import { SlotArrangementService } from "../services/slotArrangementService";
import { NodeState, SlotNode } from "../types/slotTypes";
import { initialNodeController } from "./initialNodeController";

export class slotTrayController {
    private static readonly SLOT_LIFT_Y = 6;
    private static readonly SLOT_SCALE_FACTOR = 1.05;
    private static readonly SLOT_CLICK_SNAP_RADIUS = 30;

    private slotTray: Node | null = null;
    private slotNodes: Node[] = [];
    private chainedNodeList: Node[] = [];
    private slotTrayListening = false;
    private disposeChainedNodeChanged: (() => void) | null = null;
    private onSlotInteraction: (() => void) | null = null;
    private readonly slotNodeByVisual = new Map<Node, SlotNode>();
    private readonly slotVisualHandlers = new Map<Node, (event: EventTouch) => void>();
    private readonly slotVisualStates = new Map<Node, NodeState>();
    private readonly highlightedSlotVisualNodes = new Set<Node>();
    private readonly slotArrangementService: SlotArrangementService;

    // 初始化 slot 控制器并订阅 initial 连锁变化。
    public constructor(private readonly initialController: initialNodeController) {
        this.slotArrangementService = new SlotArrangementService({
            mapVisualToSlot: (visualNode, slotNode) => {
                this.slotNodeByVisual.set(visualNode, slotNode);
            },
            getMoveTargetNode: (hostNode) => this.getMoveTargetNode(hostNode),
            ensureSlotVisualListener: (visualNode, slotNode) =>
                this.ensureSlotVisualListener(visualNode, slotNode),
            moveNodeToSlot: (movingNode, slotNode, order, delaySeconds) =>
                this.initialController.moveNodeToSlot(movingNode, slotNode, order, delaySeconds),
            resetNodeScale: (node, order) => this.initialController.resetNodeScale(node, order),
            moveVisualToHost: (visualNode, targetNode, order) =>
                nodeAnimationService.moveToHost(
                    visualNode,
                    targetNode,
                    new Vec3(0, 0, 0),
                    undefined,
                    order,
                ),
        });

        this.disposeChainedNodeChanged = this.initialController.onChainedNodesChanged((nodes) => {
            this.chainedNodeList = [...nodes];
            this.refreshSlotTrayListening();
        });
    }

    // 绑定 slotTray 与 slot 节点，初始化标记并刷新监听状态。
    public bind() {
        if (this.slotTray) {
            return;
        }

        this.slotNodes = [];

        const slotTray = mapHelper.Instance.getSlotTray();
        if (!slotTray) {
            console.warn("[slotTrayController] 未找到 slotTray");
            return;
        }

        this.slotTray = slotTray;
        this.slotNodes = mapHelper.Instance.getSlotNodes();
        this.initSlotNodeFlags();
        this.refreshSlotTrayListening();
    }

    // 解绑所有 slot 相关监听并清理运行态缓存。
    public destroy() {
        for (const [visualNode, handler] of this.slotVisualHandlers) {
            visualNode.off(Node.EventType.TOUCH_END, handler, this);
        }

        this.slotVisualHandlers.clear();
        this.slotNodeByVisual.clear();
        this.slotVisualStates.clear();
        this.highlightedSlotVisualNodes.clear();
        this.chainedNodeList = [];

        if (this.slotTray && this.slotTrayListening) {
            this.slotTray.off(Node.EventType.TOUCH_END, this.onSlotTrayClick, this);
            this.slotTrayListening = false;
        }

        this.slotTray = null;
        this.slotNodes = [];
        this.onSlotInteraction = null;
        this.disposeChainedNodeChanged?.();
        this.disposeChainedNodeChanged = null;
    }

    // 设置 slot 交互时对外通知回调。
    public setOnSlotInteraction(listener: (() => void) | null) {
        this.onSlotInteraction = listener;
    }

    // 清空当前 slot 浮起高亮状态。
    public clearSlotHighlights() {
        this.restoreHighlightedSlotVisualNodes();
    }

    // 获取当前浮起节点，按 slot 顺序返回。
    public getHighlightedSlotVisualNodes() {
        return this.getSortedHighlightedSlotVisualNodes();
    }

    // 将已浮起 slot 节点移动到目标宿主并从 slot 状态中摘除。
    public moveHighlightedNodeToTarget(
        visualNode: Node,
        targetHostNode: Node,
        order: number = 0,
        suppressCompact: boolean = false,
        onMoveComplete?: () => void,
    ) {
        const slotNode = this.slotNodeByVisual.get(visualNode);
        if (!slotNode) {
            return null;
        }

        const targetNode = this.getMoveTargetNode(targetHostNode);
        if (!targetNode) {
            return null;
        }

        nodeAnimationService.moveToHost(
            visualNode,
            targetNode,
            new Vec3(0, 0, 0),
            new Vec3(1, 1, 1),
            order,
            onMoveComplete,
        );

        this.detachMovedOutSlotVisual(slotNode, visualNode, suppressCompact);
        this.refreshSlotTrayListening();
        return visualNode;
    }

    // 在批量挪出结束后手动触发一次压缩。
    public compactSlotsAfterMoveOutBatch() {
        this.slotArrangementService.compactSlotNodes(this.getSlotNodesInOrder());
        this.refreshSlotTrayListening();
    }

    // 处理 slotTray 根点击：优先子节点交互，否则尝试从 initial 挪入。
    private onSlotTrayClick(event: EventTouch) {
        event.propagationStopped = true;

        const targetNode = event.target as Node | null;
        if (this.findSlotVisualByTarget(targetNode)) {
            // 命中已移入节点时由子节点监听处理，避免同次点击被根监听重复处理。
            return;
        }

        if (this.tryHandleSlotVisualInteraction(event)) {
            return;
        }

        this.tryMoveChainedNodesToEmptySlots();
    }

    // 处理已移入 slot 节点点击或近邻命中，并切换浮起态。
    private tryHandleSlotVisualInteraction(event: EventTouch) {
        const clickedSlotVisualNode =
            this.resolveClickedSlotVisualNode(event) ||
            this.findNearestSlotVisualNodeByTouch(event);
        if (!clickedSlotVisualNode) {
            return false;
        }

        this.onSlotInteraction?.();

        if (this.highlightedSlotVisualNodes.has(clickedSlotVisualNode)) {
            this.restoreHighlightedSlotVisualNodes();
            return true;
        }

        this.highlightFromSlotVisualNode(clickedSlotVisualNode);
        return true;
    }

    // 将 initial 连锁节点按可用空槽挪入 slot。
    private tryMoveChainedNodesToEmptySlots() {
        if (this.chainedNodeList.length === 0) {
            this.refreshSlotTrayListening();
            return;
        }

        const orderedSlotNodes = this.getSlotNodesInOrder();
        const emptySlotNodes = orderedSlotNodes.filter((slotNode) =>
            this.slotArrangementService.isSlotEmpty(slotNode),
        );
        if (emptySlotNodes.length === 0) {
            return;
        }

        const moveCount = Math.min(this.chainedNodeList.length, emptySlotNodes.length);
        const movedNodes = this.moveNodesToSlots(moveCount);

        this.initialController.removeChainedNodes(movedNodes);
        console.log(`[slotTrayController] 已移入节点数量: ${movedNodes.length}`);
    }

    // 按数量逐个执行挪入并返回成功挪入的节点列表。
    private moveNodesToSlots(moveCount: number) {
        const movedNodes: Node[] = [];
        this.restoreHighlightedSlotVisualNodes();

        for (let i = 0; i < moveCount; i += 1) {
            const movingNode = this.chainedNodeList[i];
            if (
                !this.slotArrangementService.tryInsertNodeIntoSlots(
                    movingNode,
                    this.getSlotNodesInOrder(),
                    i,
                )
            ) {
                break;
            }

            movedNodes.push(movingNode);
        }

        return movedNodes;
    }

    // 初始化 slot 节点挂载字段，保证后续逻辑可读可写。
    private initSlotNodeFlags() {
        for (const slotNode of this.slotNodes) {
            const typedSlotNode = slotNode as SlotNode;
            if (typedSlotNode.__hasNode === undefined) {
                typedSlotNode.__hasNode = false;
            }

            if (typedSlotNode.__movedInNode === undefined) {
                typedSlotNode.__movedInNode = null;
            }

            if (typedSlotNode.__movedInVisualNode === undefined) {
                typedSlotNode.__movedInVisualNode = null;
            }
        }
    }

    // 为移入的视觉节点挂点击监听并记录其原始状态。
    private ensureSlotVisualListener(visualNode: Node, slotNode: SlotNode) {
        if (this.slotVisualHandlers.has(visualNode)) {
            this.slotNodeByVisual.set(visualNode, slotNode);
            return;
        }

        const state: NodeState = {
            position: visualNode.position.clone(),
            scale: visualNode.scale.clone(),
        };
        this.slotVisualStates.set(visualNode, state);
        this.slotNodeByVisual.set(visualNode, slotNode);

        const handler = (event: EventTouch) => this.onSlotVisualNodeClick(visualNode, event);
        visualNode.on(Node.EventType.TOUCH_END, handler, this);
        this.slotVisualHandlers.set(visualNode, handler);
    }

    // 从事件目标解析被点击的 slot 视觉节点。
    private resolveClickedSlotVisualNode(event: EventTouch) {
        const targetNode = event.target as Node | null;
        const directVisualNode = this.findSlotVisualByTarget(targetNode);
        if (directVisualNode) {
            return directVisualNode;
        }

        const slotNode = this.findSlotNodeByTarget(targetNode);
        if (!slotNode) {
            return null;
        }

        return slotNode.__movedInVisualNode || null;
    }

    // 从目标节点向上查找是否命中已登记的 slot 视觉节点。
    private findSlotVisualByTarget(targetNode: Node | null) {
        let currentNode = targetNode;

        while (currentNode) {
            if (this.slotNodeByVisual.has(currentNode)) {
                return currentNode;
            }

            currentNode = currentNode.parent;
        }

        return null;
    }

    // 从目标节点向上查找所属的 slot 容器节点。
    private findSlotNodeByTarget(targetNode: Node | null) {
        let currentNode = targetNode;

        while (currentNode) {
            const slotNode = this.slotNodes.find((node) => node === currentNode) as
                | SlotNode
                | undefined;
            if (slotNode) {
                return slotNode;
            }

            currentNode = currentNode.parent;
        }

        return null;
    }

    // 以点击节点为中心查找同名连续块并执行浮起。
    private highlightFromSlotVisualNode(clickedVisualNode: Node) {
        const slotNode = this.slotNodeByVisual.get(clickedVisualNode);
        if (!slotNode) {
            return;
        }

        const chainedVisualNodes = this.findContiguousSameNameVisualNodes(
            slotNode,
            clickedVisualNode.name,
        );
        if (chainedVisualNodes.length === 0) {
            return;
        }

        this.restoreHighlightedSlotVisualNodes();
        for (const visualNode of chainedVisualNodes) {
            this.liftSlotVisualNode(visualNode);
        }
    }

    // 处理 slot 内视觉节点点击并切换当前连锁浮起态。
    private onSlotVisualNodeClick(clickedVisualNode: Node, event: EventTouch) {
        event.propagationStopped = true;

        this.onSlotInteraction?.();

        const slotNode = this.slotNodeByVisual.get(clickedVisualNode);
        const slotIndex = slotNode ? this.slotNodes.indexOf(slotNode) : -1;
        console.log(
            `[slotTrayController] 点击已移入节点: ${clickedVisualNode.name}, slotIndex: ${slotIndex}`,
        );

        if (this.highlightedSlotVisualNodes.has(clickedVisualNode)) {
            this.restoreHighlightedSlotVisualNodes();
            return;
        }

        this.highlightFromSlotVisualNode(clickedVisualNode);
    }

    // 在 slot 线性序列中查找与起点相邻连续同名的视觉节点组。
    private findContiguousSameNameVisualNodes(startSlotNode: SlotNode, targetName: string) {
        const startIndex = this.slotNodes.indexOf(startSlotNode);
        if (startIndex < 0) {
            return [];
        }

        const result: Node[] = [];

        const centerVisualNode = startSlotNode.__movedInVisualNode;
        if (!centerVisualNode || centerVisualNode.name !== targetName) {
            return result;
        }

        result.push(centerVisualNode);

        for (let i = startIndex - 1; i >= 0; i -= 1) {
            const slotNode = this.slotNodes[i] as SlotNode;
            const visualNode = slotNode.__movedInVisualNode;
            if (!visualNode || visualNode.name !== targetName) {
                break;
            }

            result.unshift(visualNode);
        }

        for (let i = startIndex + 1; i < this.slotNodes.length; i += 1) {
            const slotNode = this.slotNodes[i] as SlotNode;
            const visualNode = slotNode.__movedInVisualNode;
            if (!visualNode || visualNode.name !== targetName) {
                break;
            }

            result.push(visualNode);
        }

        return result;
    }

    // 将节点应用浮起视觉效果并加入高亮集合。
    private liftSlotVisualNode(visualNode: Node) {
        const originalState: NodeState = {
            position: visualNode.position.clone(),
            scale: visualNode.scale.clone(),
        };
        this.slotVisualStates.set(visualNode, originalState);

        const liftedPosition = originalState.position.clone();
        liftedPosition.y += slotTrayController.SLOT_LIFT_Y;

        const liftedScale = originalState.scale.clone();
        liftedScale.multiplyScalar(slotTrayController.SLOT_SCALE_FACTOR);
        nodeAnimationService.animateToState(visualNode, liftedPosition, liftedScale);

        this.highlightedSlotVisualNodes.add(visualNode);
    }

    // 恢复所有浮起节点到记录的原始位置与缩放。
    private restoreHighlightedSlotVisualNodes() {
        for (const visualNode of this.highlightedSlotVisualNodes) {
            const originalState = this.slotVisualStates.get(visualNode);
            if (!originalState) {
                continue;
            }

            nodeAnimationService.animateToState(
                visualNode,
                originalState.position,
                originalState.scale,
            );
        }

        this.highlightedSlotVisualNodes.clear();
    }

    // 返回当前高亮节点并按 slot 索引从左到右排序。
    private getSortedHighlightedSlotVisualNodes() {
        return Array.from(this.highlightedSlotVisualNodes).sort((a, b) => {
            const slotA = this.slotNodeByVisual.get(a);
            const slotB = this.slotNodeByVisual.get(b);
            const indexA = slotA ? this.slotNodes.indexOf(slotA) : Number.MAX_SAFE_INTEGER;
            const indexB = slotB ? this.slotNodes.indexOf(slotB) : Number.MAX_SAFE_INTEGER;
            return indexA - indexB;
        });
    }

    // 获取可挂载视觉节点的目标容器（子节点或孙节点）。
    private getMoveTargetNode(hostNode: Node) {
        if (hostNode.children.length === 0) {
            return null;
        }

        const firstChildNode = hostNode.children[0];
        if (firstChildNode.children.length === 0) {
            return firstChildNode;
        }

        return firstChildNode.children[0];
    }

    // 从 slot 状态中移除已挪出的视觉节点并触发空槽压缩。
    private detachMovedOutSlotVisual(
        slotNode: SlotNode,
        visualNode: Node,
        suppressCompact: boolean = false,
    ) {
        const handler = this.slotVisualHandlers.get(visualNode);
        if (handler) {
            visualNode.off(Node.EventType.TOUCH_END, handler, this);
            this.slotVisualHandlers.delete(visualNode);
        }

        this.slotVisualStates.delete(visualNode);
        this.highlightedSlotVisualNodes.delete(visualNode);
        this.slotNodeByVisual.delete(visualNode);

        this.slotArrangementService.clearSlotNode(slotNode);
        if (!suppressCompact) {
            this.slotArrangementService.compactSlotNodes(this.getSlotNodesInOrder());
        }
    }

    // 读取 slot 并按 siblingIndex 排成固定顺序。
    private getSlotNodesInOrder() {
        if (this.slotNodes.length === 0) {
            return [] as SlotNode[];
        }

        const sortedNodes = this.slotNodes
            .map((node) => node as SlotNode)
            .sort((a, b) => a.getSiblingIndex() - b.getSiblingIndex());
        this.slotNodes = [...sortedNodes];
        return sortedNodes;
    }

    // 按触摸点半径在 slotTray 中寻找最近的视觉节点。
    private findNearestSlotVisualNodeByTouch(event: EventTouch) {
        if (!this.slotTray) {
            return null;
        }

        const slotTrayTransform = this.slotTray.getComponent(UITransform);
        if (!slotTrayTransform) {
            return null;
        }

        const uiLocation = event.getUILocation();
        const clickWorldPos = new Vec3(uiLocation.x, uiLocation.y, 0);
        const clickLocalPos = slotTrayTransform.convertToNodeSpaceAR(clickWorldPos);

        let nearestVisualNode: Node | null = null;
        let minDistance = Number.POSITIVE_INFINITY;

        for (const visualNode of this.slotNodeByVisual.keys()) {
            const visualLocalPos = new Vec3();
            this.slotTray.inverseTransformPoint(visualLocalPos, visualNode.worldPosition);

            const dx = visualLocalPos.x - clickLocalPos.x;
            const dy = visualLocalPos.y - clickLocalPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= slotTrayController.SLOT_CLICK_SNAP_RADIUS && distance < minDistance) {
                minDistance = distance;
                nearestVisualNode = visualNode;
            }
        }

        return nearestVisualNode;
    }

    // 根据当前状态刷新 slotTray 根监听开关。
    private refreshSlotTrayListening() {
        this.setSlotTrayListening(this.shouldEnableSlotTrayListening());
    }

    // 判断是否应启用 slotTray 根监听。
    private shouldEnableSlotTrayListening() {
        const hasMovedInNodes = this.slotNodeByVisual.size > 0;
        if (hasMovedInNodes) {
            return true;
        }

        const hasChainedNodes = this.chainedNodeList.length > 0;
        const hasEmptySlotNodes = this.slotNodes.some((slotNode) => {
            const typedSlotNode = slotNode as SlotNode;
            return this.slotArrangementService.isSlotEmpty(typedSlotNode);
        });
        return hasChainedNodes && hasEmptySlotNodes;
    }

    // 统一设置 slotTray 根触摸监听的启停。
    private setSlotTrayListening(enabled: boolean) {
        if (!this.slotTray) {
            return;
        }

        if (enabled && !this.slotTrayListening) {
            this.slotTray.on(Node.EventType.TOUCH_END, this.onSlotTrayClick, this);
            this.slotTrayListening = true;
            return;
        }

        if (!enabled && this.slotTrayListening) {
            this.slotTray.off(Node.EventType.TOUCH_END, this.onSlotTrayClick, this);
            this.slotTrayListening = false;
        }
    }
}
