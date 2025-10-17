// Fragment shader for geometry pass - ONLY fragment stage code

// Group 2: Material (textures)
@group(2) @binding(0) var diffuseTex: texture_2d<f32>;
@group(2) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) worldNor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput {
    @location(0) gPosition: vec4f,
    @location(1) gNormal: vec4f,
    @location(2) gAlbedo: vec4f
}

@fragment
fn fs_main(in: FragmentInput) -> FragmentOutput {
    let albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    
    if (albedo.a < 0.5) {
        discard;
    }
    
    var out: FragmentOutput;
    out.gPosition = vec4(in.worldPos, 1.0);
    out.gNormal = vec4(normalize(in.worldNor), 1.0);
    out.gAlbedo = vec4(albedo.rgb, 1.0);
    
    return out;
}