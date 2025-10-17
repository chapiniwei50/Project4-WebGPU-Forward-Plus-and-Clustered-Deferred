

@group(0) @binding(0) var<uniform> modelMat: mat4x4f;
@group(1) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct VertexOutput {
    @builtin(position) fragPos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) worldNor: vec3f,
    @location(2) uv: vec2f
}

@vertex
fn main(in: VertexInput) -> VertexOutput {
    let worldPos = (modelMat * vec4(in.pos, 1.0)).xyz;
    let worldNor = normalize((modelMat * vec4(in.nor, 0.0)).xyz);
    
    var out: VertexOutput;
    out.fragPos = camera.viewProj * vec4(worldPos, 1.0);
    out.worldPos = worldPos;
    out.worldNor = worldNor;
    out.uv = in.uv;
    return out;
}