// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
const clusterCountX = 16u;
const clusterCountY = 9u; 
const clusterCountZ = 24u;
const maxLightsPerCluster = 100u;
const totalClusters = clusterCountX * clusterCountY * clusterCountZ;

struct Cluster {
    lightCount: u32,
    lightIndices: array<u32, maxLightsPerCluster>
}

struct ClusterSet {
    clusters: array<Cluster, totalClusters>
}

struct CameraUniforms {
    viewProj: mat4x4f,
    invProj: mat4x4f,
    screenWidth: f32,
    screenHeight: f32,
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}
