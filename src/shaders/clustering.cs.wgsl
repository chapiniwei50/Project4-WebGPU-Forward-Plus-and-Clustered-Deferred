@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<uniform> camera: CameraUniforms;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

const lightRadius = 5.0;

struct AABB {
    min: vec3f,
    max: vec3f
}

fn getClusterAABB(clusterX: u32, clusterY: u32, clusterZ: u32) -> AABB {
    let screenMinX = f32(clusterX) / f32(clusterCountX);
    let screenMaxX = f32(clusterX + 1u) / f32(clusterCountX);
    let screenMinY = f32(clusterY) / f32(clusterCountY);
    let screenMaxY = f32(clusterY + 1u) / f32(clusterCountY);
    
    let near = 0.1;
    let far = 100.0; // Reduce far plane for better precision
    let depthMin = near * pow(far / near, f32(clusterZ) / f32(clusterCountZ));
    let depthMax = near * pow(far / near, f32(clusterZ + 1u) / f32(clusterCountZ));
    
    let ndcMin = vec4f(screenMinX * 2.0 - 1.0, (1.0 - screenMaxY) * 2.0 - 1.0, depthMin, 1.0);
    let ndcMax = vec4f(screenMaxX * 2.0 - 1.0, (1.0 - screenMinY) * 2.0 - 1.0, depthMax, 1.0);
    
    let viewMin = camera.invProj * ndcMin;
    let viewMax = camera.invProj * ndcMax;
    
    let viewMinDiv = viewMin.xyz / viewMin.w;
    let viewMaxDiv = viewMax.xyz / viewMax.w;
    
    return AABB(
        vec3f(min(viewMinDiv.x, viewMaxDiv.x), min(viewMinDiv.y, viewMaxDiv.y), min(viewMinDiv.z, viewMaxDiv.z)),
        vec3f(max(viewMinDiv.x, viewMaxDiv.x), max(viewMinDiv.y, viewMaxDiv.y), max(viewMinDiv.z, viewMaxDiv.z))
    );
}

fn sphereAABBIntersect(sphereCenter: vec3f, sphereRadius: f32, aabb: AABB) -> bool {
    let closestPoint = vec3f(
        max(aabb.min.x, min(sphereCenter.x, aabb.max.x)),
        max(aabb.min.y, min(sphereCenter.y, aabb.max.y)),
        max(aabb.min.z, min(sphereCenter.z, aabb.max.z))
    );
    
    let distance = length(closestPoint - sphereCenter);
    return distance <= sphereRadius;
}

fn getClusterIndex(clusterX: u32, clusterY: u32, clusterZ: u32) -> u32 {
    return clusterZ * clusterCountX * clusterCountY + 
           clusterY * clusterCountX + 
           clusterX;
}

@compute @workgroup_size(16, 9, 1)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterX = globalIdx.x;
    let clusterY = globalIdx.y;
    let clusterZ = globalIdx.z;
    
    if (clusterX >= clusterCountX || clusterY >= clusterCountY || clusterZ >= clusterCountZ) {
        return;
    }
    
    let clusterIndex = getClusterIndex(clusterX, clusterY, clusterZ);
    let cluster = &clusterSet.clusters[clusterIndex];
    
    cluster.lightCount = 0u;
    
    let clusterAABB = getClusterAABB(clusterX, clusterY, clusterZ);
    
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (cluster.lightCount >= maxLightsPerCluster) {
            break;
        }
        
        let light = lightSet.lights[lightIdx];
        
        if (sphereAABBIntersect(light.pos, lightRadius, clusterAABB)) {
            cluster.lightIndices[cluster.lightCount] = lightIdx;
            cluster.lightCount += 1u;
        }
    }
}