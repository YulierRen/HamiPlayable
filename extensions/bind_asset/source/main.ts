/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    /**
     * @en A method that can be triggered by message
     * @zh 通过 message 触发的方法
     */
    showLog() {
        console.log('Hello World');
    },

    bindAssets() {
        const fs = require('fs');
        const path = require('path');
        // extension dist is at extensions/bind_asset/dist, go up 3 to project root
        const projectRoot = path.resolve(__dirname, '..', '..', '..');
        const scenePath = path.join(projectRoot, 'assets', 'scene', 'main.scene');
        const assetDir = path.join(projectRoot, 'assets', 'asset', 'component');
        const assetExt = 'png';
        const overwrite = true;

        if (!fs.existsSync(scenePath)) {
            console.error('Scene not found:', scenePath);
            return;
        }

        const text = fs.readFileSync(scenePath, 'utf8');
        let arr: any[] = JSON.parse(text);

        const spriteTemplate = arr.find(o => o && o.__type__ === 'cc.Sprite');

        // find suffix like @f9941 from existing sprite frames
        let suffix = '';
        for (const o of arr) {
            try {
                const s = JSON.stringify(o);
                const m = s.match(/"__uuid__":\s*"([0-9a-f\-]+)@([0-9a-z]+)"/i);
                if (m) { suffix = '@' + m[2]; break; }
            } catch (e) {}
        }

        function getUuidFromMeta(assetFileBase: string) {
            const metaFile = assetFileBase + '.meta';
            if (!fs.existsSync(metaFile)) return null;
            const c = fs.readFileSync(metaFile, 'utf8');
            const mm = c.match(/uuid:\s*([0-9a-f\-]+)/i);
            return mm ? mm[1] : null;
        }

        for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            if (!item || item.__type__ !== 'cc.Node') continue;
            const children = item._children || [];
            if (children.length !== 0) continue; // skip non-leaf
            const nodeName = item._name;
            if (!nodeName) continue;
            const assetPath = path.join(assetDir, nodeName + '.' + assetExt);
            const uuid = getUuidFromMeta(assetPath);
            if (!uuid) {
                console.log('asset not found or no meta for', assetPath);
                continue;
            }

            item._components = item._components || [];
            let existingSpriteCompIndex = -1;
            for (const compRef of item._components) {
                const compIndex = compRef && compRef.__id ? compRef.__id - 1 : null;
                if (compIndex !== null && arr[compIndex] && arr[compIndex].__type__ === 'cc.Sprite') {
                    existingSpriteCompIndex = compIndex;
                    break;
                }
            }

            if (existingSpriteCompIndex >= 0) {
                if (overwrite) {
                    arr[existingSpriteCompIndex]._spriteFrame = { "__uuid__": uuid + suffix, "__expectedType__": "cc.SpriteFrame" };
                    console.log('updated sprite for node', nodeName);
                } else {
                    console.log('skipped existing sprite for', nodeName);
                }
                continue;
            }

            const template = spriteTemplate || {
                "__type__": "cc.Sprite",
                "_name": "",
                "_objFlags": 0,
                "__editorExtras__": {},
                "_enabled": true,
                "_customMaterial": null,
                "_srcBlendFactor": 2,
                "_dstBlendFactor": 4,
                "_color": { "__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255 },
                "_spriteFrame": null,
                "_type": 0,
                "_fillType": 0,
                "_sizeMode": 0,
                "_fillCenter": { "__type__": "cc.Vec2", "x": 0, "y": 0 },
                "_fillStart": 0,
                "_fillRange": 0,
                "_isTrimmedMode": true,
                "_useGrayscale": false,
                "_atlas": null
            };

            const newComp = JSON.parse(JSON.stringify(template));
            newComp.node = { "__id__": i + 1 };
            newComp._spriteFrame = { "__uuid__": uuid + suffix, "__expectedType__": "cc.SpriteFrame" };
            arr.push(newComp);
            const newCompId = arr.length; // 1-based
            item._components.push({ "__id__": newCompId });
            console.log('bound', nodeName, '->', assetPath);
        }

        fs.writeFileSync(scenePath, JSON.stringify(arr, null, 2), 'utf8');
        console.log('bind-assets: done');
    }
};

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export function load() {}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export function unload() {}
