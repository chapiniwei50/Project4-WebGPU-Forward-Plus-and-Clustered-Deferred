import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    private stage: Stage;

    private frameTimes: number[] = [];
    private lastFrameTime = 0;
    private sampleCount = 0;
    private totalFrameTime = 0;
    private minFrameTime = Infinity;
    private maxFrameTime = 0;
    private readonly MAX_SAMPLES = 60;

    constructor(stage: Stage) {
        super(stage);

        this.stage = stage;

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ scene uniforms bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "forward+ scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: stage.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: stage.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: stage.lights.clusterSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "forward+ pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward+ vert shader",
                    code: shaders.naiveVertSrc // Reuse the same vertex shader
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ frag shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    override onFrame(deltaTime: number) {
        this.stage.lights.onFrame(performance.now());

        const currentTime = performance.now();
        if (this.lastFrameTime > 0) {
            const frameTime = currentTime - this.lastFrameTime;
            this.measurePerformance(frameTime);
        }
        this.lastFrameTime = currentTime;

        super.onFrame(deltaTime);
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();


        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        renderPass.setPipeline(this.pipeline);

        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.stage.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }

    private measurePerformance(frameTime: number) {
        this.frameTimes.push(frameTime);
        this.totalFrameTime += frameTime;
        this.sampleCount++;

        this.minFrameTime = Math.min(this.minFrameTime, frameTime);
        this.maxFrameTime = Math.max(this.maxFrameTime, frameTime);

        if (this.sampleCount >= this.MAX_SAMPLES) {
            const avgFrameTime = this.totalFrameTime / this.sampleCount;
            const fps = 1000 / avgFrameTime;
            const lightCount = this.stage.lights.getLightCount ? this.stage.lights.getLightCount() : 'unknown';

            console.log(`⚡ Forward+ - Lights: ${lightCount} | ` +
                `Avg: ${avgFrameTime.toFixed(2)}ms (${fps.toFixed(1)} FPS) | ` +
                `Min: ${this.minFrameTime.toFixed(2)}ms | ` +
                `Max: ${this.maxFrameTime.toFixed(2)}ms`);

            this.frameTimes = [];
            this.totalFrameTime = 0;
            this.sampleCount = 0;
            this.minFrameTime = Infinity;
            this.maxFrameTime = 0;
        }
    }

    destroy() {
        this.depthTexture.destroy();
    }
}