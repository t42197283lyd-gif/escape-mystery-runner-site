// Pickups and inventory. All effect timers advance only during active gameplay.
const ITEM_TYPES = [
    {name:'体力饮料', brief:'恢复 60 体力', color:0x6ce6a0, css:'#8fe1ac', symbol:'+'},
    {name:'瞬移装置', brief:'随机安全瞬移', color:0x7edcff, css:'#8ed9ef', symbol:'↗'},
    {name:'击退脉冲', brief:'击退并停顿 5 秒', color:0xf0bb71, css:'#f3c788', symbol:'◉'}
];
const inventory = [0,0,0];
let worldPickups = [], pickupGroup = null, pickupTime = 0;
let itemToastTime = 0, teleportProtection = 0, repelRemaining = 0, retreatPath = [];
let pulseMesh = null, pulseAge = 0;

function reachableCells(map, sx, sy, maxSteps=Infinity) {
    if (!map[sy] || map[sy][sx] !== 0) return [];
    const found=[{x:sx,y:sy,steps:0,parent:-1}], seen=new Set([`${sx},${sy}`]);
    for(let i=0;i<found.length;i++) {
        const p=found[i]; if(p.steps>=maxSteps) continue;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const x=p.x+dx,y=p.y+dy,key=`${x},${y}`;
            if(map[y]?.[x]===0 && !seen.has(key)) {seen.add(key);found.push({x,y,steps:p.steps+1,parent:i});}
        }
    }
    return found;
}

function shuffled(values) {
    const out=values.slice();
    for(let i=out.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
    return out;
}

function planPickups(map, count=30) {
    const cells=reachableCells(map,1,1).filter(p=>p.steps>=1);
    const near=shuffled(cells.filter(p=>p.steps<=7)), far=shuffled(cells.filter(p=>p.steps>7));
    const selected=near.slice(0,3).concat(shuffled(far.concat(near.slice(3))).slice(0,count-3));
    return selected.map((p,i)=>({...p,type:i%3}));
}

function showItemToast(text) {
    const el=document.getElementById('item-toast'); if(!el) return;
    el.textContent=text; el.classList.add('visible'); itemToastTime=2.8;
}

function refreshInventory() {
    for(let i=0;i<3;i++) {
        const button=document.getElementById(`item-slot-${i}`), count=document.getElementById(`item-count-${i}`);
        if(count) count.textContent=inventory[i];
        if(button) {button.classList.toggle('empty',inventory[i]===0);button.setAttribute('aria-label',`${ITEM_TYPES[i].name}，${inventory[i]} 个，${ITEM_TYPES[i].brief}`);}
    }
}

function resetItems() {
    inventory.fill(0); pickupTime=0; teleportProtection=0; repelRemaining=0; retreatPath=[];
    worldPickups=[]; pulseMesh=null; pulseAge=0;
    itemToastTime=0; const toast=document.getElementById('item-toast');if(toast){toast.classList.remove('visible');toast.textContent='';}
    refreshInventory();
    pickupGroup=new THREE.Group(); mazeGroup.add(pickupGroup);
    for(const p of planPickups(mazeData)) {
        const def=ITEM_TYPES[p.type], group=new THREE.Group();
        const material=new THREE.MeshStandardMaterial({color:def.color,emissive:def.color,emissiveIntensity:0.45,roughness:0.25,metalness:0.35});
        const geometry=p.type===0?new THREE.CylinderGeometry(0.19,0.19,0.52,12):p.type===1?new THREE.OctahedronGeometry(0.3):new THREE.TorusGeometry(0.23,0.065,8,20);
        const body=new THREE.Mesh(geometry,material); group.add(body);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(0.44,0.018,6,28),new THREE.MeshBasicMaterial({color:def.color}));
        ring.rotation.x=Math.PI/2;ring.position.y=-0.2;group.add(ring);
        const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;
        const ctx=canvas.getContext('2d');ctx.font='bold 52px sans-serif';ctx.textAlign='center';ctx.fillStyle=def.css;ctx.fillText(String(p.type+1),64,62);
        const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));
        label.scale.set(0.75,0.56,1);label.position.y=0.7;group.add(label);
        group.position.set((p.x+0.5)*CONFIG.cellSize,0.8,(p.y+0.5)*CONFIG.cellSize);
        pickupGroup.add(group); worldPickups.push({...p,mesh:group,collected:false});
    }
}

function collectPickup(p) {
    if(p.collected || inventory[p.type]>=5) return false;
    inventory[p.type]++;p.collected=true;if(p.mesh) p.mesh.visible=false;
    refreshInventory();showItemToast(`已拾取 ${ITEM_TYPES[p.type].name} · 按 ${p.type+1} 使用`);return true;
}

function updateItems(delta) {
    pickupTime+=delta;teleportProtection=Math.max(0,teleportProtection-delta);
    itemToastTime=Math.max(0,itemToastTime-delta);
    if(itemToastTime===0) {const toast=document.getElementById('item-toast');if(toast){toast.classList.remove('visible');toast.textContent='';}}
    for(const p of worldPickups) {
        if(p.collected) continue;
        p.mesh.position.y=0.8+Math.sin(pickupTime*2.5+p.x)*0.12;
        p.mesh.children[0].rotation.y+=delta;
        if(Math.hypot(camera.position.x-p.mesh.position.x,camera.position.z-p.mesh.position.z)<1.35) collectPickup(p);
    }
    if(pulseMesh) {
        pulseAge+=delta;const size=1+pulseAge*10;pulseMesh.scale.set(size,size,1);
        pulseMesh.material.opacity=Math.max(0,0.8-pulseAge);
        if(pulseAge>0.8) {pickupGroup.remove(pulseMesh);pulseMesh.geometry.dispose();pulseMesh.material.dispose();pulseMesh=null;}
    }
}

function chooseTeleportCell(map, player, enemy, cellSize, exit) {
    const all=reachableCells(map,Math.floor(player.x/cellSize),Math.floor(player.z/cellSize));
    const candidates=all.filter(p=>{
        const x=(p.x+0.5)*cellSize,z=(p.y+0.5)*cellSize;
        return Math.hypot(x-player.x,z-player.z)>=12 && (!enemy || Math.hypot(x-enemy.x,z-enemy.z)>=28) && (!exit || Math.hypot(x-exit.x,z-exit.z)>6);
    });
    return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null;
}

function chooseRetreatPath(map, enemy, player, cellSize) {
    const all=reachableCells(map,Math.floor(enemy.x/cellSize),Math.floor(enemy.z/cellSize),5);
    if(!all.length) return [];
    let best=0,bestScore=-Infinity;
    for(let i=0;i<all.length;i++) {
        const p=all[i],x=(p.x+0.5)*cellSize,z=(p.y+0.5)*cellSize;
        const score=Math.hypot(x-player.x,z-player.z)-p.steps*0.15;
        if(score>bestScore) {best=i;bestScore=score;}
    }
    const route=[];
    for(let i=best;i>=0;i=all[i].parent) route.unshift({x:(all[i].x+0.5)*cellSize,z:(all[i].y+0.5)*cellSize});
    return route;
}

function useInventoryItem(type) {
    if(!gameStarted || gameEnded || gamePaused || settingsOpen || !ITEM_TYPES[type]) return false;
    if(inventory[type]===0) {showItemToast('还没有这个道具 · 靠近发光道具自动拾取');return false;}
    if(type===0) {
        if(stamina>=CONFIG.staminaMax) {showItemToast('体力已满，饮料已保留');return false;}
        stamina=Math.min(CONFIG.staminaMax,stamina+60);staminaExhausted=false;
        document.getElementById('stamina-fill').style.width=`${stamina/CONFIG.staminaMax*100}%`;
        showItemToast('体力 +60 · 可以继续冲刺');
    } else if(type===1) {
        const p=chooseTeleportCell(mazeData,camera.position,ghost?.position,CONFIG.cellSize,exitPosition);
        if(!p) {showItemToast('当前没有安全瞬移位置，道具已保留');return false;}
        camera.position.set((p.x+0.5)*CONFIG.cellSize,CONFIG.playerHeight,(p.y+0.5)*CONFIG.cellSize);
        headBobAmp=0;headBobPhase=0;teleportProtection=1.5;ghostPath=[];ghostPathTimer=0;
        silenceFootsteps();showItemToast('瞬移完成 · 短暂无敌 1.5 秒');
        document.getElementById('item-flash').classList.remove('active');
        void document.getElementById('item-flash').offsetWidth;
        document.getElementById('item-flash').classList.add('active');
    } else {
        if(!ghost || Math.hypot(ghost.position.x-camera.position.x,ghost.position.z-camera.position.z)>20) {
            showItemToast('敌人不在 20 米范围内，道具已保留');return false;
        }
        retreatPath=chooseRetreatPath(mazeData,ghost.position,camera.position,CONFIG.cellSize);
        repelRemaining=5;ghostPath=[];ghostPathTimer=0;detectedByGhost=false;dangerLevel=0;
        if(bgmAudio) bgmAudio.volume=0;
        if(pulseMesh) {pickupGroup.remove(pulseMesh);pulseMesh.geometry.dispose();pulseMesh.material.dispose();}
        pulseMesh=new THREE.Mesh(new THREE.RingGeometry(0.7,0.84,48),new THREE.MeshBasicMaterial({color:0xf0bb71,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false}));
        pulseMesh.rotation.x=-Math.PI/2;pulseMesh.position.set(camera.position.x,0.1,camera.position.z);pickupGroup.add(pulseMesh);pulseAge=0;
        showItemToast('脉冲释放 · 敌人已击退，停顿 5 秒');
    }
    inventory[type]--;refreshInventory();return true;
}

function updateRepelledGhost(delta) {
    if(repelRemaining<=0) return false;
    repelRemaining=Math.max(0,repelRemaining-delta);
    if(retreatPath.length) {
        const target=retreatPath[0],dx=target.x-ghost.position.x,dz=target.z-ghost.position.z,d=Math.hypot(dx,dz),step=20*delta;
        if(d<=step) {ghost.position.x=target.x;ghost.position.z=target.z;retreatPath.shift();}
        else {ghost.position.x+=dx/d*step;ghost.position.z+=dz/d*step;}
    }
    ghost.userData.runner?.update();
    if(ghost.userData.light) ghost.userData.light.intensity=0.4;
    document.getElementById('danger-vignette').style.background='transparent';
    const warning=document.getElementById('ghost-warning');warning.textContent=`敌人停顿 ${Math.ceil(repelRemaining)} 秒`;warning.style.opacity='1';
    if(bgmAudio) bgmAudio.volume=0;
    if(repelRemaining===0) {retreatPath=[];ghostPath=[];ghostPathTimer=0;warning.textContent='他在找你';}
    return true;
}

function setupInventoryControls() {
    for(let i=0;i<3;i++) document.getElementById(`item-slot-${i}`).addEventListener('click',()=>useInventoryItem(i));
    document.addEventListener('keydown',e=>{
        if(e.repeat) return;
        const type=['Digit1','Digit2','Digit3'].indexOf(e.code);
        const numpad=['Numpad1','Numpad2','Numpad3'].indexOf(e.code);
        if(type>=0 || numpad>=0) {e.preventDefault();useInventoryItem(type>=0?type:numpad);}
    });
}
