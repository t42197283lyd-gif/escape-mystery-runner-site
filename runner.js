// Original 8 poses extracted with ImageGen; UV rectangles retain complete shoes.
const RUNNER_ATLAS = {
    width: 1536, height: 1024, worldHeight: 2.85, strideMeters: 3.6,
    frames: [[84,13,225,511],[458,13,230,515],[840,13,245,515],[1235,13,228,509],
             [87,535,231,481],[464,535,237,481],[846,536,225,475],[1228,535,231,473]]
};

class RunnerAnimator {
    constructor(sprite, texture) {
        this.sprite = sprite;
        this.texture = texture;
        this.phase = 0;
        this.frame = -1;
        this.lastX = sprite.position.x;
        this.lastZ = sprite.position.z;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        sprite.center.set(0.5, 0);
        this.applyFrame(0);
    }
    applyFrame(index) {
        this.frame = index;
        const [x,y,w,h] = RUNNER_ATLAS.frames[index];
        this.texture.repeat.set(w / RUNNER_ATLAS.width, h / RUNNER_ATLAS.height);
        this.texture.offset.set(x / RUNNER_ATLAS.width, 1 - (y+h) / RUNNER_ATLAS.height);
        this.sprite.scale.set(RUNNER_ATLAS.worldHeight * w / h, RUNNER_ATLAS.worldHeight, 1);
    }
    reset() {
        this.phase = 0;
        this.lastX = this.sprite.position.x;
        this.lastZ = this.sprite.position.z;
        this.sprite.position.y = 0;
        this.sprite.material.rotation = 0;
        this.applyFrame(0);
    }
    update() {
        const distance = Math.hypot(this.sprite.position.x-this.lastX, this.sprite.position.z-this.lastZ);
        this.lastX = this.sprite.position.x;
        this.lastZ = this.sprite.position.z;
        // Ignore teleports; pause/idle leaves the pose stable and the feet grounded.
        if (distance > 4) { this.reset(); return; }
        if (distance < 0.0001) {
            this.sprite.position.y = 0;
            this.sprite.material.rotation = 0;
            return;
        }
        this.phase = (this.phase + distance / RUNNER_ATLAS.strideMeters) % 1;
        const index = Math.floor(this.phase * RUNNER_ATLAS.frames.length);
        if (index !== this.frame) this.applyFrame(index);
        this.sprite.position.y = Math.abs(Math.sin(this.phase * Math.PI * 4)) * 0.035;
        this.sprite.material.rotation = Math.sin(this.phase * Math.PI * 2) * 0.018;
    }
}

function showCoverFrame(element, index) {
    const [x,y,w,h] = RUNNER_ATLAS.frames[index];
    // CSS clips the same source rectangles as the game without duplicating raster files.
    element.style.aspectRatio = `${w} / ${h}`;
    element.style.backgroundSize = `${RUNNER_ATLAS.width/w*100}% ${RUNNER_ATLAS.height/h*100}%`;
    element.style.backgroundPosition = `${x/(RUNNER_ATLAS.width-w)*100}% ${y/(RUNNER_ATLAS.height-h)*100}%`;
}

if (typeof module !== 'undefined') module.exports = {RUNNER_ATLAS,RunnerAnimator};
