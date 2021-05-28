// https://github.com/mapbox/webgl-wind/blob/master/dist/wind-gl.js
// ISC License
// Modified by NeuroWhAI

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.WindGL = factory());
}(this, (function () { 'use strict';

function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);

    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
    var program = gl.createProgram();

    var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }

    var wrapper = {program: program};

    var numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < numAttributes; i++) {
        var attribute = gl.getActiveAttrib(program, i);
        wrapper[attribute.name] = gl.getAttribLocation(program, attribute.name);
    }
    var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i$1 = 0; i$1 < numUniforms; i$1++) {
        var uniform = gl.getActiveUniform(program, i$1);
        wrapper[uniform.name] = gl.getUniformLocation(program, uniform.name);
    }

    return wrapper;
}

function createTexture(gl, filter, data, width, height) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    if (data instanceof Uint8Array) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

function bindTexture(gl, texture, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
}

function createBuffer(gl, data) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
}

function bindAttribute(gl, buffer, attribute, numComponents) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, numComponents, gl.FLOAT, false, 0, 0);
}

function bindFramebuffer(gl, framebuffer, texture) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    if (texture) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
}

var drawVert = `
precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;
uniform vec2 u_res_scale;
uniform vec2 u_transform;
uniform float u_point_size;

varying vec2 v_particle_pos;

void main() {
    vec4 color = texture2D(u_particles, vec2(
        fract(a_index / u_particles_res),
        floor(a_index / u_particles_res) / u_particles_res));

    // decode current particle position from the pixel's RGBA value
    v_particle_pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a);

    vec2 v_correct_pos = v_particle_pos * u_res_scale;

    vec2 v_moved_pos = v_correct_pos + u_transform;

    gl_PointSize = u_point_size;
    gl_Position = vec4(2.0 * v_moved_pos.x - 1.0, 1.0 - 2.0 * v_moved_pos.y, 0, 1);
}
`;

var drawFrag = `
precision mediump float;

uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform sampler2D u_color_ramp;
uniform vec2 u_offset;
uniform float u_max_wind;
uniform vec2 u_distortion;

varying vec2 v_particle_pos;

void main() {
    vec4 wind = texture2D(u_wind, v_particle_pos / u_distortion + u_offset);

    vec2 velocity = mix(u_wind_min, u_wind_max, wind.rg);
    float speed_t = min(length(velocity) / u_max_wind, 1.0);

    // color ramp is encoded in a 16x16 texture
    vec2 ramp_pos = vec2(
        fract(16.0 * speed_t),
        floor(16.0 * speed_t) / 16.0);

    gl_FragColor = texture2D(u_color_ramp, ramp_pos) * wind.a;
}
`;

var quadVert = "precision mediump float;\n\nattribute vec2 a_pos;\n\nvarying vec2 v_tex_pos;\n\nvoid main() {\n    v_tex_pos = a_pos;\n    gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);\n}\n";

var screenFrag = "precision mediump float;\n\nuniform sampler2D u_screen;\nuniform float u_opacity;\n\nvarying vec2 v_tex_pos;\n\nvoid main() {\n    vec4 color = texture2D(u_screen, 1.0 - v_tex_pos);\n    // a hack to guarantee opacity fade out even with a value close to 1.0\n    gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);\n}\n";

var windFrag = `
precision highp float;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_offset;
uniform vec2 u_distortion;

varying vec2 v_tex_pos;

// wind speed lookup; use manual bilinear filtering based on 4 adjacent pixels for smooth interpolation
vec2 lookup_wind(const vec2 uv) {
    vec2 px = 1.0 / u_wind_res;
    vec2 vc = (floor(uv * u_wind_res)) * px;
    vec2 f = fract(uv * u_wind_res);
    vec2 tl = texture2D(u_wind, vc).rg;
    vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0)).rg;
    vec2 bl = texture2D(u_wind, vc + vec2(0, px.y)).rg;
    vec2 br = texture2D(u_wind, vc + px).rg;
    return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

void main() {
    vec4 color = texture2D(u_particles, 1.0 - v_tex_pos);
    vec2 pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a);

    vec2 vel = lookup_wind(pos / u_distortion + u_offset);

    gl_FragColor = vec4(
        fract(vel * 255.0),
        floor(vel * 255.0) / 255.0);
}
`;

function fract(num) {
    return num - Math.floor(num);
}

function rotateNum(num) {
    if (num < 0) {
        return num + 1;
    }
    else if (num < 1) {
        return num;
    }

    return 1 - num;
}

var defaultRampColors = {
    0.0: '#3288bd',
    0.173: '#66c2a5',
    0.349: '#edc945',
    0.511: '#fd8815',
    0.662: '#f46d43',
    0.845: '#d53e4f',
    1.0: '#aa3ed5',
};

var WindGL = function WindGL(gl) {
    this.gl = gl;

    this.fadeOpacity = 0.998; // how fast the particle trails fade on each frame
    this.speedFactor = 0.7; // how fast the particles move
    this.dropRate = 0.003; // how often the particles move to a random place
    this.dropRateBump = 0.01; // drop rate increase relative to individual particle speed
    this.pointSize = 1.5;
    this.maxWind = 20.0;
    this.opacity = 0.6;

    this.drawProgram = createProgram(gl, drawVert, drawFrag);
    this.screenProgram = createProgram(gl, quadVert, screenFrag);
    this.windProgram = createProgram(gl, quadVert, windFrag);

    this.quadBuffer = createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]));
    this.framebuffer = gl.createFramebuffer();

    this.posX = 0;
    this.posY = 0;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.setColorRamp(defaultRampColors);
    this.resize();
};
window.WindGL = WindGL;

var prototypeAccessors = { numParticles: {} };

WindGL.prototype.move = function(x, y) {
    this.posX = x;
    this.posY = y;
}

WindGL.prototype.zoom = function(scale) {
    this.scale = scale;
}

WindGL.prototype.offset = function(x, y) {
    this.offsetX = x;
    this.offsetY = y;
}

WindGL.prototype.reset = function() {
    let gl = this.gl;
    this.numParticles = this.numParticles;
    this.resize();
}

WindGL.prototype.calcDistortion = function() {
    return [
        Math.max(this.windData.width * this.scale / this.gl.canvas.width, 1),
        Math.max(this.windData.height * this.scale / this.gl.canvas.height, 1)
    ];
}

WindGL.prototype.resize = function resize () {
    var gl = this.gl;
    var width = gl.canvas.width;
    var height = gl.canvas.height;
    var emptyPixels = new Uint8Array(width * height * 4);
    // screen textures to hold the drawn screen for the previous and the current frame
    this.backgroundTexture = createTexture(gl, gl.NEAREST, emptyPixels, width, height);
    this.screenTexture = createTexture(gl, gl.NEAREST, emptyPixels, width, height);
};

WindGL.prototype.setColorRamp = function setColorRamp (colors) {
    // lookup texture for colorizing the particles according to their speed
    this.colorRampTexture = createTexture(this.gl, this.gl.LINEAR, getColorRamp(colors), 16, 16);
};

prototypeAccessors.numParticles.set = function (numParticles) {
    var gl = this.gl;

    // we create a square texture where each pixel will hold a particle position encoded as RGBA
    var particleRes = this.particleStateResolution = Math.ceil(Math.sqrt(numParticles));
    this._numParticles = particleRes * particleRes;

    var particleState = this.particleState = new Uint8Array(this._numParticles * 4);
    this.particles = new Array(this._numParticles);
    for (var i = 0; i < this.particles.length; i++) {
        var x = Math.random();
        var y = Math.random();

        this.particles[i] = [x, y];

        var statusIndex = i * 4;
        particleState[statusIndex + 0] = Math.floor(fract(x * 255) * 255);
        particleState[statusIndex + 1] = Math.floor(fract(y * 255) * 255);
        particleState[statusIndex + 2] = Math.floor(x * 255);
        particleState[statusIndex + 3] = Math.floor(y * 255);
    }
    // textures to hold the particle state for the current and the next frame
    this.particleStateTexture0 = createTexture(gl, gl.NEAREST, particleState, particleRes, particleRes);
    this.particleStateTexture1 = createTexture(gl, gl.NEAREST, particleState, particleRes, particleRes);

    var particleIndices = new Float32Array(this._numParticles);
    for (var i$1 = 0; i$1 < this._numParticles; i$1++) { particleIndices[i$1] = i$1; }
    this.particleIndexBuffer = createBuffer(gl, particleIndices);
};
prototypeAccessors.numParticles.get = function () {
    return this._numParticles;
};

WindGL.prototype.setWind = function setWind (windData) {
    this.windData = windData;
    this.windTexture = createTexture(this.gl, this.gl.LINEAR, windData.image);
};

WindGL.prototype.draw = function draw () {
    var gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    bindTexture(gl, this.windTexture, 0);
    bindTexture(gl, this.particleStateTexture0, 1);

    this.drawScreen();
    this.updateParticles();
};

WindGL.prototype.drawScreen = function drawScreen () {
    var gl = this.gl;
    // draw the screen into a temporary framebuffer to retain it as the background on the next frame
    bindFramebuffer(gl, this.framebuffer, this.screenTexture);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    this.drawTexture(this.backgroundTexture, this.fadeOpacity);
    this.drawParticles();

    bindFramebuffer(gl, null);
    // enable blending to support drawing on top of an existing background (e.g. a map)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawTexture(this.screenTexture, this.opacity);
    gl.disable(gl.BLEND);

    // save the current screen as the background for the next frame
    var temp = this.backgroundTexture;
    this.backgroundTexture = this.screenTexture;
    this.screenTexture = temp;
};

WindGL.prototype.drawTexture = function drawTexture (texture, opacity) {
    var gl = this.gl;
    var program = this.screenProgram;
    gl.useProgram(program.program);

    bindAttribute(gl, this.quadBuffer, program.a_pos, 2);
    bindTexture(gl, texture, 2);
    gl.uniform1i(program.u_screen, 2);
    gl.uniform1f(program.u_opacity, opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
};

WindGL.prototype.drawParticles = function drawParticles () {
    var gl = this.gl;
    var program = this.drawProgram;
    gl.useProgram(program.program);

    bindAttribute(gl, this.particleIndexBuffer, program.a_index, 1);
    bindTexture(gl, this.colorRampTexture, 2);

    gl.uniform1i(program.u_wind, 0);
    gl.uniform1i(program.u_particles, 1);
    gl.uniform1i(program.u_color_ramp, 2);

    gl.uniform1f(program.u_particles_res, this.particleStateResolution);
    gl.uniform2f(program.u_wind_min, this.windData.min_x, this.windData.min_y);
    gl.uniform2f(program.u_wind_max, this.windData.max_x, this.windData.max_y);
    gl.uniform1f(program.u_max_wind, this.maxWind);
    gl.uniform1f(program.u_point_size, this.pointSize);

    gl.uniform2f(program.u_res_scale, Math.min(this.windData.width * this.scale / gl.canvas.width, 1),
        Math.min(this.windData.height * this.scale / gl.canvas.height, 1));
    gl.uniform2f(program.u_transform, Math.max(this.posX / gl.canvas.width, 0),
        Math.max(this.posY / gl.canvas.height, 0));

    gl.uniform2f(program.u_offset, this.offsetX / this.windData.width,
        this.offsetY / this.windData.height);
    gl.uniform2fv(program.u_distortion, this.calcDistortion());

    gl.drawArrays(gl.POINTS, 0, this._numParticles);
};

WindGL.prototype.updateParticles = function updateParticles () {
    var distortion = this.calcDistortion();

    var gl = this.gl;
    bindFramebuffer(gl, this.framebuffer, this.particleStateTexture1);
    gl.viewport(0, 0, this.particleStateResolution, this.particleStateResolution);

    var program = this.windProgram;
    gl.useProgram(program.program);

    bindAttribute(gl, this.quadBuffer, program.a_pos, 2);

    gl.uniform1i(program.u_wind, 0);
    gl.uniform1i(program.u_particles, 1);
    gl.uniform2f(program.u_wind_res, this.windData.width, this.windData.height);

    gl.uniform2f(program.u_offset, this.offsetX / this.windData.width,
        this.offsetY / this.windData.height);
    gl.uniform2fv(program.u_distortion, distortion);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    // Read wind data.
    var pixels = this.particleState;
    gl.readPixels(0, 0, this.particleStateResolution, this.particleStateResolution,
        gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Move particles.
    var distortionX = distortion[0];
    var distortionY = distortion[1];
    if (distortionX > distortionY) {
        distortionX /= distortionY;
        distortionY = 1;
    }
    else {
        distortionY /= distortionX;
        distortionX = 1;
    }
    var termX = this.windData.max_x - this.windData.min_x;
    var termY = this.windData.max_y - this.windData.min_y;
    var pixelOffset = 0;
    for (var i = 0; i < this.particles.length; ++i) {
        var part = this.particles[i];
        var x = part[0];
        var y = part[1];

        var velX = (pixels[pixelOffset + 0] / 255 + pixels[pixelOffset + 2]) / 255 * termX + this.windData.min_x;
        var velY = (pixels[pixelOffset + 1] / 255 + pixels[pixelOffset + 3]) / 255 * termY + this.windData.min_y;
        var length = Math.sqrt(velX * velX + velY * velY);
        var speed = Math.min(length / this.maxWind, 1.0);
        var dropRate = this.dropRate + speed * this.dropRateBump;
        
        if (Math.random() < dropRate) {
            x = Math.random();
            y = Math.random();
        }
        else {
            x = rotateNum(-velX * distortionX * 0.0001 * this.speedFactor + x);
            y = rotateNum(velY * distortionY * 0.0001 * this.speedFactor + y);
        }

        part[0] = x;
        part[1] = y;

        pixels[pixelOffset + 0] = Math.floor(fract(x * 255) * 255);
        pixels[pixelOffset + 1] = Math.floor(fract(y * 255) * 255);
        pixels[pixelOffset + 2] = Math.floor(x * 255);
        pixels[pixelOffset + 3] = Math.floor(y * 255);

        pixelOffset += 4;
    }

    // Apply new particle positions.
    gl.bindTexture(gl.TEXTURE_2D, this.particleStateTexture1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.particleStateResolution, this.particleStateResolution,
        0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // swap the particle state textures so the new one becomes the current one
    var temp = this.particleStateTexture0;
    this.particleStateTexture0 = this.particleStateTexture1;
    this.particleStateTexture1 = temp;
};

Object.defineProperties( WindGL.prototype, prototypeAccessors );

function getColorRamp(colors) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    canvas.width = 256;
    canvas.height = 1;

    var gradient = ctx.createLinearGradient(0, 0, 256, 0);
    for (var stop in colors) {
        gradient.addColorStop(+stop, colors[stop]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);

    return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data);
}

return WindGL;

})));
