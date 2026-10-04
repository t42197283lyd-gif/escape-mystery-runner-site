// Native orientation switching with a manual-rotation fallback for iOS/webviews.
(() => {
    if (!IS_MOBILE) return;
    document.documentElement.classList.add('mobile-game');
    const button=document.getElementById('landscape-btn');
    const hint=document.getElementById('rotate-hint');
    const message=document.getElementById('rotate-message');
    button.hidden=false;
    let dismissed=false,pausedByHint=false,busy=false;
    function updateOrientation() {
        const portrait=window.innerHeight>window.innerWidth;
        if(!portrait)dismissed=false;
        hint.hidden=!portrait || dismissed;
        if(!hint.hidden && gameStarted && !gameEnded && !gamePaused) {
            pausedByHint=true;pauseGame(false);
        }
        if(hint.hidden && pausedByHint) {pausedByHint=false;resumeGame();}
        button.textContent=document.fullscreenElement?'⛶ 退出全屏':'⛶ 横屏';
        joystickActive=false;joystickVector={x:0,y:0};
        document.getElementById('joystick-stick').style.transform='translate(0,0)';
    }
    async function landscape() {
        if(busy)return;busy=true;
        try {
            if(!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            if(screen.orientation?.lock) await screen.orientation.lock('landscape');
            else throw Error('Orientation lock unavailable');
        } catch(error) {
            message.textContent='此浏览器需要手动横屏：请关闭手机方向锁，再将手机横置。';
        } finally {busy=false;updateOrientation();}
    }
    button.addEventListener('click',async()=>{
        if(document.fullscreenElement) {
            try{screen.orientation?.unlock?.();await document.exitFullscreen();}catch(error){}
        } else {dismissed=false;await landscape();}
        updateOrientation();
    });
    document.getElementById('rotate-action').addEventListener('click',landscape);
    document.getElementById('rotate-dismiss').addEventListener('click',()=>{dismissed=true;updateOrientation();});
    window.addEventListener('resize',updateOrientation);
    document.addEventListener('fullscreenchange',updateOrientation);
    updateOrientation();
})();
