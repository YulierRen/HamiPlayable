/** @format */

import { _decorator, Component } from "cc";
import { mapHelper } from "./singleton/mapHelper";
import { gameManager } from "./gameRoom/gameManager";
const { ccclass, property } = _decorator;

@ccclass("root")
export class root extends Component {
    onLoad() {
        const initialNode = this.node.getChildByPath("boluo/Initial");
        const baseNode = this.node.getChildByPath("boluo/Base");
        const slotNode = this.node.getChildByName("slot_tray").getChildByName("slot");
        const slotTray = this.node.getChildByName("slot_tray");

        mapHelper.Instance.Init(initialNode, baseNode, slotNode, slotTray);
        this.node.addComponent(gameManager).enterGame();
    }
}
