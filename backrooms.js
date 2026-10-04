// Code-native materials: stained wallpaper, carpet, acoustic ceiling and fixtures.
function addBackroomRooms(map) {
    const h=map.length,w=map[0].length;
    const count=Math.max(3,Math.floor(w*h/190));
    for(let i=0;i<count;i++) {
        const cx=3+2*Math.floor(Math.random()*Math.max(1,(w-7)/2));
        const cy=3+2*Math.floor(Math.random()*Math.max(1,(h-7)/2));
        const rw=2+Math.floor(Math.random()*3),rh=2+Math.floor(Math.random()*3);
        for(let y=cy-rh;y<=cy+rh;y++) for(let x=cx-rw;x<=cx+rw;x++) {
            if(x>0&&y>0&&x<w-1&&y<h-1) map[y][x]=0;
        }
    }
    return map;
}

function createBackroomTexture(kind,repeatX=1,repeatY=1) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=kind==='wall'?'#c6b46e':kind==='floor'?'#766c49':'#c9c5a3';ctx.fillRect(0,0,512,512);
    let seed=kind==='wall'?13:kind==='floor'?57:91;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<(kind==='floor'?34000:15000);i++) {
        const shade=random()>0.5?'255,245,189':'48,39,19';
        ctx.fillStyle=`rgba(${shade},${random()*(kind==='floor'?0.18:0.10)})`;
        ctx.fillRect(random()*512,random()*512,kind==='floor'?1:2,1+random()*2);
    }
    if(kind==='wall') {
        for(let x=0;x<512;x+=32) {
            ctx.fillStyle='rgba(104,86,44,0.10)';ctx.fillRect(x,0,2,512);
            for(let y=20;y<480;y+=48) {
                ctx.strokeStyle='rgba(93,74,28,0.14)';ctx.lineWidth=1.2;
                ctx.beginPath();ctx.moveTo(x+16,y-11);ctx.quadraticCurveTo(x+29,y,x+16,y+11);ctx.quadraticCurveTo(x+3,y,x+16,y-11);ctx.stroke();
            }
        }
        const grime=ctx.createLinearGradient(0,355,0,490);grime.addColorStop(0,'rgba(65,48,22,0)');grime.addColorStop(1,'rgba(65,48,22,.33)');ctx.fillStyle=grime;ctx.fillRect(0,355,512,135);
        ctx.fillStyle='#5d5436';ctx.fillRect(0,487,512,25);ctx.fillStyle='#94855a';ctx.fillRect(0,487,512,3);
        ctx.fillStyle='rgba(58,47,23,.12)';ctx.fillRect(510,0,2,512);
    } else if(kind==='floor') {
        for(let i=0;i<11;i++) {
            const x=random()*512,y=random()*512,r=25+random()*65,g=ctx.createRadialGradient(x,y,0,x,y,r);
            g.addColorStop(0,'rgba(27,29,15,.17)');g.addColorStop(1,'rgba(27,29,15,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
        }
        ctx.fillStyle='rgba(43,40,26,.13)';ctx.fillRect(0,0,1,512);ctx.fillRect(0,0,512,1);
    } else {
        ctx.strokeStyle='#777765';ctx.lineWidth=3;
        for(let x=0;x<=512;x+=128) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}
        for(let y=0;y<=512;y+=128) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeatX,repeatY);
    return texture;
}

function addBackroomFixtures() {
    const cells=[];
    for(let y=1;y<mazeData.length-1;y++) for(let x=1;x<mazeData[0].length-1;x++) {
        if(mazeData[y][x]===0 && ((x%3===1&&y%3===1)||(x===3&&y===1))) cells.push({x,y});
    }
    const frame=new THREE.InstancedMesh(new THREE.BoxGeometry(0.92,0.09,1.95),new THREE.MeshStandardMaterial({color:0x676859,roughness:0.8}),cells.length);
    const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(0.77,0.03,1.78),new THREE.MeshBasicMaterial({color:0xfff4b6}),cells.length);
    const dummy=new THREE.Object3D();
    for(let i=0;i<cells.length;i++) {
        const p=cells[i];dummy.position.set((p.x+0.5)*CONFIG.cellSize,CONFIG.wallHeight-0.065,(p.y+0.5)*CONFIG.cellSize);dummy.updateMatrix();frame.setMatrixAt(i,dummy.matrix);
        dummy.position.y-=0.065;dummy.updateMatrix();lamps.setMatrixAt(i,dummy.matrix);
    }
    mazeGroup.add(frame,lamps);
    // A few local lights complement ambient illumination without hundreds of light sources.
    for(const p of cells.filter(p=>p.x<9&&p.y<9).slice(0,5)) {
        const light=new THREE.PointLight(0xffefb0,1.1,17,1.5);light.position.set((p.x+0.5)*4,CONFIG.wallHeight-0.2,(p.y+0.5)*4);mazeGroup.add(light);
    }
}

function setupBackroomLighting() {
    gameAmbient=new THREE.AmbientLight(0xffefd0,BASE_AMBIENT*brightnessMul);scene.add(gameAmbient);
    const fill=new THREE.HemisphereLight(0xffefc7,0x71643a,0.45);scene.add(fill);
}
