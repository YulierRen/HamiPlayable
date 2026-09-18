import { Mat4, Node, Tween, Vec3, tween } from "cc";
import type { TweenEasing } from "cc";
import { animationConfig } from "./animationConfig";

export class NodeAnimationService {
    private transitHost: Node | null = null;

    // 设置移动过渡层节点；存在时跨容器移动会先挂到该层再落到目标。
    public setTransitHost(node: Node | null) {
        this.transitHost = node;
    }

    // 将节点提升到当前父节点的最上层，避免移动过程中被其他节点遮挡。
    private bringToFront(node: Node) {
        const parent = node.parent;
        if (!parent) {
            return;
        }

        node.setSiblingIndex(parent.children.length - 1);
    }

    // 按顺序将节点位置动画到目标点，不改动缩放。
    public animatePosition(node: Node, targetPosition: Vec3, order: number = 0) {
        const delay = Math.max(0, order) * animationConfig.batchStagger;

        Tween.stopAllByTarget(node);
        this.bringToFront(node);
        tween(node)
            .delay(delay)
            .to(
                animationConfig.moveDuration,
                {
                    position: targetPosition.clone(),
                },
                { easing: animationConfig.easing as TweenEasing },
            )
            .start();
    }

    // 按顺序将节点缩放动画到目标值，不改动位置。
    public animateScale(node: Node, targetScale: Vec3, order: number = 0) {
        const delay = Math.max(0, order) * animationConfig.batchStagger;

        tween(node)
            .delay(delay)
            .to(
                animationConfig.scaleDuration,
                {
                    scale: targetScale.clone(),
                },
                { easing: animationConfig.easing as TweenEasing },
            )
            .start();
    }

    // 在节点当前父节点坐标系中，按顺序动画到目标位置与缩放。
    public animateToState(node: Node, targetPosition: Vec3, targetScale?: Vec3, order: number = 0) {
        const delay = Math.max(0, order) * animationConfig.batchStagger;
        const finalScale = targetScale ? targetScale.clone() : node.scale.clone();

        Tween.stopAllByTarget(node);
        this.bringToFront(node);
        tween(node)
            .delay(delay)
            .to(
                animationConfig.combinedDuration,
                {
                    position: targetPosition.clone(),
                    scale: finalScale,
                },
                { easing: animationConfig.easing as TweenEasing },
            )
            .start();
    }

    // 先缓存目标状态，再重挂父节点并从原始世界位置平滑移动到目标状态。
    public moveToHost(
        node: Node,
        targetHost: Node,
        targetPosition: Vec3,
        targetScale?: Vec3,
        order: number = 0,
        onComplete?: () => void,
        delaySeconds: number = 0,
    ) {
        const startWorldPosition = node.worldPosition.clone();
        const startScale = node.scale.clone();
        const finalScale = targetScale ? targetScale.clone() : startScale.clone();
        const moveHost = this.transitHost || targetHost;

        const targetWorldPosition = new Vec3();
        const targetWorldMatrix = targetHost.getWorldMatrix(new Mat4());
        Vec3.transformMat4(targetWorldPosition, targetPosition, targetWorldMatrix);

        node.setParent(moveHost);
        this.bringToFront(node);

        const startLocalPos = new Vec3();
        moveHost.inverseTransformPoint(startLocalPos, startWorldPosition);
        node.setPosition(startLocalPos);
        node.setScale(startScale);

        const targetLocalPos = new Vec3();
        moveHost.inverseTransformPoint(targetLocalPos, targetWorldPosition);

        const delay = Math.max(0, order) * animationConfig.batchStagger + Math.max(0, delaySeconds);
        const duration = targetScale
            ? animationConfig.combinedDuration
            : animationConfig.moveDuration;

        Tween.stopAllByTarget(node);
        const tweenProps: { position: Vec3; scale?: Vec3 } = {
            position: targetLocalPos.clone(),
        };
        if (targetScale) {
            tweenProps.scale = finalScale.clone();
        }

        tween(node)
            .delay(delay)
            .to(duration, tweenProps, { easing: animationConfig.easing as TweenEasing })
            .call(() => {
                node.setParent(targetHost);
                node.setPosition(targetPosition);
                node.setScale(finalScale);
                this.bringToFront(node);
                onComplete?.();
            })
            .start();
    }
}

export const nodeAnimationService = new NodeAnimationService();
