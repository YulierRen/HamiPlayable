/** @format */

import { Node, Vec3 } from "cc";

export class mapHelper {
    private static instance: mapHelper;

    public readonly initial: Map<string, Node> = new Map();
    public readonly base: Map<string, Node> = new Map();
    public readonly slot: Map<string, Node> = new Map();
    private slotTray: Node = null;

    public static get Instance() {
        if (!mapHelper.instance) {
            mapHelper.instance = new mapHelper();
        }

        return mapHelper.instance;
    }

    public Init(
        initialNode: Node | null,
        baseNode: Node | null,
        slotNode: Node | null = null,
        slotTrayNode: Node | null = null,
    ) {
        this.initial.clear();
        this.base.clear();
        this.slot.clear();
        if (slotNode) {
            this.collectChildPositions(slotNode, this.slot);
        }

        if (slotTrayNode) {
            this.slotTray = slotTrayNode;
        }

        if (initialNode) {
            this.collectChildPositions(initialNode, this.initial);
        }

        if (baseNode) {
            this.collectChildPositions(baseNode, this.base);
        }
    }

    public getSlotTray(): Node | null {
        return this.slotTray;
    }

    public getInitialNodes(): Node[] {
        return Array.from(this.initial.values());
    }

    public getInitialNodeAt(x: number, y: number): Node | null {
        return this.initial.get(this.getPositionKey(x, y)) || null;
    }

    public getBaseNodes(): Node[] {
        return Array.from(this.base.values());
    }

    public getSlotNodes(): Node[] {
        return Array.from(this.slot.values());
    }

    public findConnectedSameNameNodes(
        startNode: Node,
        initialStates: ReadonlyMap<Node, { position: Vec3 }>,
    ) {
        if (!this.hasChildNode(startNode)) {
            return [];
        }

        const connectedNodes: Node[] = [];
        const visitedNodes = new Set<Node>([startNode]);
        const nodesToVisit = [startNode];
        const offsets = [-32, 0, 32];

        while (nodesToVisit.length > 0) {
            const currentNode = nodesToVisit.shift() as Node;
            connectedNodes.push(currentNode);

            const currentPosition = initialStates.get(currentNode)?.position;
            if (!currentPosition) {
                continue;
            }

            for (const offsetX of offsets) {
                for (const offsetY of offsets) {
                    if (offsetX === 0 && offsetY === 0) {
                        continue;
                    }

                    const neighborNode = this.getInitialNodeAt(
                        currentPosition.x + offsetX,
                        currentPosition.y + offsetY,
                    );

                    if (
                        neighborNode &&
                        neighborNode.name === startNode.name &&
                        this.hasChildNode(neighborNode) &&
                        !visitedNodes.has(neighborNode)
                    ) {
                        visitedNodes.add(neighborNode);
                        nodesToVisit.push(neighborNode);
                    }
                }
            }
        }

        return connectedNodes;
    }

    private collectChildPositions(parentNode: Node, targetMap: Map<string, Node>) {
        for (const childNode of parentNode.children) {
            const { x, y } = childNode.position;
            targetMap.set(this.getPositionKey(x, y), childNode);
        }
    }

    private getPositionKey(x: number, y: number) {
        const fixedX = this.toTwoDecimalPlaces(x);
        const fixedY = this.toTwoDecimalPlaces(y);
        return `${fixedX.toFixed(2)},${fixedY.toFixed(2)}`;
    }

    private toTwoDecimalPlaces(value: number) {
        return Number(value.toFixed(2));
    }

    private hasChildNode(node: Node) {
        return node.children.length > 0;
    }
}
