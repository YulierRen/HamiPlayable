import { EventTouch, Node, UITransform, Vec3 } from "cc";
import { mapHelper } from "../../singleton/mapHelper";
import { nodeAnimationService } from "../animation/nodeAnimationService";
import { InitialChainStateService } from "../services/initialChainStateService";

type InitialState = {
    position: Vec3;
    scale: Vec3;
};

export class initialNodeController {
    private static readonly CLICK_SNAP_RADIUS = 50;

    private readonly boundInitialNodes = new Set<Node>();
    private readonly enlargedInitialNodes = new Set<Node>();
    private readonly chainState = new InitialChainStateService();
    private readonly initialStates = new Map<Node, InitialState>();
    private readonly visualStates = new Map<Node, InitialState>();
    private readonly nodeHandlers = new Map<Node, (event: EventTouch) => void>();
    private onInitialInteraction: (() => void) | null = null;
    private rootHandlerBound = false;

    // 初始化控制器并注入根节点与地图查询能力。
    public constructor(
        private readonly rootNode: Node,
        private readonly map: mapHelper,
    ) {}

    // 绑定初始节点点击监听并缓存初始视觉状态。
    public bind(initialNodes: Node[]) {
        for (const initialNode of initialNodes) {
            if (this.boundInitialNodes.has(initialNode)) {
                continue;
            }

            this.initialStates.set(initialNode, {
                position: initialNode.position.clone(),
                scale: initialNode.scale.clone(),
            });

            const visualNode = this.getVisualNode(initialNode);
            this.visualStates.set(initialNode, {
                position: visualNode.position.clone(),
                scale: visualNode.scale.clone(),
            });

            const nodeHandler = (event: EventTouch) => this.onInitialNodeClick(initialNode, event);
            initialNode.on(Node.EventType.TOUCH_END, nodeHandler, this);
            this.nodeHandlers.set(initialNode, nodeHandler);
            this.boundInitialNodes.add(initialNode);
        }

        if (!this.rootHandlerBound) {
            this.rootNode.on(Node.EventType.TOUCH_END, this.onRootTouchEnd, this);
            this.rootHandlerBound = true;
        }
    }

    // 返回当前连锁节点列表快照。
    public getChainedNodes() {
        return this.chainState.getChainedNodes();
    }

    // 订阅连锁节点变化并返回取消订阅函数。
    public onChainedNodesChanged(listener: (nodes: Node[]) => void) {
        return this.chainState.onChainedNodesChanged(listener);
    }

    // 设置 initial 区交互时的外部回调。
    public setOnInitialInteraction(listener: (() => void) | null) {
        this.onInitialInteraction = listener;
    }

    // 收起当前已浮起的连锁节点。
    public collapseChainedNodes() {
        this.restoreAllEnlargedNodes();
    }

    // 将指定节点恢复到记录的原始缩放。
    public resetNodeScale(node: Node, order: number = 0) {
        const visualState = this.visualStates.get(node);
        const visualNode = this.getVisualNode(node);
        if (!visualState) {
            return;
        }

        nodeAnimationService.animateScale(visualNode, visualState.scale, order);
        this.enlargedInitialNodes.delete(node);
    }

    // 将节点移动到 slot（复用通用目标移动逻辑）。
    public moveNodeToSlot(node: Node, slotNode: Node, order: number = 0, delaySeconds: number = 0) {
        return this.moveNodeToTarget(node, slotNode, order, delaySeconds);
    }

    // 将节点视觉体挂到目标容器并移除其 initial 点击监听。
    public moveNodeToTarget(
        node: Node,
        targetHostNode: Node,
        order: number = 0,
        delaySeconds: number = 0,
    ) {
        const visualNode = this.getVisualNode(node);
        if (targetHostNode.children.length === 0) {
            return null;
        }

        const firstChildNode = targetHostNode.children[0];
        const targetNode =
            firstChildNode.children.length === 0 ? firstChildNode : firstChildNode.children[0];

        nodeAnimationService.moveToHost(
            visualNode,
            targetNode,
            new Vec3(0, 0, 0),
            undefined,
            order,
            undefined,
            delaySeconds,
        );

        const handler = this.nodeHandlers.get(node);
        if (handler) {
            node.off(Node.EventType.TOUCH_END, handler, this);
            this.nodeHandlers.delete(node);
        }

        this.boundInitialNodes.delete(node);
        return visualNode;
    }

    // 从连锁集合中移除一组节点并刷新顺序与通知。
    public removeChainedNodes(nodes: Node[]) {
        this.chainState.removeChainedNodes(nodes, this.enlargedInitialNodes);
    }

    // 通过触摸位置尝试命中最近的 initial 节点并触发其点击逻辑。
    public tryHandleNearestInitialByTouch(event: EventTouch) {
        const nearestNode = this.findNearestInitialNodeByTouch(event);
        if (!nearestNode) {
            return false;
        }

        this.onInitialNodeClick(nearestNode, event);
        return true;
    }

    // 处理 initial 节点点击：触发回调、连锁查找与切换。
    private onInitialNodeClick(node: Node, event?: EventTouch) {
        if (event) {
            event.propagationStopped = true;
        }
        this.onInitialInteraction?.();

        if (!this.initialStates.has(node)) {
            return;
        }

        const connectedNodes = this.map.findConnectedSameNameNodes(node, this.initialStates);
        if (connectedNodes.length === 0) {
            return;
        }
        this.toggleConnectedNodes(node, connectedNodes);
    }

    // 在“选中连锁”和“取消连锁”两种状态之间切换。
    private toggleConnectedNodes(clickedNode: Node, connectedNodes: Node[]) {
        if (this.enlargedInitialNodes.has(clickedNode)) {
            for (const node of connectedNodes) {
                this.restoreNode(node);
            }
            this.chainState.clearChainedMarks();
            return;
        }

        this.restoreAllEnlargedNodes();
        this.chainState.markChainedNodes(connectedNodes);
        for (const node of connectedNodes) {
            this.enlargeNode(node);
        }
    }

    // 处理根节点触摸：仅在未命中 initial/slot/base 时按最近 initial 兜底。
    private onRootTouchEnd(event: EventTouch) {
        const targetNode = event.target as Node | null;
        if (
            this.isInitialNodeOrChild(targetNode) ||
            this.isSlotTrayOrChild(targetNode) ||
            this.isBaseNodeOrChild(targetNode)
        ) {
            return;
        }

        const nearestNode = this.findNearestInitialNodeByTouch(event);
        if (nearestNode) {
            this.onInitialNodeClick(nearestNode);
        }
    }

    // 判断目标是否为 initial 节点或其后代。
    private isInitialNodeOrChild(targetNode: Node | null) {
        let currentNode = targetNode;

        while (currentNode) {
            if (this.initialStates.has(currentNode)) {
                return true;
            }

            currentNode = currentNode.parent;
        }

        return false;
    }

    // 判断目标是否为 slotTray 或其后代。
    private isSlotTrayOrChild(targetNode: Node | null) {
        const slotTray = this.map.getSlotTray();
        if (!slotTray) {
            return false;
        }

        let currentNode = targetNode;
        while (currentNode) {
            if (currentNode === slotTray) {
                return true;
            }

            currentNode = currentNode.parent;
        }

        return false;
    }

    // 判断目标是否为 base 节点或其后代。
    private isBaseNodeOrChild(targetNode: Node | null) {
        let currentNode = targetNode;
        const baseNodes = this.map.getBaseNodes();

        while (currentNode) {
            if (baseNodes.indexOf(currentNode) >= 0) {
                return true;
            }

            currentNode = currentNode.parent;
        }

        return false;
    }

    // 恢复所有已浮起节点，并清空连锁标记。
    private restoreAllEnlargedNodes() {
        for (const node of Array.from(this.enlargedInitialNodes)) {
            this.restoreNode(node);
        }

        this.chainState.clearChainedMarks();
    }

    // 将节点执行浮起效果（位置上移并放大）。
    private enlargeNode(node: Node) {
        const visualState = this.visualStates.get(node);
        const visualNode = this.getVisualNode(node);
        if (!visualState) {
            return;
        }

        const enlargedPosition = visualState.position.clone();
        enlargedPosition.y += 10;

        const enlargedScale = visualState.scale.clone();
        enlargedScale.multiplyScalar(1.1);
        nodeAnimationService.animateToState(visualNode, enlargedPosition, enlargedScale);
        this.enlargedInitialNodes.add(node);
    }

    // 将节点恢复到原始位置和缩放。
    private restoreNode(node: Node) {
        const visualState = this.visualStates.get(node);
        const visualNode = this.getVisualNode(node);
        if (!visualState) {
            return;
        }

        nodeAnimationService.animateToState(visualNode, visualState.position, visualState.scale);
        this.enlargedInitialNodes.delete(node);
    }

    // 根据触摸点在半径内寻找最近的 initial 节点。
    private findNearestInitialNodeByTouch(event: EventTouch) {
        const rootTransform = this.rootNode.getComponent(UITransform);
        if (!rootTransform) {
            return null;
        }

        const uiLocation = event.getUILocation();
        const clickWorldPos = new Vec3(uiLocation.x, uiLocation.y, 0);
        const clickLocalPos = rootTransform.convertToNodeSpaceAR(clickWorldPos);

        let nearestNode: Node | null = null;
        let minDistance = Number.POSITIVE_INFINITY;

        for (const node of this.boundInitialNodes) {
            const visualNode = this.getVisualNode(node);
            const nodeLocalPos = new Vec3();
            this.rootNode.inverseTransformPoint(nodeLocalPos, visualNode.worldPosition);
            const dx = nodeLocalPos.x - clickLocalPos.x;
            const dy = nodeLocalPos.y - clickLocalPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= initialNodeController.CLICK_SNAP_RADIUS && distance < minDistance) {
                minDistance = distance;
                nearestNode = node;
            }
        }

        return nearestNode;
    }

    // 获取节点的可视子节点（优先同名子节点，否则返回自身）。
    private getVisualNode(node: Node) {
        return node.getChildByName(node.name) || node;
    }

    // 解绑所有监听并清理运行期状态。
    public destroy() {
        for (const [node, handler] of this.nodeHandlers) {
            node.off(Node.EventType.TOUCH_END, handler, this);
        }

        if (this.rootHandlerBound) {
            this.rootNode.off(Node.EventType.TOUCH_END, this.onRootTouchEnd, this);
        }

        this.nodeHandlers.clear();
        this.boundInitialNodes.clear();
        this.enlargedInitialNodes.clear();
        this.chainState.reset();
        this.initialStates.clear();
        this.visualStates.clear();
        this.rootHandlerBound = false;
    }
}
