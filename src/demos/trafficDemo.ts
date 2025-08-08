import { BufferGeometry, DataTexture, ExtrudeGeometry, FloatType, GLSL3, InstancedMesh, LinearMipmapLinearFilter, Material, Mesh, MeshBasicMaterial, NearestFilter, PerspectiveCamera, PlaneGeometry, Points, RawShaderMaterial, RepeatWrapping, RGBAFormat, Scene, ShaderMaterial, Shape, Texture, Uniform, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Demo } from "./demo";
import { BooleanSetting, ButtonSetting, NumberSetting, Settings } from "../settings";
import { glsl, getMaxTextureSize, PseudoPointsGeometry } from "../utils";

const MAX_TEXTURE_DIM = Math.min(getMaxTextureSize(), 4096);
const BACKGROUND_RESOLUTION = 1024;
const BLOCK_WORLD_SIZE = 50;
const BLOCK_GRID_SIZE = 20;

export class TrafficDemo extends Demo {
    private initialized = false;

    private readonly dimensions = new Vector2(1, 1);

    private n = 100;
    private blockN = 5;
    private gridSize = this.blockN * BLOCK_GRID_SIZE;

    private readonly commonUniforms: {[name: string]: Uniform};

    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly camera: PerspectiveCamera;
    private readonly renderScene: Scene;
    private carMaterial: ShaderMaterial;
    private backgroundPlane: Mesh;
    private carsMesh: InstancedMesh;

    private gridStateScene: Scene;
    private gridStatePoints: Points;
    private gridStateMaterial: RawShaderMaterial;

    private backgroundPass: ShaderPass;
    private gridStatePass: RenderPass;
    private computePass: ShaderPass;
    private readonly composer: EffectComposer;

    private carDataTexture: Texture;
    private backgroundTarget: WebGLRenderTarget;
    private currCarStateTarget: WebGLRenderTarget;
    private nextCarStateTarget: WebGLRenderTarget;
    private gridStateTarget: WebGLRenderTarget;

    constructor(container: HTMLElement) {
        super(container);
        this.canvas = document.createElement('canvas');
        container.prepend(this.canvas);

        this.commonUniforms = {
            time: new Uniform(0),
            delta: new Uniform(0),
            gridSize: new Uniform(this.gridSize),
            blockN: new Uniform(this.blockN),
            blockWorldSize: new Uniform(BLOCK_WORLD_SIZE),
            texWidth: new Uniform(MAX_TEXTURE_DIM),
            viewSize: new Uniform(this.dimensions),
            pointState: new Uniform(null),
        };

        this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderScene = new Scene();

        this.camera = new PerspectiveCamera(70, 1, 0.005, 10);
        this.camera.up = new Vector3(0, 0, 1);
        this.camera.position.set(-0.9, -0.9, 0.5);
        const controls = new OrbitControls(this.camera, this.canvas);
        controls.zoomToCursor = true;

        this.initialize();

        this.createSettings();

        const renderPass = new RenderPass(this.renderScene, this.camera);
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(this.computePass);
        this.composer.addPass(renderPass);
    }

    private initialize(): void {
        if (this.n > MAX_TEXTURE_DIM * MAX_TEXTURE_DIM) throw new Error("Point size of " + this.n + " is too large for texture");

        this.initializeTextures();
        this.initializeComputePass();
        this.initializeGridState();
        this.initializeCars();
        this.initializeStreetPlane();

        this.initialized = true;
    }

    private initializeComputePass(): void {
        if (this.initialized) return;
        this.computePass = new ShaderPass(SimulationShader, 'currState');
        this.computePass.material.glslVersion = GLSL3;

        Object.assign(this.computePass.uniforms, this.commonUniforms);
        this.computePass.uniforms.currState = new Uniform(null);
        this.computePass.uniforms.carData = new Uniform(this.carDataTexture);
        this.computePass.uniforms.gridState = new Uniform(null);
    }
    
    private initializeTextures(): void {
        if (this.initialized) {
            this.currCarStateTarget.texture.dispose();
            this.nextCarStateTarget.texture.dispose();
            this.currCarStateTarget.dispose();
            this.nextCarStateTarget.dispose();
            this.carDataTexture.dispose();
        }

        const texHeight = Math.ceil(this.n / MAX_TEXTURE_DIM);
        this.currCarStateTarget = new WebGLRenderTarget(MAX_TEXTURE_DIM, texHeight);
        this.nextCarStateTarget = new WebGLRenderTarget(MAX_TEXTURE_DIM, texHeight);

        const p = new Vector2();
        const v = new Vector2();
        {   // Car state:
            const data = new Float32Array(4 * MAX_TEXTURE_DIM * texHeight);
            for (let i=0; i<this.n; ++i) {
                const blockI = ~~((this.blockN - 1) * Math.random());
                const normPos = (blockI + 1) / this.blockN + 0.5 / this.gridSize;

                p.set(2 * normPos - 1, 2 * Math.random() - 1);
                v.set(0, 0.001);
                if (Math.random() < 0.5) {
                    p.set(p.y, -p.x);
                    v.set(v.y, v.x);
                }
                p.toArray(data, i*4);
                v.toArray(data, i*4 + 2);
            }

            const texture = new DataTexture(data, MAX_TEXTURE_DIM, texHeight);
            texture.type = FloatType;
            texture.format = RGBAFormat;
            texture.needsUpdate = true;

            this.currCarStateTarget.texture = texture;
            this.nextCarStateTarget.texture = texture.clone();
        }

        {   // Car data:
            const data = new Float32Array(4 * MAX_TEXTURE_DIM * texHeight);
            for (let i=0; i<this.n; ++i)
                data[i*4    ] = (20 + 40 * Math.random()) / 3.6;

            this.carDataTexture = new DataTexture(data, MAX_TEXTURE_DIM, texHeight);
            this.carDataTexture.type = FloatType;
            this.carDataTexture.format = RGBAFormat;
            this.carDataTexture.needsUpdate = true;
        }
    }

    private initializeGridState(): void {
        if (this.initialized) {
            this.gridStatePoints.geometry.dispose();
            this.gridStateTarget.dispose();
        } else {
            this.gridStateScene = new Scene();
            this.gridStatePass = new RenderPass(this.gridStateScene, this.camera);
            this.gridStatePass.setSize(this.gridSize, this.gridSize); // TODO: Does this do anything?

            this.gridStateMaterial = new RawShaderMaterial({
                transparent: true,
                glslVersion: GLSL3,
                vertexShader: gridStateVertexShader,
                fragmentShader: gridStateFragmentShader,
            });
            Object.assign(this.gridStateMaterial.uniforms, this.commonUniforms);

            this.gridStatePoints = new Points();
            this.gridStatePoints.frustumCulled = false;
            this.gridStatePoints.material = this.gridStateMaterial;
            this.gridStateScene.add(this.gridStatePoints);
        }

        this.gridStateTarget = new WebGLRenderTarget(this.gridSize, this.gridSize, {
            minFilter: NearestFilter,
            magFilter: NearestFilter,
        });

        this.gridStatePoints.geometry = new PseudoPointsGeometry(this.n);
    }

    private createCarGeometry(): ExtrudeGeometry {
        const shape = new Shape();
        shape.moveTo(0, 0);
        shape.lineTo(4.5, 0);
        shape.lineTo(4.5, 0.5);
        shape.bezierCurveTo(4.5, 1.0, 3.5, 1.2, 2, 1.2);
        shape.lineTo(1.5, 1.2);
        shape.lineTo(1, 0.6);
        shape.lineTo(0, 0.4);
        shape.lineTo(0, 0);

        const length = 4.5;
        const width = 1.8;
        const scaleFactor = 1.0 / length;

        const geom = new ExtrudeGeometry(shape, { steps: 1, depth: width });
        geom.translate(-length/2, 0, -width/2);
        geom.rotateX(Math.PI / 2);
        geom.rotateZ(-Math.PI / 2);
        geom.scale(scaleFactor, scaleFactor, scaleFactor);

        return geom;
    }

    private initializeCars(): void {
        let carGeometry: BufferGeometry;

        if (this.initialized) {
            carGeometry = this.carsMesh.geometry;
            this.renderScene.remove(this.carsMesh);
            this.carsMesh.dispose();
        } else {
            carGeometry = this.createCarGeometry();
            this.carMaterial = new ShaderMaterial({
                glslVersion: GLSL3,
                vertexShader: carVertexShader,
                fragmentShader: carFragmentShader,
            });
            Object.assign(this.carMaterial.uniforms, this.commonUniforms);
        }

        this.carsMesh = new InstancedMesh(carGeometry, this.carMaterial, this.n);
        this.carsMesh.frustumCulled = false;
        this.renderScene.add(this.carsMesh);
    }

    private initializeStreetPlane(): void {
        if (this.initialized) {
            this.backgroundTarget.texture.repeat.set(this.blockN, this.blockN);
            (this.backgroundPlane.material as Material[])[0].needsUpdate = true;
        } else {
            this.backgroundTarget = new WebGLRenderTarget(BACKGROUND_RESOLUTION, BACKGROUND_RESOLUTION, {
                generateMipmaps: true,
                minFilter: LinearMipmapLinearFilter,
                anisotropy: 2,
            });
            this.backgroundTarget.texture.wrapS = RepeatWrapping;
            this.backgroundTarget.texture.wrapT = RepeatWrapping;
            this.backgroundTarget.texture.repeat.set(this.blockN, this.blockN);

            this.backgroundPass = new ShaderPass(BackgroundShader);
            this.backgroundPass.material.glslVersion = GLSL3;
            this.backgroundPass.material.uniforms.viewSize = new Uniform(new Vector2(BACKGROUND_RESOLUTION, BACKGROUND_RESOLUTION));
            this.backgroundPass.material.uniforms.blockGridSize = new Uniform(BLOCK_GRID_SIZE);

            this.backgroundPlane = new Mesh();
            this.backgroundPlane.geometry = new PlaneGeometry(2, 2, 1, 1);
            this.backgroundPlane.geometry.addGroup(0, Infinity, 0);
            this.backgroundPlane.material = [
                new MeshBasicMaterial({ transparent: true, map: this.backgroundTarget.texture }),
                new MeshBasicMaterial({ transparent: true, opacity: 0.5 })
            ];
            this.renderScene.add(this.backgroundPlane);
        }

        this.backgroundPlane.material[1].map = this.gridStateTarget.texture;
        this.backgroundPass.render(this.renderer, this.backgroundTarget, null, 0, false);
    }

    private updateUniforms(time: number, delta: number): void {
        this.commonUniforms.time.value = time;
        this.commonUniforms.delta.value = delta;
        this.commonUniforms.gridSize.value = this.gridSize;
        this.commonUniforms.blockN.value = this.blockN;
        this.commonUniforms.pointState.value = this.currCarStateTarget.texture;

        this.computePass.material.uniforms.gridState.value = this.gridStateTarget.texture;
        this.computePass.material.uniforms.carData.value = this.carDataTexture;
    }

    onResize(width: number, height: number) {
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.renderer.getSize(this.dimensions);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    start(): void {
        (() => this.frame())();
    }

    restart(): void {
        this.initialize();
    }

    private t0 = 0;
    frame(): void {
        const t1 = performance.now();
        const delta = Math.min(t1 - this.t0, 200);
        this.t0 = t1;

        const tmp = this.currCarStateTarget;
        this.currCarStateTarget = this.nextCarStateTarget;
        this.nextCarStateTarget = tmp;

        this.updateUniforms(t1, delta);

        this.gridStatePass.render(this.renderer, null, this.gridStateTarget, delta, false);
        this.composer.readBuffer = this.currCarStateTarget;
        this.composer.writeBuffer = this.nextCarStateTarget;
        this.composer.render();
        
        requestAnimationFrame(() => { this.frame() });
    }

    private createSettings(): void {
        const settings = new Settings();
        this.container.append(settings.element);

        const counts = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
        const countsFormatter = (v: number) => {
            const n = counts[v];
            if (n < 1000) return n.toString();
            else return ~~(n / 1000) + 'k';
        };

        const carCount = new NumberSetting('Car count', counts.indexOf(this.n), 0, counts.length - 1, 1, countsFormatter);
        settings.add(carCount);
        carCount.subscribe(v => {
            this.n = counts[v];
            this.restart();
        });

        const blockN = new NumberSetting('Grid size', 5, 2, 100, 1);
        settings.add(blockN);
        blockN.subscribe(v => {
            this.blockN = v;
            this.gridSize = this.blockN * BLOCK_GRID_SIZE;
            this.restart();
        });

        const trafficEnabled = new BooleanSetting('Traffic enabled', true);
        settings.add(trafficEnabled);
        trafficEnabled.subscribe(v => {
            this.computePass.material.defines.TRAFFIC_CONTROL = v;
            this.computePass.material.needsUpdate = true;
        });

        const debugGrid = new BooleanSetting('Show grid state', false);
        settings.add(debugGrid);
        debugGrid.subscribe(v => {
            this.backgroundPass.material.defines.SHOW_GRID = v;
            this.backgroundPass.material.needsUpdate = true;
            this.backgroundPass.render(this.renderer, this.backgroundTarget, null, 0, false);
            this.backgroundPlane.geometry.clearGroups();
            this.backgroundPlane.geometry.addGroup(0, Infinity, 0);
            if (v) this.backgroundPlane.geometry.addGroup(0, Infinity, 1);
        });

        const expandButton = new ButtonSetting('Expand window', 'Minimize window', false);
        settings.add(expandButton);
        expandButton.subscribe(v => {
            if (v) this.container.classList.add('maximised');
            else this.container.classList.remove('maximised');
        });
    }
}

const BackgroundShader = {
    name: 'BackgroundShader',
    uniforms: {},
    defines: {
        SHOW_GRID: false,
    },
    vertexShader: glsl`
        void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: glsl`
        precision highp float;

        uniform vec2 viewSize;
        uniform float blockGridSize;

        out vec4 fragColor;

        void main() {
            vec2 coord = gl_FragCoord.xy / viewSize;

            float scaleFactor = 0.5;
            float streetWidth = 0.35 * scaleFactor;
            float sideWalkWidth = 0.07 * scaleFactor;
            float houseR = 0.5 - 0.5 * streetWidth;
            float crossingLineWidth = 0.01;

            vec2 r = abs(0.5 - coord);
            vec2 rStreet = r - houseR;

            vec3 color = vec3(0.5);
            if (rStreet.x > 0.0 || rStreet.y > 0.0) {
                color = vec3(0.2);

                if ( // Crossings
                    -0.1 < rStreet.x && rStreet.x < 0.0 && int(floor(rStreet.y / crossingLineWidth)) % 2 == 0 ||
                    -0.1 < rStreet.y && rStreet.y < 0.0 && int(floor(rStreet.x / crossingLineWidth)) % 2 == 0
                ) color = vec3(0.85);

                if ( // Pavement
                    rStreet.x < sideWalkWidth && rStreet.y < 0.0 ||
                    rStreet.y < sideWalkWidth && rStreet.x < 0.0 ||
                    length(rStreet) < sideWalkWidth
                ) color = vec3(0.1);
            }

            #ifdef SHOW_GRID
                // Grid (for debugging):
                vec2 gridLine = mod(coord, 1.0 / blockGridSize);
                float gridLineWidth = 0.01;
                if (gridLine.x < 0.5 * gridLineWidth || gridLine.x > 1.0 / blockGridSize - 0.5 * gridLineWidth ||
                    gridLine.y < 0.5 * gridLineWidth || gridLine.y > 1.0 / blockGridSize - 0.5 * gridLineWidth
                ) color *= 0.5;
            #endif

            fragColor = vec4(color, 1.0);
        }
    `,
};

const SimulationShader = {
    name: 'SimulationShader',
    uniforms: {},
    defines: {
        BORDERS_REFLECT: true,
        TRAFFIC_CONTROL: true,
    },
    vertexShader: glsl`
        precision highp float;

        void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: glsl`
        precision highp float;

        #define EPSILON 0.00001

        uniform vec2 viewSize;
        uniform int texWidth;
        uniform float time;
        uniform float delta;
        uniform sampler2D currState;
        uniform sampler2D gridState;
        uniform sampler2D carData;
        uniform int gridSize;
        uniform float blockN;
        uniform float blockWorldSize;

        out vec4 nextCarState;

        ivec2 deadlockBreakDir = ivec2(0, 1);

        ivec2 getCardinalDirection(vec2 v) {
            if (v.x > abs(v.y))     return ivec2(1, 0);
            if (v.x < -abs(v.y))    return ivec2(-1, 0);
            if (v.y > abs(v.x))     return ivec2(0, 1);
            if (v.y < -abs(v.x))    return ivec2(0, -1);
                                    return ivec2(0, 0);
        }

        vec2 rotate90(vec2 v) {
            return vec2(-v.y, v.x);
        }
        ivec2 rotate90(ivec2 v) {
            return ivec2(-v.y, v.x);
        }

        bool isIntersection(ivec2 c) {
            // TODO: Input as uniforms?
            float scaleFactor = 0.5;
            float streetWidth = 0.35 * scaleFactor / blockN;

            vec2 pNorm = (vec2(c) + 0.5) / float(gridSize);
            float blockSize = 1.0 / blockN;
            vec2 pBlock = mod(pNorm, blockSize);

            return
                (pBlock.x < 0.5 * streetWidth || pBlock.x > blockSize - 0.5 * streetWidth) &&
                (pBlock.y < 0.5 * streetWidth || pBlock.y > blockSize - 0.5 * streetWidth);
        }

        bool canEnterIntersection(ivec2 gridDir, vec4 leftCell, vec4 rightCell, vec4 frontCell) {

            // Deadlock, broken by cars travelling in a rotating deadlock break direction:
            if (leftCell.r > 0.5 && rightCell.r > 0.5 && frontCell.r > 0.5)
                return gridDir == deadlockBreakDir;

            // No deadlock - cede right:
            if (rightCell.r > 0.5) return false;

            // Right of way:
            return true;
        }

        // Pseudorandom function, copyright Andy Gryc
        // (https://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/):
        float rand(vec2 co) {
            float a = 12.9898;
            float b = 78.233;
            float c = 43758.5453;
            float dt = dot(co.xy, vec2(a,b));
            float sn = mod(dt, 3.14);
            return fract(sin(sn) * c);
        }

        void main() {
            float aspect = viewSize.x / viewSize.y;
            float maxViewSize = max(viewSize.x, viewSize.y);

            float unitFactor = 2.0 / (blockWorldSize * blockN);

            // Decide deadlock break direction:
            int deadlockBreakRot = int(time / 1000.0) % 4;
            if (deadlockBreakRot-- > 0) deadlockBreakDir = rotate90(deadlockBreakDir);
            if (deadlockBreakRot-- > 0) deadlockBreakDir = rotate90(deadlockBreakDir);
            if (deadlockBreakRot-- > 0) deadlockBreakDir = rotate90(deadlockBreakDir);

            float d = 0.001 * delta;
            int i = int(gl_FragCoord.x);
            int j = int(gl_FragCoord.y);
            vec4 carState = texelFetch(currState, ivec2(i, j), 0);
            vec4 carData = texelFetch(carData, ivec2(i, j), 0);

            float targetSpeed = carData.r;
            vec2 p = carState.xy;
            vec2 v = carState.zw;
            vec2 p1 = p + d * v * unitFactor;
            bool turning = false;

            #ifdef BORDERS_REFLECT // TODO: Do this after the calculations?
                if (
                    p1.x < -1.0 || p1.x > 1.0 ||
                    p1.y < -1.0 || p1.y > 1.0
                ) {
                    p += rotate90(vec2(getCardinalDirection(v))) * 2.0 / float(gridSize);
                    v = -v;
                    turning = true;
                }
                p1 = p + d * v * unitFactor;
            #endif

            vec2 dir = normalize(v);
            float speed = length(v);
            ivec2 gridDir = getCardinalDirection(v);
            ivec2 rightDir = -rotate90(gridDir);

            //float maxSpeed = targetSpeed;
            float desiredSpeed = targetSpeed;
            float maxAcceleration = 5.0;
            float maxBraking = -20.0;
            float intersectionSpeed = min(targetSpeed, 4.0);
            //float a = maxAcceleration;

            vec2 pNorm = 0.5 * (p + 1.0);
            ivec2 cellCoord = ivec2(pNorm * float(gridSize));

            #ifdef TRAFFIC_CONTROL

                bool onIntersection = isIntersection(cellCoord);
                bool beforeIntersection = !onIntersection && isIntersection(cellCoord + gridDir);
                bool approachingIntersection = !onIntersection && !beforeIntersection && isIntersection(cellCoord + 2 * gridDir);

                vec4 cell1 = texelFetch(gridState, cellCoord + 1 * gridDir, 0);
                vec4 cell2 = texelFetch(gridState, cellCoord + 2 * gridDir, 0);
                vec4 cell3 = texelFetch(gridState, cellCoord + 3 * gridDir, 0);

                vec4 intersectionCellRight;
                vec4 intersectionCellLeft;
                vec4 intersectionCellFront;
                float intersectionOccupancy;
                if (beforeIntersection) {
                    intersectionCellRight = texelFetch(gridState, cellCoord + 2 * rightDir + 3 * gridDir, 0);
                    intersectionCellLeft = texelFetch(gridState, cellCoord - 3 * rightDir + 2 * gridDir, 0);
                    intersectionCellFront = texelFetch(gridState, cellCoord - 1 * rightDir + 5 * gridDir, 0);

                    intersectionOccupancy =
                        texelFetch(gridState, cellCoord + 2 * gridDir, 0).r +
                        //texelFetch(gridState, cellCoord + 3 * gridDir, 0).r +
                        //texelFetch(gridState, cellCoord + 2 * gridDir + rightDir, 0).r +
                        texelFetch(gridState, cellCoord + 3 * gridDir + rightDir, 0).r +
                        texelFetch(gridState, cellCoord + 2 * gridDir - rightDir, 0).r;
                        //texelFetch(gridState, cellCoord + 2 * gridDir - 2 * rightDir, 0).r;
                }

                if (onIntersection || beforeIntersection) {
                    desiredSpeed = intersectionSpeed;
                } else if (approachingIntersection) {
                    desiredSpeed = mix(intersectionSpeed, targetSpeed, 0.3);
                }

                if (cell1.r > 0.5) {
                    if (cell1.g < speed) {
                        speed = cell1.g;
                        desiredSpeed = min(speed, desiredSpeed);
                    }
                    p -= dir * EPSILON * unitFactor; // Nudge, to prevent blockage
                } else if (cell2.r > 0.5) {
                    desiredSpeed = min(mix(cell2.g, desiredSpeed, 0.3), desiredSpeed);
                } else if (cell3.r > 0.5) {
                    desiredSpeed = min(mix(cell3.g, desiredSpeed, 0.7), desiredSpeed);
                }

                if (beforeIntersection) {
                    if (!canEnterIntersection(gridDir, intersectionCellLeft, intersectionCellRight, intersectionCellFront) ||
                        intersectionOccupancy > 0.5
                    ) {
                        speed = 0.0;
                        desiredSpeed = 0.0;
                        p -= dir * EPSILON * unitFactor; // Nudge, to prevent blockage
                    }
                }

            #endif

            float ds = desiredSpeed - speed;
            float a = clamp(10.0 * ds, maxBraking, maxAcceleration);

            speed += d * a;
            if (speed < EPSILON) speed = EPSILON;
            v = speed * dir;
            p += d * v * unitFactor;
            nextCarState = vec4(p, v);
        }
    `,
};

const carVertexShader = glsl`
    precision highp float;

    #define PI 3.14159265359

    uniform vec2 viewSize;
    uniform int texWidth;
    uniform int blockN;
    uniform sampler2D pointState;

    flat out vec3 vColor;
    out vec3 vNormal;

    // Pseudorandom function, copyright Andy Gryc
    // (https://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/):
    float rand(vec2 co) {
        float a = 12.9898;
        float b = 78.233;
        float c = 43758.5453;
        float dt = dot(co.xy, vec2(a,b));
        float sn = mod(dt, 3.14);
        return fract(sin(sn) * c);
    }

    void main() {
        vec4 state = texelFetch(pointState, ivec2(gl_InstanceID % texWidth, gl_InstanceID / texWidth), 0);

        vec2 dir = normalize(state.zw);
        float angle = atan(dir.y, dir.x) - PI / 2.0;

        vec3 pos = position;

        // Rotate car to face direction of velocity:
        pos.xy = vec2(
            cos(angle) * pos.x - sin(angle) * pos.y,
            sin(angle) * pos.x  + cos(angle) * pos.y
        );

        // Scale instance:
        pos *= 0.075 / float(blockN);

        pos.xy += state.xy;

        gl_Position = projectionMatrix * /*instanceMatrix * */ modelViewMatrix * vec4(pos, 1.0);

        float seed = float(gl_InstanceID % 1000) / 1000.0;
        vColor = vec3(rand(vec2(seed, 0.0)), rand(vec2(0.0, seed)), rand(vec2(seed, seed)));

        vNormal = normal;
    }
`;

const carFragmentShader = glsl`
    precision highp float;

    flat in vec3 vColor;
    in vec3 vNormal;

    out vec4 fragColor;

    void main() {
        vec3 lightDir = normalize(vec3(-3.0, -1.0, -5.0));
        float intensity = 0.2 + 0.8 * clamp(dot(vNormal, -lightDir), 0.0, 1.0);
        fragColor = vec4(vColor * intensity, 1.0);
    }
`;

const gridStateVertexShader = glsl`
    precision highp float;

    uniform int texWidth;
    uniform sampler2D pointState;

    flat out float vSpeed;

    void main() {
        vec4 state = texelFetch(pointState, ivec2(gl_VertexID % texWidth, gl_VertexID / texWidth), 0);
        gl_PointSize = 1.0;
        gl_Position = vec4(state.xy, 0.0, 1.0);
        vSpeed = length(state.zw);
    }
`;

const gridStateFragmentShader = glsl`
    precision highp float;

    uniform float gridSize;
    uniform float blockN;

    flat in float vSpeed;
    out vec4 fragColor;

    void main() {
        fragColor = vec4(1.0, vSpeed, 0.0, 1.0);
    }
`;
