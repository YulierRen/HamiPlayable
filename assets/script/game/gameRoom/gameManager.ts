import { _decorator, Component, Node } from "cc";
import { mapHelper } from "../singleton/mapHelper";
import { nodeAnimationService } from "./animation/nodeAnimationService";
import { baseController } from "./controller/baseController";
import { initialNodeController } from "./controller/initialNodeController";
import { slotTrayController } from "./controller/slotTrayController";
const { ccclass } = _decorator;

@ccclass("gameManager")
export class gameManager extends Component {
    private baseController: baseController | null = null;
    private initialNodeController: initialNodeController | null = null;
    private slotTrayController: slotTrayController | null = null;
    private ani: Node | null = null;

    // 进入游戏时创建并绑定各控制器以及交互联动。
    public enterGame() {
        if (this.initialNodeController) {
            return;
        }

        const map = mapHelper.Instance;
        this.initialNodeController = new initialNodeController(this.node, map);
        this.initialNodeController.bind(map.getInitialNodes());
        this.slotTrayController = new slotTrayController(this.initialNodeController);

        this.initialNodeController.setOnInitialInteraction(() => {
            this.slotTrayController?.clearSlotHighlights();
        });
        this.slotTrayController.setOnSlotInteraction(() => {
            this.initialNodeController?.collapseChainedNodes();
        });

        this.slotTrayController.bind();
        this.baseController = new baseController(
            this.initialNodeController,
            this.slotTrayController,
        );
        this.baseController.bind();

        this.ani = this.node.getChildByName("ani");
        if (!this.ani) {
            console.warn("[gameManager] 未找到 ani 过渡层节点，将回退为目标父节点内移动");
        }
        nodeAnimationService.setTransitHost(this.ani);
    }

    // 组件销毁时释放控制器与监听关系。
    protected onDestroy() {
        this.baseController?.destroy();
        this.baseController = null;
        this.initialNodeController?.setOnInitialInteraction(null);
        this.slotTrayController?.setOnSlotInteraction(null);
        this.initialNodeController?.destroy();
        this.initialNodeController = null;
        this.slotTrayController?.destroy();
        this.slotTrayController = null;
        nodeAnimationService.setTransitHost(null);
        this.ani = null;
    }
}
