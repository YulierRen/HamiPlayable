import { Node, Vec3 } from "cc";

export type SlotNode = Node & {
    __hasNode?: boolean;
    __movedInNode?: Node | null;
    __movedInVisualNode?: Node | null;
};

export type NodeState = {
    position: Vec3;
    scale: Vec3;
};
