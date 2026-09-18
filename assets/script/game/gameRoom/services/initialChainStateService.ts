import { Node } from "cc";

type ChainMarkedNode = Node & {
    __isChained?: boolean;
    __chainOrder?: number;
};

export class InitialChainStateService {
    private readonly chainedInitialNodes = new Set<Node>();
    private chainedNodeList: Node[] = [];
    private readonly chainOrders = new Map<Node, number>();
    private readonly chainedNodeChangedListeners = new Set<(nodes: Node[]) => void>();

    // 返回当前连锁节点列表快照。
    public getChainedNodes() {
        return [...this.chainedNodeList];
    }

    // 订阅连锁节点变化并返回取消订阅函数。
    public onChainedNodesChanged(listener: (nodes: Node[]) => void) {
        this.chainedNodeChangedListeners.add(listener);
        listener(this.getChainedNodes());

        return () => {
            this.chainedNodeChangedListeners.delete(listener);
        };
    }

    // 写入连锁节点集合与顺序标记并通知外部。
    public markChainedNodes(nodes: Node[]) {
        this.clearChainedMarks();
        this.chainedNodeList = [...nodes];

        nodes.forEach((node, index) => {
            this.chainedInitialNodes.add(node);
            this.chainOrders.set(node, index + 1);

            const chainMarkedNode = node as ChainMarkedNode;
            chainMarkedNode.__isChained = true;
            chainMarkedNode.__chainOrder = index + 1;
        });

        this.notifyChainedNodesChanged();
    }

    // 清除全部连锁标记、顺序与缓存列表并通知外部。
    public clearChainedMarks() {
        for (const node of this.chainedInitialNodes) {
            const chainMarkedNode = node as ChainMarkedNode;
            chainMarkedNode.__isChained = false;
            chainMarkedNode.__chainOrder = 0;
        }

        this.chainedInitialNodes.clear();
        this.chainOrders.clear();
        this.chainedNodeList = [];
        this.notifyChainedNodesChanged();
    }

    // 从连锁集合中移除一组节点并刷新顺序与通知。
    public removeChainedNodes(nodes: Node[], enlargedInitialNodes: Set<Node>) {
        if (nodes.length === 0) {
            return;
        }

        const removedNodes = new Set(nodes);

        for (const node of nodes) {
            this.chainedInitialNodes.delete(node);
            this.chainOrders.delete(node);
            enlargedInitialNodes.delete(node);

            const chainMarkedNode = node as ChainMarkedNode;
            chainMarkedNode.__isChained = false;
            chainMarkedNode.__chainOrder = 0;
        }

        this.chainedNodeList = this.chainedNodeList.filter((node) => !removedNodes.has(node));

        this.refreshChainOrders();
        this.notifyChainedNodesChanged();
    }

    // 重置连锁状态与订阅关系。
    public reset() {
        this.clearChainedMarks();
        this.chainedNodeChangedListeners.clear();
    }

    // 根据当前连锁列表重新计算顺序编号。
    private refreshChainOrders() {
        this.chainOrders.clear();

        this.chainedNodeList.forEach((node, index) => {
            const order = index + 1;
            this.chainOrders.set(node, order);

            const chainMarkedNode = node as ChainMarkedNode;
            chainMarkedNode.__isChained = true;
            chainMarkedNode.__chainOrder = order;
        });
    }

    // 向所有订阅方广播最新连锁节点快照。
    private notifyChainedNodesChanged() {
        const snapshot = this.getChainedNodes();
        for (const listener of this.chainedNodeChangedListeners) {
            listener(snapshot);
        }
    }
}
