// Public shared rankings; unavailable services never masquerade as a local/global list.
const PlayerRankings = (() => {
    const config=window.LEADERBOARD_CONFIG || {};
    let activeRun=null;
    const panels=['death-ranking','escape-ranking'].map(id=>document.getElementById(id));
    const nameInput=document.getElementById('player-name');
    function cleanName(value) {
        return Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,20).join('') || '游客';
    }
    try{nameInput.value=localStorage.getItem('runner-player-name') || '';}catch(error){}
    function connected() {
        return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url || '') && /^sb_publishable_/.test(config.publishableKey || '');
    }
    async function rpc(method,body) {
        if(!connected())throw Error('共享排行榜尚未连接，当前成绩暂未上传。');
        let response;
        try{response=await fetch(config.url+'/rest/v1/rpc/'+method,{
                method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},
                body:JSON.stringify(body),signal:AbortSignal.timeout(8000)
            });
        }catch(error){throw Error('网络连接失败，请稍后刷新或重试。');}
        if(!response.ok)throw Error('成绩服务暂时不可用，请点击重试同步。');
        return response.json();
    }
    function formatTime(ms) {
        const seconds=Math.floor(ms/1000);
        return Math.floor(seconds/60).toString().padStart(2,'0')+':'+(seconds%60).toString().padStart(2,'0');
    }
    function start() {
        const name=cleanName(nameInput.value);
        try{localStorage.setItem('runner-player-name',name==='游客'?'':name);}catch(error){}
        const run={name,finished:false,session:null,result:null};activeRun=run;
        // Catch here to avoid unhandled rejection while the player is still running.
        run.ready=rpc('runner_start',{p_name:name}).then(id=>{run.session=id;return true;}).catch(error=>{run.error=error.message;return false;});
        for(const panel of panels){panel._run=run;panel._load=0;panel.querySelector('.ranking-list').replaceChildren();}
    }
    function row(record,rank,current) {
        const el=document.createElement('div');el.className='ranking-row'+(current?' current':'');
        for(const value of [String(rank),record.name,formatTime(record.duration_ms)]) {
            const span=document.createElement('span');span.textContent=value;el.appendChild(span);
        }
        return el;
    }
    async function render(panel) {
        const ticket=++panel._load,run=panel._run,board=panel._board || 'survival';
        const list=panel.querySelector('.ranking-list'),status=panel.querySelector('.ranking-status');
        status.textContent='正在读取共享排行榜…';list.replaceChildren();
        for(const button of panel.querySelectorAll('[data-board]'))button.setAttribute('aria-pressed',String(button.dataset.board===board));
        try{
            const data=await rpc('runner_rankings',{p_board:board,p_run_id:run?.session || null});
            if(panel._load!==ticket || panel._run!==run)return;
            if(!Array.isArray(data.rows))throw Error('排行榜返回异常，请稍后重试。');
            data.rows.forEach((record,index)=>list.appendChild(row(record,index+1,record.id===run?.session)));
            if(data.own && !data.rows.some(record=>record.id===data.own.id))list.appendChild(row(data.own,data.own.rank,true));
            if(!data.rows.length){const empty=document.createElement('p');empty.textContent='还没有成绩，来留下第一条记录。';list.appendChild(empty);}
            status.textContent=(run?.synced?'本局成绩已上传。':(run?.error || ''))+(data.own?' 本局第 '+data.own.rank+' 名。':'');
            panel.querySelector('.ranking-retry').hidden=false;
            panel.querySelector('.ranking-retry').textContent=run?.session && !run.synced?'重试同步':'刷新榜单';
        }catch(error){
            if(panel._load!==ticket || panel._run!==run)return;
            status.textContent=run?.error || error.message;
            panel.querySelector('.ranking-retry').hidden=!connected();
            panel.querySelector('.ranking-retry').textContent=run?.session && !run.synced?'重试同步':'刷新榜单';
        }
    }
    async function sync(run,panel) {
        if(run.syncing)return;run.syncing=true;
        try{
            panel.querySelector('.ranking-status').textContent='正在上传本局成绩…';
            await run.ready;
            if(!run.session)throw Error(connected()?'开局时未连接成绩服务，本局未上传；请联网后开始下一局。':run.error);
            await rpc('runner_finish',{p_run_id:run.session,p_outcome:run.result.outcome,p_duration_ms:run.result.duration_ms});
            run.synced=true;run.error='';
        }catch(error){run.error=error.message;}
        finally{run.syncing=false;if(panel._run===run)await render(panel);}
    }
    function finish(won,durationMs) {
        const run=activeRun;
        if(!run || run.finished)return;
        run.finished=true;
        run.result={outcome:won?'escape':'survival',duration_ms:Math.max(0,Math.floor(durationMs))};
        const panel=panels[won?1:0];panel._board=run.result.outcome;
        void sync(run,panel);
    }
    for(const panel of panels) {
        panel._load=0;
        panel.querySelectorAll('[data-board]').forEach(button=>button.addEventListener('click',()=>{panel._board=button.dataset.board;void render(panel);}));
        panel.querySelector('.ranking-retry').addEventListener('click',()=>{
            if(panel._run?.result && panel._run.session && !panel._run.synced)void sync(panel._run,panel);else void render(panel);
        });
    }
    return {start,finish,cleanName,formatTime};
})();
