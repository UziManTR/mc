const CFG=window.MCPVP_CONFIG||{};const hasSB=CFG.supabaseUrl&&CFG.supabaseKey;let sb=null,channel=null;
if(hasSB) sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey);

const canvas=document.querySelector('#game'),menu=document.querySelector('#menu'),hud=document.querySelector('#hud'),settings=document.querySelector('#settings'),death=document.querySelector('#death');
const scene=new THREE.Scene();scene.background=new THREE.Color(0x87a8bd);scene.fog=new THREE.Fog(0x87a8bd,28,75);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.05,120);camera.position.set(0,2.3,8);
const renderer=new THREE.WebGLRenderer({canvas,antialias:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;
scene.add(new THREE.HemisphereLight(0xc9e7ff,0x30402e,1.5));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(15,25,8);sun.castShadow=true;scene.add(sun);

const clock=new THREE.Clock(), keys={}, blocks=[], remotes=new Map(), hitboxHelpers=[],windShots=[];let playing=false,dead=false,weapon='sword',hp=20,stamina=100,yaw=0,pitch=0,lastAttack=0,hitboxes=true,particles=true;
const player={pos:new THREE.Vector3(0,1.8,8),vel:new THREE.Vector3(),height:1.8,radius:.34,sprinting:false,blocking:false};
const bot={pos:new THREE.Vector3(0,1,-10),vel:new THREE.Vector3(),hp:20,maxHp:20,attack:0,phase:0};
function tex(base,accent){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,32,32);for(let i=0;i<55;i++){x.fillStyle=accent;x.fillRect(Math.random()*30|0,Math.random()*30|0,2+Math.random()*3,2+Math.random()*3)}const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;return t}
const mats={grass:new THREE.MeshLambertMaterial({map:tex('#5f9b4b','#477637')}),dirt:new THREE.MeshLambertMaterial({map:tex('#805936','#624126')}),stone:new THREE.MeshLambertMaterial({map:tex('#7c8085','#62666b')}),wood:new THREE.MeshLambertMaterial({map:tex('#8a603a','#604126')}),leaf:new THREE.MeshLambertMaterial({map:tex('#3c793c','#285828')}),brick:new THREE.MeshLambertMaterial({map:tex('#9a5342','#713a30')})};

function block(x,y,z,type='grass',s=1){const g=new THREE.BoxGeometry(s,s,s),m=mats[type]||mats.stone,q=new THREE.Mesh(g,m);q.position.set(x,y,z);q.castShadow=true;q.receiveShadow=true;scene.add(q);blocks.push(q);return q}
function makeArena(){for(let x=-18;x<=18;x++)for(let z=-18;z<=18;z++)block(x,-.5,z,(Math.abs(x+z)%5===0)?'dirt':'grass');for(let x=-18;x<=18;x++){block(x,.5,-18,'stone');block(x,.5,18,'stone')}for(let z=-17;z<18;z++){block(-18,.5,z,'stone');block(18,.5,z,'stone')}
for(let x=-5;x<=5;x++)for(let z=-2;z<=2;z++)if(Math.abs(x)>2)block(x,.5,z,'brick');
for(const [x,z] of [[-10,-8],[10,-8],[-10,8],[10,8]]){for(let y=0;y<4;y++)block(x,y,z,'wood');for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)block(x+dx,4,z+dz,'leaf')}
}
makeArena();

function playerMesh(color=0x4db6ff){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(.7,1,.4),new THREE.MeshLambertMaterial({color}));body.position.y=1;const head=new THREE.Mesh(new THREE.BoxGeometry(.65,.65,.65),new THREE.MeshLambertMaterial({color:0xf0c7a5}));head.position.y=1.85;g.add(body,head);return g}
const localMesh=playerMesh(0x4db6ff);scene.add(localMesh);
const botMesh=playerMesh(0xd54a4a);scene.add(botMesh);

function updateCamera(){camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;camera.position.copy(player.pos).add(new THREE.Vector3(0,.1,0));localMesh.visible=false}
function aimDir(){return new THREE.Vector3(0,0,-1).applyEuler(camera.rotation).normalize()}
function distXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}

function knock(target,force){if(!target)return;const d=target.pos.clone().sub(player.pos);d.y=0;if(d.lengthSq()<.001)d.set(0,0,-1);d.normalize();target.vel.addScaledVector(d,force);target.vel.y+=force*.22}
function windAttack(){if(performance.now()-lastAttack<800)return;lastAttack=performance.now();const p=new THREE.Mesh(new THREE.SphereGeometry(.22,8,8),new THREE.MeshBasicMaterial({color:0x7fe8ff}));p.position.copy(camera.position);p.userData={v:aimDir().multiplyScalar(18),life:0};scene.add(p);windShots.push(p);document.querySelector('#status').textContent='WIND CHARGE'}
function attack(){if(!playing||dead)return;if(weapon==='wind'){windAttack();return}if(performance.now()-lastAttack< (weapon==='mace'?650:weapon==='spear'?450:340))return;lastAttack=performance.now();const slot=document.querySelector('.slot.selected');slot.classList.remove('attack');void slot.offsetWidth;slot.classList.add('attack');
const facing=aimDir();let target=null,targetId=null,targetPos=null;let best=Infinity;for(const [id,r] of remotes){const d=distXZ(player.pos,r.mesh.position);const to=r.mesh.position.clone().add(new THREE.Vector3(0,1,0)).sub(camera.position).normalize();const dot=facing.dot(to);if(d<weaponRange()&&dot>.55&&d<best){best=d;target=r;targetId=id;targetPos=r.mesh.position}}const botD=distXZ(player.pos,bot.pos);const botTo=bot.pos.clone().add(new THREE.Vector3(0,1,0)).sub(camera.position).normalize();if(!target&&botD<weaponRange()&&facing.dot(botTo)>.55){target=bot;targetPos=bot.pos}
if(target){let damage=weapon==='mace'?8:weapon==='spear'?5:4;if(weapon==='mace'&&player.pos.y>targetPos.y+.5)damage=12;if(target===bot){bot.hp-=damage;knock(bot,weapon==='mace'?8:weapon==='spear'?6:5);botMesh.rotation.y+=.2;spawnHit(bot.pos);if(bot.hp<=0){bot.hp=20;bot.pos.set((Math.random()-.5)*26,1,(Math.random()-.5)*26);document.querySelector('#status').textContent='BOT RESPAWNED'}}else{spawnHit(targetPos);if(channel)channel.send({type:'broadcast',event:'hit',payload:{attacker:myId,targetId,weapon,damage,knock:weapon==='mace'?8:6}})}document.querySelector('#status').textContent='HIT -'+damage}}
function weaponRange(){return weapon==='spear'?4.2:weapon==='mace'?3:3.2}
function spawnHit(p){if(!particles)return;for(let i=0;i<10;i++){const q=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.08),new THREE.MeshBasicMaterial({color:0xffd34d}));q.position.copy(p);q.userData.v=new THREE.Vector3((Math.random()-.5)*4,Math.random()*4,(Math.random()-.5)*4);q.userData.t=0;scene.add(q);particlesList.push(q)}}
const particlesList=[];
function updateWind(dt){for(let i=windShots.length-1;i>=0;i--){const p=windShots[i];p.userData.life+=dt;p.position.addScaledVector(p.userData.v,dt);for(const target of [bot,...[...remotes.values()].map(r=>({pos:r.mesh.position,vel:r.vel||new THREE.Vector3()}))]){if(distXZ(p.position,target.pos)<1.2&&Math.abs(p.position.y-target.pos.y)<2){const d=target.pos.clone().sub(p.position);d.y=.7;d.normalize();target.vel.addScaledVector(d,10);spawnHit(target.pos);scene.remove(p);windShots.splice(i,1);break}}if(p.userData.life>1.5){scene.remove(p);windShots.splice(i,1)}}}
function updateParticles(dt){for(let i=particlesList.length-1;i>=0;i--){const q=particlesList[i];q.userData.t+=dt;q.position.addScaledVector(q.userData.v,dt);q.userData.v.y-=8*dt;if(q.userData.t>.5){scene.remove(q);q.geometry.dispose();q.material.dispose();particlesList.splice(i,1)}}}

function updateBot(dt){if(bot.hp<=0)return;const to=player.pos.clone().sub(bot.pos);to.y=0;const d=to.length();if(d>2.7){to.normalize();bot.vel.lerp(to.multiplyScalar(2.3),Math.min(1,dt*5));bot.pos.addScaledVector(bot.vel,dt);botMesh.rotation.y=Math.atan2(bot.vel.x,bot.vel.z)}else{bot.vel.multiplyScalar(.75);bot.attack-=dt;if(bot.attack<=0){bot.attack=1.0;if(!player.blocking){hp=Math.max(0,hp-2);flashDamage();}else hp=Math.max(0,hp-1)}}botMesh.position.copy(bot.pos);botMesh.position.y=0}
function flashDamage(){const f=document.querySelector('#damageFlash');f.style.opacity='.35';setTimeout(()=>f.style.opacity='0',100)}

function updatePlayer(dt){const f=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw)),dir=new THREE.Vector3();if(keys.KeyW)dir.add(f);if(keys.KeyS)dir.sub(f);if(keys.KeyD)dir.add(r);if(keys.KeyA)dir.sub(r);if(dir.lengthSq())dir.normalize();
player.sprinting=!!(keys.ShiftLeft||keys.ShiftRight)&&dir.lengthSq()>0&&stamina>1;const speed=(player.sprinting?6.8:4.2)*(window.pvpSpeed||1);if(player.sprinting)stamina=Math.max(0,stamina-dt*24);else stamina=Math.min(100,stamina+dt*16);player.vel.set(dir.x*speed,0,dir.z*speed);player.pos.addScaledVector(player.vel,dt);player.pos.x=Math.max(-16.5,Math.min(16.5,player.pos.x));player.pos.z=Math.max(-16.5,Math.min(16.5,player.pos.z));player.blocking=!!keys.MouseRight;updateCamera();localMesh.position.copy(player.pos);localMesh.position.y=0;
if(hp<=0){dead=true;death.classList.remove('hidden');hud.classList.add('hidden');document.exitPointerLock?.()}}
function updateUI(){document.querySelector('#stamina i').style.width=stamina+'%';document.querySelector('#targetHealth').style.width=(bot.hp/20*100)+'%';let h='';for(let i=0;i<10;i++)h+=i<Math.ceil(hp/2)?'♥':'<span class="heartEmpty">♥</span>';document.querySelector('#hearts').innerHTML=h;document.querySelector('#crossInfo').textContent='HITBOXES: '+(hitboxes?'ON':'OFF');document.querySelector('#online').textContent=hasSB?'ONLINE':'OFFLINE';document.querySelector('#online').classList.toggle('off',!hasSB)}
function drawHitboxes(){for(const h of hitboxHelpers)scene.remove(h);hitboxHelpers.length=0;if(!hitboxes)return;for(const p of [botMesh,...[...remotes.values()].map(x=>x.mesh)]){const h=new THREE.BoxHelper(p,0xff3344);scene.add(h);hitboxHelpers.push(h)}}

function loop(){requestAnimationFrame(loop);drawHitboxes();const dt=Math.min(.05,clock.getDelta());if(playing&&!dead){updatePlayer(dt);updateBot(dt);updateParticles(dt);updateWind(dt);updateUI();}renderer.render(scene,camera)}loop();

addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Digit1')selectWeapon('sword');if(e.code==='Digit2')selectWeapon('mace');if(e.code==='Digit3')selectWeapon('spear');if(e.code==='Digit4')selectWeapon('wind');if(e.code==='F3'){hitboxes=!hitboxes;document.querySelector('#showHitboxes').checked=hitboxes}if(e.code==='Escape'&&playing){document.exitPointerLock?.();}});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('mousedown',e=>{if(!playing)return;if(e.button===0)attack();if(e.button===2)e.preventDefault()});addEventListener('mouseup',e=>{if(e.button===2)keys.MouseRight=false});addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=Math.max(-1.45,Math.min(1.45,pitch))}});
function selectWeapon(w){weapon=w;document.querySelectorAll('.slot').forEach(x=>x.classList.toggle('selected',x.dataset.weapon===w));document.querySelectorAll('.menuWeapon').forEach(x=>x.classList.toggle('selected',x.dataset.weapon===w));document.querySelector('#status').textContent=w.toUpperCase()+' EQUIPPED'}
document.querySelectorAll('.menuWeapon').forEach(x=>x.addEventListener('click',()=>selectWeapon(x.dataset.weapon)));
document.querySelectorAll('.slot').forEach(x=>{x.addEventListener('click',()=>selectWeapon(x.dataset.weapon));x.addEventListener('pointerdown',e=>{e.stopPropagation();selectWeapon(x.dataset.weapon)})});
function startGame(){if(playing)return;menu.classList.add('hidden');settings.classList.add('hidden');hud.classList.remove('hidden');playing=true;dead=false;hp=20;bot.hp=20;document.querySelector('#status').textContent='FIGHT!';updateUI();try{canvas.requestPointerLock()}catch(e){}if(sb)startNet()}
document.querySelector('#playBtn').addEventListener('click',startGame);
document.querySelector('#playBtn').addEventListener('pointerup',startGame);
document.querySelector('#settingsBtn').addEventListener('click',()=>settings.classList.remove('hidden'));
document.querySelector('#closeSettings').addEventListener('click',()=>settings.classList.add('hidden'));
document.querySelector('#showHitboxes').onchange=e=>hitboxes=e.target.checked;document.querySelector('#particles').onchange=e=>particles=e.target.checked;
document.querySelector('#respawn').onclick=()=>{hp=20;bot.hp=20;dead=false;player.pos.set(0,1.8,8);death.classList.add('hidden');hud.classList.remove('hidden');playing=true;canvas.requestPointerLock?.()};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

let myId=Math.random().toString(36).slice(2),lastNet=0;
async function startNet(){if(!sb)return;channel=sb.channel('mcpvp-duel',{config:{broadcast:{self:false},presence:{key:myId}}});channel.on('broadcast',{event:'hit'},({payload})=>{if(payload.targetId!==myId)return;hp=Math.max(0,hp-(payload.damage||1));flashDamage();const kd=aimDir().multiplyScalar(-(payload.knock||5));player.vel.add(kd)}).on('broadcast',{event:'state'},({payload})=>{if(payload.id===myId)return;let r=remotes.get(payload.id);if(!r){r={mesh:playerMesh(0xb0b8c0)};scene.add(r.mesh);remotes.set(payload.id,r)}r.mesh.position.lerp(new THREE.Vector3(payload.x,0,payload.z),.55);r.mesh.rotation.y=payload.yaw||0;r.lastSeen=performance.now()}).on('presence',{event:'leave'},({left})=>left.forEach(id=>{const r=remotes.get(id);if(r){scene.remove(r.mesh);remotes.delete(id)}})).subscribe(async s=>{if(s==='SUBSCRIBED')await channel.track({id:myId})})}
setInterval(()=>{if(channel&&playing&&!dead)channel.send({type:'broadcast',event:'state',payload:{id:myId,x:player.pos.x,z:player.pos.z,yaw}})},50);

const commandBox=document.querySelector('#commandBox'),commandInput=document.querySelector('#commandInput'),commandLog=document.querySelector('#commandLog');
function command(msg){const a=msg.trim().toLowerCase().split(/\\s+/),c=a[0],v=a[1];if(!c)return;
 if(c==='help'){logCmd('Commands: /give <sword|mace|spear>, /weapon <name>, /heal, /speed <0.5-3>, /hitboxes, /bot');}
 else if(c==='give'||c==='weapon'){if(['sword','mace','spear','wind'].includes(v))selectWeapon(v);else logCmd('Unknown weapon');}
 else if(c==='heal'){hp=20;logCmd('Healed to 20 HP');}
 else if(c==='speed'){const n=Math.max(.5,Math.min(3,Number(v)||1));window.pvpSpeed=n;logCmd('Speed multiplier '+n);}
 else if(c==='hitboxes'){hitboxes=!hitboxes;document.querySelector('#showHitboxes').checked=hitboxes;logCmd('Hitboxes '+(hitboxes?'ON':'OFF'));}
 else if(c==='bot'){bot.hp=20;bot.pos.set((Math.random()-.5)*24,1,(Math.random()-.5)*24);logCmd('Bot reset');}
 else logCmd('Unknown command. Try /help');}
function logCmd(t){const d=document.createElement('div');d.textContent='> '+t;commandLog.appendChild(d);while(commandLog.children.length>5)commandLog.firstChild.remove();}
addEventListener('keydown',e=>{if(e.key==='/'&&!commandBox.classList.contains('hidden'))return;if(e.key==='/'&&playing){e.preventDefault();commandBox.classList.remove('hidden');commandInput.value='';commandInput.focus()}else if(e.key==='Escape'&&!commandBox.classList.contains('hidden')){commandBox.classList.add('hidden');commandInput.blur()}});
commandInput.addEventListener('keydown',e=>{if(e.key==='Enter'){command(commandInput.value);commandInput.value='';commandBox.classList.add('hidden');canvas.requestPointerLock?.()}if(e.key==='Escape'){commandBox.classList.add('hidden');commandInput.blur()}});
window.pvpSpeed=1;

setInterval(()=>{for(const [id,r] of remotes){if(r.lastSeen&&performance.now()-r.lastSeen>5000){scene.remove(r.mesh);remotes.delete(id)}}},1000);
