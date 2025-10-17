// Fullscreen vertex shader for Clustered Deferred lighting pass

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let positions = array(
        vec2f(-1.0, -1.0),
        vec2f(3.0, -1.0),
        vec2f(-1.0, 3.0)
    );
    
    let texCoords = array(
        vec2f(0.0, 1.0),
        vec2f(2.0, 1.0),
        vec2f(0.0, -1.0)
    );
    
    var out: VertexOutput;
    out.position = vec4(positions[vertexIndex], 0.0, 1.0);
    out.texCoord = texCoords[vertexIndex];
    
    return out;
}