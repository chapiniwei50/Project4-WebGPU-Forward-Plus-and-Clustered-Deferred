// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
// Fullscreen lighting pass shader for Clustered Deferred

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(0) @binding(3) var gPosition: texture_2d<f32>;
@group(0) @binding(4) var gNormal: texture_2d<f32>;
@group(0) @binding(5) var gAlbedo: texture_2d<f32>;
@group(0) @binding(6) var gBufferSampler: sampler;

fn getClusterIndex(texCoord: vec2f, depth: f32) -> u32 {
    let screenX = texCoord.x * camera.screenWidth;
    let screenY = texCoord.y * camera.screenHeight;
    
    let clusterX = u32(screenX * f32(clusterCountX) / camera.screenWidth);
    let clusterY = u32(screenY * f32(clusterCountY) / camera.screenHeight);
    
    let near = 0.1;
    let far = 1000.0;
    let clusterZ = u32((log(depth / near) / log(far / near)) * f32(clusterCountZ));
    
    let clampedX = min(clusterX, clusterCountX - 1u);
    let clampedY = min(clusterY, clusterCountY - 1u);
    let clampedZ = min(clusterZ, clusterCountZ - 1u);
    
    return clampedZ * clusterCountX * clusterCountY + clampedY * clusterCountX + clampedX;
}

@fragment
fn fs_main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
    let position = textureSample(gPosition, gBufferSampler, texCoord).rgb;
    let normal = textureSample(gNormal, gBufferSampler, texCoord).rgb;
    let albedo = textureSample(gAlbedo, gBufferSampler, texCoord).rgb;
    
    if (length(position) == 0.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
    
    let viewPos = (camera.viewProj * vec4(position, 1.0));
    let depth = viewPos.z / viewPos.w;
    
    let clusterIndex = getClusterIndex(texCoord, depth);
    let cluster = clusterSet.clusters[clusterIndex];
    
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var i = 0u; i < cluster.lightCount; i++) {
        let lightIdx = cluster.lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position, normalize(normal));
    }
    
    let finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1.0);
}