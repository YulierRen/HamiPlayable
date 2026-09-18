import { Node } from "cc";

export type BaseNode = Node & {
    __hasMovedInNode?: boolean;
    __movedInVisualNode?: Node | null;
};
