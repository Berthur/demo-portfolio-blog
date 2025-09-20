import { Color, ColorManagement, DataTexture, RedFormat, UnsignedByteType, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { Demo } from "./demo";
import { ButtonSetting, ColorSetting, DropdownSetting, NumberSetting, PlayerSetting, PlayerState, Settings } from "../settings";
import { FrameTimer, glsl } from "../utils";

export class GameOfLifeDemo extends Demo {
    private readonly dimensions = new Vector2(1, 1);
    private readonly mousePos = new Vector2();
    private readonly timer: FrameTimer;

    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private currStateTarget: WebGLRenderTarget;
    private nextStateTarget: WebGLRenderTarget;
    private readonly computePass: ShaderPass;
    private readonly displayPass: ShaderPass;
    private readonly composer: EffectComposer;

    private texture1: DataTexture;
    private texture2: DataTexture;

    private n = 256;
    private m = 256;

    private preset?: number[];

    constructor(container: HTMLElement) {
        super(container);
        ColorManagement.enabled = false;

        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);
        this.timer = new FrameTimer(() => this.renderFrame());

        this.canvas.addEventListener('pointermove', e => {
            this.mousePos.set(e.offsetX, e.offsetY).multiplyScalar(devicePixelRatio);
        });

        this.renderer = new WebGLRenderer({ canvas: this.canvas });
        this.currStateTarget = new WebGLRenderTarget(this.n, this.m);
        this.nextStateTarget = new WebGLRenderTarget(this.n, this.m);

        this.initializeTextures();

        this.computePass = new ShaderPass(ComputeShader, 'prevState');
        this.displayPass = new ShaderPass(DisplayShader, 'gridState');
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(this.computePass);
        this.composer.addPass(this.displayPass);

        this.displayPass.uniforms.color.value.set(0x50cdb1);

        this.createSettings();
    }

    onResize(width: number, height: number) {
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(devicePixelRatio);
        this.renderer.getSize(this.dimensions).multiplyScalar(devicePixelRatio);
    }
    
    private initializeTextures(): void {
        const data = new Uint8Array(this.n * this.m);
        this.writeInitialState(data);

        this.texture1 = new DataTexture(data, this.n, this.m);
        this.texture1.type = UnsignedByteType;
        this.texture1.format = RedFormat;
        this.texture1.flipY = true; // Easier to work with presets
        this.texture1.needsUpdate = true;

        this.texture2 = this.texture1.clone();

        this.currStateTarget.texture = this.texture1;
        this.nextStateTarget.texture = this.texture2;
    }

    private writeInitialState(data: Uint8Array): void {
        if (this.preset) {
            const width = ~~Math.sqrt(this.preset.length);
            const offset = ~~Math.max(4, (this.n - width) / 2);
            for (let i=0; i<this.preset.length; ++i) {
                const x = i % width;
                const y = ~~(i / width);
                data[(y + offset) * this.m + x + offset] = this.preset[y * width + x];
            }
        } else {
            // Fill 10% at random:
            for (let i=0; i<data.length; ++i)
                data[i] = Number(Math.random() < 0.1);
        }
    }

    start(): void {
        this.timer.start();
    }

    renderFrame(): void {
        const tmp = this.currStateTarget;
        this.currStateTarget = this.nextStateTarget;
        this.nextStateTarget = tmp;

        this.composer.readBuffer = this.currStateTarget;
        this.composer.writeBuffer = this.nextStateTarget;
        this.composer.render();
    }

    fastForward(iterations: number): void {
        this.composer.renderToScreen = false;
        for (let i=0; i<iterations - 1; ++i) this.renderFrame();
        this.composer.renderToScreen = true;
        this.renderFrame();
    }

    restart(): void {
        this.texture1.dispose();
        this.texture2.dispose();
        this.currStateTarget.dispose();
        this.nextStateTarget.dispose();
        this.currStateTarget = new WebGLRenderTarget(this.n, this.m);
        this.nextStateTarget = new WebGLRenderTarget(this.n, this.m);
        this.initializeTextures();
        this.start();
    }

    loadPreset(presetName: string): void {
        this.preset = presets[presetName.toLowerCase()];
        this.restart();
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const countsFormatter = (v: number) => {
            const x = 2 ** v;
            return `${ x }x${ x }`;
        };

        const resolutionSetting = new NumberSetting('Grid size', 8, 5, 13, 1, countsFormatter);
        settings.add(resolutionSetting);
        resolutionSetting.subscribe(v => {
            const x = 2 ** v;
            this.n = x;
            this.m = x;
            this.restart();
        });

        const presetOptions = ['random', ...Object.keys(presets)].map(s => s[0].toUpperCase() + s.slice(1));
        const presetSetting = new DropdownSetting('Preset', 0, presetOptions);
        settings.add(presetSetting);
        presetSetting.subscribe(v => {
            this.loadPreset(v);
        });

        const updateSpeeds = [1, 2, 5, 10, 20, Infinity];
        const updateSpeedFormatter = (v: number) => {
            const speed = updateSpeeds[v];
            if (speed === Infinity) return 'Framerate';
            return `${ speed } Hz`;
        }
        const speedSetting = new NumberSetting('Update speed', 5, 0, 5, 1, updateSpeedFormatter);
        settings.add(speedSetting);
        speedSetting.subscribe(v => {
            const speed = updateSpeeds[v];
            this.timer.delay = 1000 / speed;
            this.timer.start(); // Start timer again if it was paused
        });

        const playerSetting = new PlayerSetting('Pause/Skip');
        settings.add(playerSetting);
        playerSetting.subscribe(v => {
            switch (v) {
                case PlayerState.Pause:
                    this.timer.stop();
                    break;
                case PlayerState.Play:
                    this.timer.start();
                    break;
                case PlayerState.Forward:
                    this.fastForward(50);
                    break;
            }
        });

        const colorSetting = new ColorSetting('Color', '#50cdb1');
        settings.add(colorSetting);
        colorSetting.subscribe(v => {
            this.displayPass.uniforms.color.value.set(v);
        });

        const restartButton = new ButtonSetting('Restart', 'Restart', false);
        settings.add(restartButton);
        restartButton.subscribe(v => {
            this.restart();
            settings.setDefaultExpansion();
        });
    }
}

const ComputeShader = {
    name: 'ComputeShader',
    uniforms: {
        prevState: { value: null },
    },
    vertexShader: glsl`
        void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: glsl`
        uniform sampler2D prevState;

        vec2 aspectCorrect(vec2 v, float aspect) {
            if (aspect < 1.0) v.x *= aspect;
            else v.y /= aspect;
            return v;
        }

        void main() {
            int i = int(gl_FragCoord.x);
            int j = int(gl_FragCoord.y);

            bool alive = texelFetch(prevState, ivec2(i, j), 0).r > 0.0;

            int neighbours =
                int(texelFetch(prevState, ivec2(i - 1, j - 1), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i    , j - 1), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i + 1, j - 1), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i - 1, j    ), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i + 1, j    ), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i - 1, j + 1), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i    , j + 1), 0).r > 0.0) +
                int(texelFetch(prevState, ivec2(i + 1, j + 1), 0).r > 0.0);
            
            bool nextAlive = alive && neighbours >= 2 && neighbours <= 3 || !alive && neighbours == 3;

            gl_FragColor = vec4(nextAlive ? 1.0 : 0.0, 0.0, 0.0, 1.0);
        }
    `,
};

const DisplayShader = {
	name: 'CopyShader',
	uniforms: {
		'gridState': { value: null },
        'color': { value: new Color(0xffffff) },
	},
	vertexShader: glsl`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
    `,
	fragmentShader: glsl`
		uniform sampler2D gridState;
        uniform vec3 color;
		varying vec2 vUv;

		void main() {
	        float state = texture2D(gridState, vUv).r;
			gl_FragColor = vec4(state * color, 1.0);
		}
    `
};

const presets = {
    glider: [
        0,0,1,
        1,0,1,
        0,1,1,
    ],
    spaceship: [
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,
        0,0,0,1,1,0,0,0,0,0,0,0,1,0,0,0,0,1,
        1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,1,0,
        0,1,1,0,0,1,1,0,1,1,0,0,0,1,1,0,0,0,
        0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,0,
        0,0,0,0,0,1,0,1,0,1,0,1,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,
        0,0,0,0,0,1,0,1,0,1,0,1,0,0,0,0,0,0,
        0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,0,
        0,1,1,0,0,1,1,0,1,1,0,0,0,1,1,0,0,0,
        1,1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,1,0,
        1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,
        0,0,0,1,1,0,0,0,0,0,0,0,1,0,0,0,0,1,
        0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    ],
};
