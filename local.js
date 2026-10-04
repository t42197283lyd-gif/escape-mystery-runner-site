// Local usability additions: pause, key reset, drag fallback for embedded browsers.
let pauseStartedAt = 0;
const pauseScreen = document.getElementById('pause-screen');
function pauseGame(showOverlay = true) {
    if (!gameStarted || gameEnded || gamePaused) return;
    gamePaused = true;
    pauseStartedAt = Date.now();
    Object.keys(keys).forEach(key => { keys[key] = false; });
    joystickActive = false;
    joystickVector = {x: 0, y: 0};
    document.getElementById('joystick-stick').style.transform = 'translate(0,0)';
    silenceFootsteps();
    if (bgmAudio) bgmAudio.pause();
    pauseScreen.hidden = !showOverlay;
}
function resumeGame() {
    if (!gamePaused) return;
    startTime += Date.now() - pauseStartedAt;
    gamePaused = false;
    pauseScreen.hidden = true;
    unlockAudio();
    if (!isMobile()) requestLockRobust();
}
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !settingsOpen) pauseGame();
});
document.addEventListener('keydown', e => {
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' && !settingsOpen) {
        if (gamePaused) resumeGame();
        else {
            pauseGame();
            if (document.pointerLockElement) document.exitPointerLock();
        }
    }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => { if (!settingsOpen) pauseGame(); });
document.getElementById('settings-btn').addEventListener('click', () => {
    if (settingsOpen) pauseGame(false);
    else resumeGame();
});
document.getElementById('settings-close').addEventListener('click', resumeGame);
let dragging = false;
renderer.domElement.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || isPointerLocked || !gameStarted || gameEnded || gamePaused) return;
    dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
    if (!dragging || isPointerLocked || gamePaused) return;
    yaw -= e.movementX * BASE_MOUSE_SENS * sensitivityMul;
    pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch - e.movementY * BASE_MOUSE_SENS * sensitivityMul));
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
document.getElementById('brightness-slider').setAttribute('aria-label', '亮度');
document.getElementById('sens-slider').setAttribute('aria-label', '鼠标灵敏度');

// Preview the actual run cycle in the menu; the in-game pose is driven by travel.
const runnerCover = document.getElementById('cover-ghost');
let coverLastFrame = -1;
function animateRunnerCover(now) {
    requestAnimationFrame(animateRunnerCover);
    if (gameStarted && !gameEnded) return;
    const frame = Math.floor(now / 90) % RUNNER_ATLAS.frames.length;
    if (frame !== coverLastFrame) { showCoverFrame(runnerCover,frame); coverLastFrame=frame; }
}
showCoverFrame(runnerCover,0);
requestAnimationFrame(animateRunnerCover);
