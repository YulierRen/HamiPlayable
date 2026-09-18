import { Vec3 } from "cc";
import { mapHelper } from "../../singleton/mapHelper";
import { BaseNode } from "../types/baseTypes";

export class BaseConnectivityService {
    private static readonly BASE_STEP = 32;

    private readonly baseNodePositions = new Map<BaseNode, Vec3>();
    private readonly baseNodesByPosition = new Map<string, BaseNode>();

    // 缓存 base 坐标并初始化占用状态。
    public prepareBaseNode(baseNode: BaseNode) {
        if (!this.baseNodePositions.has(baseNode)) {
            const position = baseNode.position.clone();
            this.baseNodePositions.set(baseNode, position);
            this.baseNodesByPosition.set(this.getPositionKey(position.x, position.y), baseNode);
        }

        if (baseNode.__hasMovedInNode === undefined) {
            baseNode.__hasMovedInNode = false;
        }

        if (baseNode.__movedInVisualNode === undefined) {
            baseNode.__movedInVisualNode = null;
        }
    }

    // 清理连通性相关缓存。
    public reset() {
        this.baseNodePositions.clear();
        this.baseNodesByPosition.clear();
    }

    // 从起点 base 执行同名九宫格 BFS，过滤被阻断节点。
    public findConnectedBaseNodes(startBaseNode: BaseNode) {
        if (this.isBlockedByInitialNode(startBaseNode)) {
            return [];
        }

        if (this.isBlockedByBaseChildCount(startBaseNode)) {
            console.log(
                `[baseController] base双子节点阻断(起点): base=${startBaseNode.name}, x=${startBaseNode.position.x}, y=${startBaseNode.position.y}`,
            );
            return [];
        }

        const connectedNodes: BaseNode[] = [];
        const visitedNodes = new Set<BaseNode>([startBaseNode]);
        const nodesToVisit: BaseNode[] = [startBaseNode];
        const offsets = [-BaseConnectivityService.BASE_STEP, 0, BaseConnectivityService.BASE_STEP];

        while (nodesToVisit.length > 0) {
            const currentNode = nodesToVisit.shift() as BaseNode;
            connectedNodes.push(currentNode);

            const currentPosition = this.baseNodePositions.get(currentNode);
            if (!currentPosition) {
                continue;
            }

            for (const offsetX of offsets) {
                for (const offsetY of offsets) {
                    if (offsetX === 0 && offsetY === 0) {
                        continue;
                    }

                    const neighborNode = this.baseNodesByPosition.get(
                        this.getPositionKey(
                            currentPosition.x + offsetX,
                            currentPosition.y + offsetY,
                        ),
                    );
                    if (!neighborNode || visitedNodes.has(neighborNode)) {
                        continue;
                    }

                    if (neighborNode.name !== startBaseNode.name) {
                        continue;
                    }

                    if (this.isBlockedByInitialNode(neighborNode)) {
                        continue;
                    }

                    if (this.isBlockedByBaseChildCount(neighborNode)) {
                        console.log(
                            `[baseController] base双子节点阻断(邻居): base=${neighborNode.name}, x=${neighborNode.position.x}, y=${neighborNode.position.y}`,
                        );
                        continue;
                    }

                    visitedNodes.add(neighborNode);
                    nodesToVisit.push(neighborNode);
                }
            }
        }

        return connectedNodes;
    }

    // 在连通 base 中筛选可接收当前名称前缀的空位节点。
    public findMovableBaseNodes(connectedBaseNodes: BaseNode[], incomingNodeName: string) {
        const incomingPrefix = incomingNodeName.slice(0, 4);
        return connectedBaseNodes.filter((baseNode) => {
            if (baseNode.__hasMovedInNode === true) {
                return false;
            }

            const basePrefix = baseNode.name.slice(0, 4);
            return basePrefix === incomingPrefix;
        });
    }

    // 判断 base 位置是否被 initial 实体占用从而阻断。
    private isBlockedByInitialNode(baseNode: BaseNode) {
        const position = this.baseNodePositions.get(baseNode) || baseNode.position;
        const initialNode = mapHelper.Instance.getInitialNodeAt(position.x, position.y);
        return !!initialNode && initialNode.children.length > 0;
    }

    // 判断 base 是否存在孙节点阻断条件。
    private isBlockedByBaseChildCount(baseNode: BaseNode) {
        const isBlocked = baseNode.children.some((childNode) => childNode.children.length > 0);
        if (isBlocked) {
            console.log(
                `[baseController] base孙节点阻断命中: base=${baseNode.name}, childCount=${baseNode.children.length}, x=${baseNode.position.x}, y=${baseNode.position.y}`,
            );
        }

        return isBlocked;
    }

    // 生成坐标索引键，统一保留两位小数用于位置匹配。
    private getPositionKey(x: number, y: number) {
        const fixedX = Number(x.toFixed(2));
        const fixedY = Number(y.toFixed(2));
        return `${fixedX.toFixed(2)},${fixedY.toFixed(2)}`;
    }
}
