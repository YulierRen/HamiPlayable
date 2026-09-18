import { _decorator, Component, Node } from "cc";
const { ccclass, executeInEditMode } = _decorator;

@ccclass("handleName")
@executeInEditMode(true)
export class handleName extends Component {
    start() {
        this.replaceSlashInNames(this.node);
    }

    private replaceSlashInNames(currentNode: Node) {
        if (currentNode.name.includes("/")) {
            currentNode.name = currentNode.name.replace(/\//g, "_");
        }

        for (const childNode of currentNode.children) {
            this.replaceSlashInNames(childNode);
        }
    }
}
