import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // Store stage locally
    private stage: Stage;

    // G-buffer textures
    gBufferTextures: GPUTexture[];
    gBufferTextureViews: GPUTextureView[];

    // G-buffer depth texture
    gBufferDepthTexture: GPUTexture;
    gBufferDepthTextureView: GPUTextureView;

    // Pipelines
    geometryPipeline: GPURenderPipeline;
    lightingPipeline: GPURenderPipeline;

    // Bind groups for lighting pass
    lightingBindGroupLayout: GPUBindGroupLayout;
    lightingBindGroup: GPUBindGroup;

    // Scene bind group for camera (geometry pass)
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    // Performance analysis properties - FIXED
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

        this.gBufferTextures = [];
        this.gBufferTextureViews = [];

        const gBufferFormats: GPUTextureFormat[] = [
            'rgba16float',
            'rgba16float',   
            'rgba8unorm',  
        ];

        for (let i = 0; i < gBufferFormats.length; i++) {
            const texture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: gBufferFormats[i],
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            this.gBufferTextures.push(texture);
            this.gBufferTextureViews.push(texture.createView());
        }

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                { 
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: stage.camera.uniformsBuffer }
                }
            ]
        });

        this.gBufferDepthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.gBufferDepthTextureView = this.gBufferDepthTexture.createView();

        this.geometryPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    renderer.modelBindGroupLayout,     
                    this.sceneUniformsBindGroupLayout, 
                    renderer.materialBindGroupLayout   
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.geometryPassVertSrc, 
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFragSrc,
                }),
                entryPoint: "fs_main",
                targets: [
                    { format: 'rgba16float' }, // position
                    { format: 'rgba16float' }, // normal
                    { format: 'rgba8unorm' },  // albedo
                ]
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less'
            }
        });

        this.lightingBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                { 
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage' }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage' }
                },
                { // position texture
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' }
                },
                { // normal texture  
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' }
                },
                { // albedo texture
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' }
                },
                { // sampler
                    binding: 6,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });

        this.lightingBindGroup = renderer.device.createBindGroup({
            layout: this.lightingBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: stage.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: stage.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: stage.lights.clusterSetStorageBuffer } },
                { binding: 3, resource: this.gBufferTextureViews[0] }, // position
                { binding: 4, resource: this.gBufferTextureViews[1] }, // normal
                { binding: 5, resource: this.gBufferTextureViews[2] }, // albedo
                { binding: 6, resource: renderer.device.createSampler({}) }
            ]
        });

        this.lightingPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [this.lightingBindGroupLayout]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
                entryPoint: "main"
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                entryPoint: "fs_main",
                targets: [{ format: renderer.canvasFormat }]
            },
            primitive: {
                topology: 'triangle-list'
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

 
        const gBufferPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.gBufferTextureViews[0],
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferTextureViews[1],
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferTextureViews[2],
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.gBufferDepthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        gBufferPass.setPipeline(this.geometryPipeline);

        gBufferPass.setBindGroup(1, this.sceneUniformsBindGroup);

        this.stage.scene.iterate(node => {
            gBufferPass.setBindGroup(0, node.modelBindGroup);    
        }, material => {
            gBufferPass.setBindGroup(2, material.materialBindGroup); 
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });

        gBufferPass.end();

    
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const lightingPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: canvasTextureView,
                clearValue: [0, 0, 0, 1],
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        lightingPass.setPipeline(this.lightingPipeline);
        lightingPass.setBindGroup(0, this.lightingBindGroup);
        lightingPass.draw(6); 

        lightingPass.end();

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

            console.log(`🧊 Clustered Deferred - Lights: ${lightCount} | ` +
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
        this.gBufferTextures.forEach(texture => texture.destroy());
        this.gBufferDepthTexture.destroy();
    }
}