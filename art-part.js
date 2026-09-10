// UI ART — independent procedural scenery, fighters, and portraits. No assets required.
const Art = (() => {
  const INK = '#101622';
  const poly = (c, pts, fill, stroke = null, line = 2) => {
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.lineJoin = 'miter'; c.stroke(); }
  };
  const box = (c, x, y, w, h, fill) => { c.fillStyle = fill; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const line = (c, x, y, x2, y2, color, width = 1) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
  };
  const shade = (hex, amount) => {
    if (!/^#[\da-f]{6}$/i.test(hex || '')) return hex || '#aaaaaa';
    const n = parseInt(hex.slice(1), 16);
    return '#' + [n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, v + amount)).toString(16).padStart(2, '0')).join('');
  };
  const pixelLabel = (c, text, x, y, size, color, align = 'left') => {
    c.textAlign = align; c.textBaseline = 'alphabetic'; c.font = `900 ${size}px "Courier New", monospace`; c.fillStyle = color; c.fillText(text, x, y);
  };
  const blockMoon = c => {
    poly(c, [[739,42],[759,42],[759,47],[771,47],[771,57],[777,57],[777,83],[771,83],[771,95],[759,95],[759,100],[736,100],[736,94],[724,94],[724,83],[718,83],[718,60],[724,60],[724,49],[739,49]], '#b4c9c9');
    box(c,736,54,10,8,'#829ca7'); box(c,725,69,9,15,'#93abb1'); box(c,750,83,16,7,'#93abb1'); box(c,757,60,7,6,'#d2dcd1');
  };
  // Letreiro do telhado: alterna símbolo RD, MANI BATTLE e jargões corporativos.
  // Entra "digitando", sai piscando como neon. Edite MARQUEE para trocar as frases.
  const MARQUEE = [
    { logo: true }, { linhas: ['MANI', 'BATTLE'], cores: ['#ffd21e', '#ff7a1a'] },
    { linhas: ['JÁ ABRIU', 'TICKET?'] }, { linhas: ['ISSO NÃO', 'É COMIGO'] },
    { logo: true }, { linhas: ['NÃO TEM', 'COMO'] }, { linhas: ['NO MEU PC', 'FUNCIONA'] },
    { linhas: ['MANI', 'BATTLE'], cores: ['#ffd21e', '#ff7a1a'] }, { linhas: ['AMBIENTE TÁ', 'ATUALIZADO?'] },
    { logo: true }, { linhas: ['É UMA MUDANÇA', 'SIMPLES'] }, { linhas: ['DEPLOY NA', 'SEXTA 18H'] },
    { linhas: ['MANI', 'BATTLE'], cores: ['#ffd21e', '#ff7a1a'] }, { linhas: ['BUG SÓ ACONTECE', 'COM O TADEUS'] },
    { logo: true }, { linhas: ['FÓRMULA CERTA', 'CAIU?'] }
  ];
  const diamondCell = (r, cc) => { // símbolo RD: losango 15x15, cruz vazia, cantos internos recortados
    if (r === 7 || cc === 7) return false;
    const rr = r < 7 ? r : 14 - r, c2 = cc < 7 ? cc : 14 - cc;
    if (c2 < 6 - rr) return false;
    return !((rr === 6 && c2 >= 5) || (c2 === 6 && rr >= 5));
  };
  function marquee(c, time) {
    const DUR = 3.4, slot = Math.floor(time / DUR) % MARQUEE.length, local = (time % DUR) / DUR, item = MARQUEE[slot];
    const reveal = Math.min(1, local / .2), leaving = local > .88;
    const flicker = (Math.sin(time * 2.1) > -.97 ? 1 : .65) * (leaving ? (Math.floor(time * 28) % 2 ? .25 : 1) : 1);
    c.save(); c.globalAlpha = flicker;
    if (item.logo) {
      const pulse = 5 * (1 + Math.sin(time * 5) * .06) * Math.min(1, local / .25 * 1.4), cx = 484, cy = 175;
      for (let r = 0; r < 15; r++) for (let q = 0; q < 15; q++) if (diamondCell(r, q)) box(c, cx + (q - 7.5) * pulse, cy + (r - 7.5) * pulse, pulse + .5, pulse + .5, '#e8394a');
      c.globalAlpha = flicker * .35; for (let r = 0; r < 15; r++) for (let q = 0; q < 15; q++) if (diamondCell(r, q)) box(c, cx + (q - 7.5) * pulse - 1, cy + (r - 7.5) * pulse - 1, pulse + 2.5, pulse + 2.5, '#ff5a6a');
    } else {
      const cores = item.cores || ['#ffd21e', '#dae6c0'];
      item.linhas.forEach((text, i) => {
        const shown = text.slice(0, Math.ceil(text.length * reveal)), cursor = reveal < 1 && Math.floor(time * 16) % 2 ? '_' : '';
        const size = Math.min(43, Math.floor(290 / (0.62 * Math.max(4, text.length))));
        pixelLabel(c, shown + cursor, 484, i === 0 ? 172 : 210, size, cores[i] || '#ffffff', 'center');
      });
    }
    c.restore();
  }
  function stage(c, time = 0, mode = 'fight') {
    c.save(); c.imageSmoothingEnabled = false;
    const sky = c.createLinearGradient(0,0,0,440); sky.addColorStop(0,'#0b1220'); sky.addColorStop(.62,'#192735'); sky.addColorStop(1,'#273744');
    box(c,0,0,960,540,sky); blockMoon(c);
    for (let i = 0; i < 31; i++) {
      const x = (i * 137 + 21) % 960, y = (i * 43 + 30) % 170;
      box(c,x,y,i % 7 === 0 ? 3 : 2,2,i % 3 ? '#456170' : '#96a7ab');
    }
    // Layered wind-blown clouds and distant city silhouettes.
    for (let i=0;i<6;i++) {
      const x = ((i*207 + time*1.4) % 1160)-160, y=62+(i%3)*41;
      box(c,x,y,143,8,'#202c3b'); box(c,x+27,y-7,73,7,'#202c3b'); box(c,x+96,y+8,97,5,'#202c3b');
    }
    for (let i = 0; i < 31; i++) {
      const x = i * 34 - 15, w = 22 + (i * 19) % 27, h = 34 + (i * 37) % 113;
      box(c,x,316-h,w,h,'#1d2d3b'); box(c,x+5,308-h,w-11,10,'#1d2d3b');
      if(i%4===0) line(c,x+w/2,311-h,x+w/2,283-h,'#2f4553',2);
      for(let yy=329-h;yy<305;yy+=12) for(let xx=x+6;xx<x+w-4;xx+=8)
        if((Math.round(xx)+yy+i)%7<3) box(c,xx,yy,3,4,i%5===0?'#786e52':'#3b5662');
    }
    const buildings = [[-20,168,111,213],[82,220,93,156],[178,191,98,181],[694,196,111,181],[803,148,113,231],[914,206,89,173]];
    buildings.forEach(([x,y,w,h],i)=>{
      box(c,x,y,w,h,'#14202d'); box(c,x+6,y-7,w-12,7,'#2c3e49'); box(c,x+w-12,y,12,h,'#0e1a27');
      for(let yy=y+15;yy<y+h-9;yy+=17) for(let xx=x+11;xx<x+w-18;xx+=15) {
        const on=((xx*7+yy*3+i*5)%11)>4;
        box(c,xx,yy,6,7,on?(i%2?'#657a70':'#355566'):'#202e3b');
        if(on) box(c,xx,yy+1,6,1,'#93a482');
      }
      for(let yy=y+8;yy<y+h;yy+=43) box(c,x+1,yy,w-13,2,'#2a3945');
    });
    // Far-left service tower and illuminated vertical sign.
    box(c,108,182,22,123,'#121d29'); box(c,111,186,14,114,'#ff674b');
    box(c,114,191,8,106,'#261e27'); ['夜','更','街'].forEach((s,i)=>pixelLabel(c,s,118,217+i*32,18,'#ff9274','center'));
    box(c,852,171,36,83,'#0b1927'); box(c,855,174,30,77,'#204552');
    pixelLabel(c,'24',870,199,18,'#74dbe8','center'); pixelLabel(c,'H',870,224,18,'#74dbe8','center');
    box(c,857,233,26,3,'#74dbe8'); box(c,857,241,26,3,'#74dbe8');
    // Central rooftop structure. A lit marquee gives the arena its visual anchor.
    box(c,282,245,402,131,'#18212e'); box(c,279,243,408,7,'#44505a'); box(c,294,258,374,112,'#242b35');
    for(let yy=272;yy<363;yy+=23) { box(c,294,yy,374,2,'#161f2b'); for(let xx=301+(yy%2)*14;xx<668;xx+=51) box(c,xx,yy-20,2,20,'#1a222e'); }
    box(c,319,280,67,91,'#151d27'); box(c,325,286,55,79,'#273744'); box(c,330,293,4,64,'#41505a'); box(c,369,327,4,7,'#b6c1ae');
    box(c,611,283,36,56,'#101b26'); for(let yy=287;yy<335;yy+=7) box(c,615,yy,29,2,'#3e4c55');
    box(c,350,146,10,105,'#37434d'); box(c,609,146,10,105,'#37434d');
    line(c,355,181,614,246,'#32434f',5); line(c,614,181,355,246,'#32434f',5);
    box(c,316,113,337,124,'#0b121b'); box(c,320,117,329,116,'#5a666b'); box(c,325,122,319,106,'#141f2b');
    box(c,330,127,309,96,'#1b2a33'); box(c,334,130,301,3,'#d7ff3f'); box(c,334,217,301,3,'#d7ff3f');
    marquee(c, time);
    for(let x=339;x<638;x+=49) box(c,x,225,4,3,'#66767b');
    box(c,417,248,137,7,'#0c1722'); box(c,424,250,122,2,'#ff674b');
    // Suspended power lines, railings, warning lamps and ducts.
    c.strokeStyle='#0d1520';c.lineWidth=2;c.beginPath();c.moveTo(0,129);c.quadraticCurveTo(140,217,294,191);c.stroke();
    c.beginPath();c.moveTo(650,181);c.quadraticCurveTo(833,206,960,139);c.stroke();
    box(c,0,374,960,9,'#526168'); box(c,0,383,960,17,'#1b2b35'); box(c,0,399,960,8,'#0e1b29');
    for(let x=20;x<960;x+=67) { box(c,x,333,5,47,'#101c27'); box(c,x+1,333,1,42,'#54717b'); }
    box(c,0,331,960,5,'#233b49'); box(c,0,351,960,3,'#203642');
    for(let x=23;x<960;x+=268) { box(c,x,328,8,4,'#141f2c'); box(c,x+2,328,4,2,'#ff9274'); }
    box(c,-4,358,129,66,'#1b2a34'); box(c,0,351,130,9,'#526168'); box(c,8,365,112,46,'#31434c');
    for(let x=14;x<120;x+=8) box(c,x,368,3,36,'#172732');
    box(c,836,353,101,71,'#283943'); box(c,831,348,112,8,'#536068'); box(c,849,361,74,49,'#172732');
    for(let y=367;y<407;y+=7) box(c,854,y,63,3,'#42565e'); box(c,913,337,18,13,'#3b4e59');
    // Arena floor, perspective seams and reflected strips of neon.
    box(c,0,422,960,118,'#25333e'); box(c,0,422,960,4,'#758388'); box(c,0,426,960,11,'#33464f'); box(c,0,437,960,3,'#101c2a');
    for(let x=-600;x<1500;x+=150) line(c,480+(x-480)*.61,441,x,540,'#142633',2);
    [454,478,511].forEach(y=>{box(c,0,y,960,2,'#142633');box(c,0,y+2,960,1,'#3b4952');});
    for(let i=0;i<18;i++) { const x=(i*83+27)%960,y=448+(i*37)%87;box(c,x,y,24+(i%5)*9,2,i%3?'#33444e':'#415254'); }
    poly(c,[[90,441],[125,441],[72,540],[17,540]],'#373c35'); poly(c,[[780,441],[797,441],[875,540],[843,540]],'#263d45');
    box(c,0,521,960,19,'#182630');
    for(let i=0;i<24;i++) poly(c,[[i*45,529],[i*45+17,529],[i*45+9,540],[i*45-8,540]],'#586044');
    box(c,0,519,960,3,'#69725b');
    // Soft edge falloff still leaves the bright HUD and silhouettes crisp.
    const edge=c.createLinearGradient(0,0,960,0);edge.addColorStop(0,'rgba(5,10,18,.3)');edge.addColorStop(.2,'rgba(5,10,18,0)');edge.addColorStop(.8,'rgba(5,10,18,0)');edge.addColorStop(1,'rgba(5,10,18,.3)');box(c,0,0,960,540,edge);
    if(mode==='home'){box(c,0,0,960,540,'rgba(7,14,22,.1)');}
    c.restore();
  }
  function limb(c,a,b,width,color,accent,glove=false) {
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,px=-dy/len*width/2,py=dx/len*width/2;
    poly(c,[[a[0]+px,a[1]+py],[b[0]+px,b[1]+py],[b[0]-px,b[1]-py],[a[0]-px,a[1]-py]],color,INK,3);
    line(c,a[0]+px*.55,a[1]+py*.55,b[0]+px*.55,b[1]+py*.55,accent,Math.max(2,width*.23));
    if(glove) poly(c,[[b[0]-10,b[1]-9],[b[0]+7,b[1]-11],[b[0]+13,b[1]-5],[b[0]+12,b[1]+7],[b[0]-5,b[1]+10],[b[0]-12,b[1]+4]],color,INK,3);
  }
  function shoe(c,p,color,forward=1){
    poly(c,[[p[0]-9,p[1]-9],[p[0]+9,p[1]-9],[p[0]+10+forward*8,p[1]-4],[p[0]+10+forward*10,p[1]+2],[p[0]-12,p[1]+2]],color,INK,3);
    line(c,p[0]-10,p[1],p[0]+10+forward*8,p[1],'#a7b4af',3);
  }
  function fighter(c,f,time=0,options={}) {
    const conf=f.config||f.character||{},p=conf.palette||{},primary=p.primary||'#d7ff3f',secondary=p.secondary||'#26343f',skin=p.skin||'#d69972',hair=p.hair||'#25212d';
    const style=conf.style||'striker',state=f.state||'idle',st=f.stateTime||0,sc=options.scale||1,face=f.facing===-1?-1:1;
    const thick=style==='tank'?1.2:style==='runner'?.91:style==='striker'?.94:1;
    const bob=state==='idle'?Math.sin(time*4.5)*2:state==='walk'?Math.sin(time*14)*3:0;
    c.save();c.globalAlpha=options.alpha==null?1:options.alpha;c.translate(f.x||0,f.y||0);c.scale(sc*face,sc);c.imageSmoothingEnabled=false;
    if(!options.noShadow){c.save();c.scale(1,.24);c.fillStyle='rgba(3,9,16,.38)';c.beginPath();c.ellipse(0,9,46*thick,19,0,0,Math.PI*2);c.fill();c.restore();}
    if(state==='ko') {c.translate(-24,-16);c.rotate(-Math.PI*.47);}
    c.translate(0,bob);c.scale(thick,1);
    const crouch=!!f.crouching||state==='crouch';if(crouch)c.translate(-3,36);
    const move=f.attack?.move,elapsed=f.attack?.elapsed??st;
    const extension=(startup,active,recovery)=>{
      if(elapsed<startup)return Math.max(0,elapsed/Math.max(.001,startup));
      if(elapsed<startup+active)return 1;
      return Math.max(0,1-(elapsed-startup-active)/Math.max(.001,recovery));
    };
    const ext=state==='punch'?extension(move?.startup??.1,move?.active??.09,move?.recovery??.18):0;
    const kick=state==='kick'?extension(move?.startup??.2,move?.active??.12,move?.recovery??.3):0;
    const walk=state==='walk'?Math.sin(time*13):0;
    const airborne=state==='jump'||f.grounded===false;
    const hurt=state==='hit';
    if(hurt)c.transform(1,0,-.11,1,-10,0);
    const backHip=[-13,-76],frontHip=[10,-77];
    let backKnee=[-23-walk*13,-41],backFoot=[-31-walk*22,-4],frontKnee=[20+walk*11,-38],frontFoot=[29+walk*22,-4];
    if(airborne){backKnee=[-29,-61];backFoot=[-43,-31];frontKnee=[29,-68];frontFoot=[31,-36];}
    if(crouch){backKnee=[-31,-50];backFoot=[-32,-39];frontKnee=[36,-50];frontFoot=[43,-39];}
    if(kick){frontKnee=[23+kick*26,-43-kick*47];frontFoot=[27+kick*91,-5-kick*92];backKnee=[-24,-40];backFoot=[-37,-4];}
    const pants=style==='karate'?'#dae2d5':style==='runner'?secondary:style==='shadow'?'#202d3c':secondary;
    const pantsLight=shade(pants,24),darkPants=shade(pants,-17);
    limb(c,backHip,backKnee,22,darkPants,pants);limb(c,backKnee,backFoot,18,darkPants,pants);
    shoe(c,backFoot,style==='karate'?skin:'#18222f');
    limb(c,frontHip,frontKnee,25,pants,pantsLight);limb(c,frontKnee,frontFoot,20,pants,pantsLight);
    if(style!=='karate'){line(c,frontHip[0]+8,frontHip[1]+7,frontKnee[0]+7,frontKnee[1]-3,primary,4);box(c,frontKnee[0]-8,frontKnee[1]-5,16,8,darkPants);}
    shoe(c,frontFoot,style==='karate'?skin:style==='runner'?primary:'#1a222d');
    // Far arm rests high in a fighting guard; its elbow gives every pose a clear silhouette.
    const backShoulder=[-17,-128],frontShoulder=[17,-130];
    let backElbow=[-34,-107],backHand=[-15,-134],frontElbow=[33,-108],frontHand=[49,-133];
    if(state==='block'){backElbow=[-8,-117];backHand=[22,-155];frontElbow=[29,-115];frontHand=[34,-158];}
    if(ext){frontElbow=[33+ext*19,-108-ext*21];frontHand=[49+ext*31,-133+ext];backHand=[-15,-125];}
    if(kick){frontElbow=[24,-113];frontHand=[44,-125];backElbow=[-41,-121];backHand=[-45,-145];}
    if(airborne&&!kick){backElbow=[-38,-130];backHand=[-28,-155];frontElbow=[37,-116];frontHand=[48,-140];}
    if(hurt||state==='ko'){backElbow=[-40,-126];backHand=[-57,-110];frontElbow=[31,-113];frontHand=[48,-98];}
    const sleeves=['runner','shadow','tank','karate'].includes(style),gloves=style==='boxer';
    limb(c,backShoulder,backElbow,17,sleeves?shade(primary,-27):shade(skin,-29),sleeves?primary:skin);
    limb(c,backElbow,backHand,14,shade(skin,-20),skin);limb(c,backHand,backHand,15,gloves?primary:shade(skin,-10),skin,true);
    // Jacket, gi or singlet, with angular cloth shading and broad shoulder structure.
    const torso=style==='karate'?'#e2e8d9':style==='brawler'?'#46566a':primary;
    poly(c,[[-19,-138],[2,-143],[22,-136],[26,-110],[18,-81],[-18,-81],[-25,-111]],torso,INK,3);
    poly(c,[[-19,-135],[-10,-129],[-9,-92],[-17,-83],[-23,-111]],shade(torso,-34));
    poly(c,[[15,-131],[22,-132],[24,-112],[16,-89],[8,-92],[15,-113]],shade(torso,-19));
    poly(c,[[-13,-137],[-2,-140],[9,-139],[15,-130],[5,-111],[-3,-117]],skin,INK,2);
    if(style==='karate'){
      poly(c,[[-20,-134],[-10,-139],[13,-103],[4,-99]],'#fafced',INK,2);poly(c,[[19,-135],[10,-139],[-12,-105],[-5,-98]],'#b6c9c2',INK,2);
      box(c,-20,-88,39,10,secondary);poly(c,[[3,-83],[12,-83],[17,-52],[8,-56]],secondary,INK,2);box(c,-8,-85,15,10,primary);
    }else if(style==='runner'||style==='tank'){
      poly(c,[[-10,-138],[-3,-128],[-4,-85],[-14,-84]],secondary);poly(c,[[12,-137],[4,-126],[4,-86],[13,-84]],secondary);
      line(c,1,-127,1,-84,'#d3d4ba',2);box(c,12,-115,9,3,secondary);box(c,-21,-115,8,3,primary);box(c,6,-99,4,3,'#d5e0c3');
      if(style==='tank'){box(c,-22,-138,13,6,'#b9c0ad');box(c,13,-135,13,6,'#b9c0ad');box(c,-13,-88,27,8,'#242631');}
    }else if(style==='boxer'){
      poly(c,[[-12,-137],[-7,-132],[-4,-112],[6,-106],[17,-133],[21,-132],[14,-98],[-9,-99]],secondary);
      box(c,-19,-87,39,10,'#e3e3cc');box(c,-6,-86,13,8,primary);box(c,-3,-124,9,8,primary);
    }else if(style==='shadow'){
      poly(c,[[-24,-138],[-13,-146],[15,-144],[24,-132],[17,-124],[-7,-127]],secondary,INK,2);
      poly(c,[[-16,-133],[-32,-128],[-50-Math.sin(time*6)*5,-99],[-23,-112]],primary,INK,2);line(c,-13,-116,15,-95,secondary,6);
      box(c,-19,-87,37,7,'#8a968b');
    }else if(style==='striker'){
      box(c,-17,-93,35,13,'#23313b');box(c,-5,-92,10,9,'#c9d6c3');poly(c,[[15,-83],[21,-82],[30,-55],[18,-62]],primary,INK,2);
      line(c,-15,-111,17,-111,secondary,5);box(c,-7,-109,13,5,'#cbdcc2');
    }else{
      poly(c,[[-15,-139],[-7,-137],[-4,-88],[-16,-91]],'#657181');poly(c,[[14,-137],[7,-131],[6,-88],[18,-93]],'#657181');
      box(c,-20,-85,41,8,'#191f2a');box(c,0,-85,10,7,'#b9bbb0');box(c,-16,-119,8,5,'#c3cec1');
    }
    // Neck, ears, face planes, brows and individual hair silhouettes.
    box(c,-4,-151,16,14,shade(skin,-20));box(c,-1,-151,10,10,skin);
    const headShift=hurt?-4:0;c.save();c.translate(headShift,0);
    if(style==='striker')poly(c,[[-17,-169],[-25,-170],[-33,-150],[-43,-139],[-31,-141],[-20,-155],[-12,-159]],hair,INK,3);
    poly(c,[[-13,-168],[-5,-178],[10,-179],[19,-171],[21,-160],[25,-154],[20,-151],[17,-141],[8,-137],[-5,-141],[-13,-151]],skin,INK,3);
    poly(c,[[-11,-164],[-5,-161],[-4,-145],[8,-139],[-4,-141],[-12,-152]],shade(skin,-31));
    box(c,-14,-157,6,10,skin);box(c,-12,-155,2,6,shade(skin,-43));
    poly(c,[[10,-175],[16,-168],[16,-159],[22,-155],[18,-151],[10,-152]],shade(skin,18));
    if(style==='boxer'){
      poly(c,[[-14,-164],[-14,-174],[-6,-181],[10,-182],[19,-176],[19,-169],[2,-173],[-8,-165]],hair,INK,3);
      poly(c,[[-5,-147],[7,-144],[18,-147],[16,-140],[6,-137],[-4,-141]],hair);box(c,9,-147,8,2,skin);
    }else if(style==='karate'){
      poly(c,[[-14,-164],[-17,-175],[-8,-178],[-6,-187],[2,-180],[12,-185],[13,-178],[21,-175],[18,-165],[4,-170],[-8,-161]],hair,INK,3);
      box(c,-13,-165,32,5,primary);poly(c,[[-12,-165],[-20,-165],[-29,-155],[-15,-159]],primary,INK,2);
    }else if(style==='runner'){
      poly(c,[[-13,-158],[-20,-171],[-11,-174],[-14,-181],[0,-179],[7,-185],[12,-179],[22,-178],[17,-171],[1,-168],[-6,-158]],hair,INK,3);
      box(c,-11,-158,7,7,primary);box(c,-7,-158,3,9,'#dbe5cf');
    }else if(style==='tank'){
      poly(c,[[-13,-164],[-12,-174],[-5,-179],[12,-178],[17,-172],[9,-170],[-6,-170],[-8,-155]],hair,INK,3);
      poly(c,[[-5,-146],[2,-144],[5,-147],[19,-147],[17,-139],[6,-135],[-3,-139]],hair);box(c,8,-146,8,2,skin);
      line(c,11,-158,17,-153,shade(skin,-59),2);
    }else if(style==='shadow'){
      poly(c,[[-13,-160],[-17,-172],[-8,-182],[9,-183],[23,-176],[16,-168],[2,-165],[-5,-154]],hair,INK,3);
      poly(c,[[-3,-155],[21,-154],[18,-140],[6,-137],[-4,-143]],secondary,INK,2);line(c,2,-149,17,-148,primary,2);
    }else if(style==='striker'){
      poly(c,[[-14,-162],[-18,-172],[-10,-181],[4,-183],[16,-178],[22,-169],[11,-169],[2,-176],[-3,-163],[-10,-157]],hair,INK,3);
      box(c,-16,-169,8,5,primary);line(c,1,-177,12,-173,shade(hair,28),3);box(c,-11,-148,3,5,primary);
    }else{
      poly(c,[[-14,-164],[-17,-176],[-11,-185],[-4,-182],[2,-188],[8,-182],[16,-184],[21,-173],[14,-166],[1,-174],[-5,-164]],hair,INK,3);
      box(c,-14,-163,33,4,primary);poly(c,[[-11,-163],[-25,-161],[-34,-152],[-17,-155]],primary,INK,2);
    }
    line(c,8,-160,17,-162,INK,3);box(c,12,-158,6,3,'#f0eee0');box(c,15,-158,3,3,INK);
    if(hurt||state==='ko'){line(c,11,-158,17,-154,INK,2);line(c,11,-154,17,-158,INK,2);}
    if(style!=='shadow'){box(c,12,-146,7,2,'#704a42');box(c,15,-146,4,1,'#ead5b1');}
    c.restore();
    // Foreground arm and wrapped knuckles are drawn last for readable action poses.
    limb(c,frontShoulder,frontElbow,sleeves?20:18,sleeves?primary:skin,sleeves?shade(primary,22):shade(skin,21));
    limb(c,frontElbow,frontHand,15,skin,shade(skin,21));
    const wrist=[frontHand[0]-(frontHand[0]-frontElbow[0])*.14,frontHand[1]-(frontHand[1]-frontElbow[1])*.14];
    limb(c,wrist,frontHand,16,style==='shadow'?primary:'#cfd6c5','#f2f0d9');
    limb(c,frontHand,frontHand,16,gloves?primary:skin,shade(skin,18),true);
    box(c,frontHand[0]+3,frontHand[1]-6,7,3,gloves?shade(primary,35):shade(skin,30));
    if(gloves)line(c,frontHand[0]-8,frontHand[1]+4,frontHand[0]+7,frontHand[1]+4,secondary,3);
    c.restore();
  }
  function portrait(c,conf,width,height,time=0) {
    c.save();c.beginPath();c.rect(0,0,width,height);c.clip();
    const primary=conf.palette?.primary||'#d7ff3f';
    box(c,0,0,width,height,'#1a2832');
    poly(c,[[width*.4,0],[width,0],[width,height],[0,height]],shade(primary,-92));
    for(let y=0;y<height;y+=6)box(c,0,y,width,1,'rgba(8,17,27,.18)');
    poly(c,[[0,height],[width*.5,0],[width*.59,0],[width*.1,height]],'rgba(228,242,209,.12)');
    const s=Math.max(width/91,height/106);
    fighter(c,{config:conf,x:width*.45,y:height*.43+160*s,facing:1,state:'idle',stateTime:0},time,{scale:s,noShadow:true});
    box(c,0,height-3,width,3,primary);c.restore();
  }
  // Símbolo RD (losango de 4 triângulos) em qualquer tamanho.
  function rdSymbol(c, x, y, s, color = '#e8394a') {
    const g = Math.max(1, s * .16);
    c.save(); c.translate(x, y); c.fillStyle = color;
    [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([sx,sy]) => { c.beginPath(); c.moveTo(sx*g, sy*g); c.lineTo(sx*g, sy*s); c.lineTo(sx*s, sy*g); c.closePath(); c.fill(); });
    c.restore();
  }
  // LABORATÓRIO DE MANIPULAÇÃO — arena branca: azulejos, fluorescentes, bancada com vidraria
  // borbulhando, estantes de frascos, capela de exaustão, monitor, piso claro.
  function lab(c, time = 0) {
    c.save(); c.imageSmoothingEnabled = false;
    // parede azulejada
    box(c,0,0,960,540,'#e9eef2');
    for (let y = 0; y < 300; y += 30) for (let x = 0; x < 960; x += 40) { box(c,x,y,40,30,(x/40+y/30)%2 ? '#e2e8ee' : '#eef3f7'); box(c,x,y,40,1,'#cfd8e0'); box(c,x,y,1,30,'#cfd8e0'); }
    box(c,0,296,960,10,'#0d5fb5'); box(c,0,306,960,3,'#e8394a'); // faixa azul + linha vermelha RD
    // fluorescentes com brilho
    for (let x = 60; x < 960; x += 300) {
      const flick = Math.sin(time*7 + x) > -.985 ? 1 : .7;
      const gl = c.createRadialGradient(x+90,20,10,x+90,20,150); gl.addColorStop(0,`rgba(255,255,255,${.55*flick})`); gl.addColorStop(1,'rgba(255,255,255,0)'); box(c,x-70,0,320,180,gl);
      box(c,x,8,180,10,'#b9c4cc'); box(c,x+4,12,172,6,'#ffffff'); box(c,x+4,18,172,2,'#dfe7ec');
    }
    // símbolo RD e letreiro na parede
    rdSymbol(c, 480, 150, 58); pixelLabel(c,'LABORATÓRIO DE MANIPULAÇÃO',480,244,17,'#0d5fb5','center');
    box(c,330,254,300,2,'#0d5fb5');
    // porta à esquerda e janela da capela à direita
    box(c,40,120,90,186,'#c9d3da'); box(c,46,126,78,174,'#dfe7ec'); box(c,52,132,66,70,'#b8dff0'); box(c,110,220,6,20,'#6f7d88');
    box(c,760,110,170,196,'#9fb2bf'); box(c,768,118,154,150,'#cdeff8'); box(c,768,118,154,3,'#ffffff');
    for (let i = 0; i < 4; i++) { box(c,790+i*36,200,22,60,['#e8394a','#39d27a','#ffd21e','#3fa0ff'][i]); box(c,790+i*36,196,22,6,'#f4f7f9'); }
    box(c,760,268,170,38,'#8493a0'); pixelLabel(c,'FIFO+',845,292,12,'#ffffff','center');
    // estante de frascos à esquerda
    box(c,150,130,190,176,'#c9d3da'); for (let s = 0; s < 3; s++) { box(c,154,160+s*48,182,4,'#8493a0'); for (let i = 0; i < 7; i++) { const bx = 160+i*25; box(c,bx,140+s*48,18,20,'#ffffff'); box(c,bx+2,136+s*48,14,5,i%2?'#e8394a':'#0d5fb5'); box(c,bx+4,148+s*48,10,6,'#dfe7ec'); } }
    // sombras projetadas na parede (estante, capela, porta, monitor)
    box(c,158,138,190,176,'rgba(20,30,45,.16)'); box(c,768,118,170,196,'rgba(20,30,45,.14)'); box(c,48,128,90,186,'rgba(20,30,45,.12)'); box(c,668,290,62,42,'rgba(20,30,45,.2)');
    // bancada com vidraria borbulhando
    box(c,0,330,960,8,'#b9c4cc'); box(c,0,338,960,84,'#f4f7f9'); for (let x = 0; x < 960; x += 120) { box(c,x+8,346,104,68,'#dde5eb'); box(c,x+52,372,16,4,'#8493a0'); }
    box(c,0,338,960,10,'rgba(20,30,45,.18)'); // sombra do tampo sobre os armários
    for (let i = 0; i < 6; i++) { c.fillStyle='rgba(20,30,45,.22)'; c.beginPath(); c.ellipse(96+i*150,331,24,4,0,0,Math.PI*2); c.fill(); } // sombras da vidraria
    const liquids = ['#e8394a','#3fa0ff','#39d27a','#ffd21e','#c47bff','#ff9d1e'];
    for (let i = 0; i < 6; i++) {
      const bx = 90 + i*150, col = liquids[i], lvl = 14 + Math.sin(time*1.4+i)*2;
      if (i % 2 === 0) { // erlenmeyer
        poly(c,[[bx-6,290],[bx+6,290],[bx+6,304],[bx+20,330],[bx-20,330]],'#ffffffcc','#9fb2bf',2);
        poly(c,[[bx+6-lvl*.3,330-lvl],[bx+20,330],[bx-20,330],[bx-6+lvl*.3,330-lvl]],col);
      } else { // béquer
        box(c,bx-14,296,28,34,'#ffffffcc'); c.strokeStyle='#9fb2bf'; c.lineWidth=2; c.strokeRect(bx-14,296,28,34); box(c,bx-13,330-lvl,26,lvl,col);
      }
      for (let b = 0; b < 3; b++) { const by = 328 - ((time*40 + b*11 + i*7) % 24); box(c,bx-8+b*7,by,3,3,'#ffffffaa'); }
    }
    // suporte de tubos, balança e monitor
    box(c,400,310,60,20,'#8493a0'); for (let i = 0; i < 5; i++) box(c,404+i*11,300,6,28,liquids[i]);
    box(c,540,314,50,16,'#6f7d88'); box(c,548,306,34,8,'#dfe7ec'); pixelLabel(c,'0.00g',565,326,9,'#39d27a','center');
    box(c,660,282,62,42,'#2a2f3a'); box(c,664,286,54,32,Math.floor(time*2)%2?'#0d5fb5':'#1d7be0'); pixelLabel(c,'RD',691,306,12,'#ffffff','center'); box(c,684,324,14,8,'#6f7d88');
    // placas das etapas (penduradas acima da bancada)
    const placa = (x, w, txt) => {
      box(c,x+w/2-1,240,2,20,'#8493a0'); box(c,x+8,240,2,20,'#8493a0'); box(c,x+w-10,240,2,20,'#8493a0');
      box(c,x+3,263,w,22,'rgba(0,0,0,.25)'); box(c,x,260,w,22,'#ffffff'); box(c,x,260,w,3,'#0d5fb5'); box(c,x,279,w,3,'#0d5fb5');
      pixelLabel(c,txt,x+w/2,276,10,'#0d5fb5','center');
    };
    placa(100,110,'ENVASE'); placa(500,120,'PESAGEM'); placa(628,150,'CONFERÊNCIA FINAL');
    // piso claro com rejunte em perspectiva e faixa de segurança
    box(c,0,422,960,118,'#cfd8e0'); box(c,0,422,960,4,'#ffffff'); box(c,0,426,960,10,'#b9c4cc');
    for (let x=-600;x<1500;x+=150) line(c,480+(x-480)*.61,441,x,540,'#b0bcc6',2);
    [454,478,511].forEach(y=>{box(c,0,y,960,2,'#b0bcc6');});
    for (let x = 0; x < 960; x += 40) box(c,x,436,20,4,'#ffd21e');
    const refl=c.createLinearGradient(0,436,0,540); refl.addColorStop(0,'rgba(255,255,255,.35)'); refl.addColorStop(1,'rgba(255,255,255,0)'); box(c,0,436,960,104,refl);
    // sombra da bancada no chão e escurecimento do rodapé da parede
    const under=c.createLinearGradient(0,422,0,470); under.addColorStop(0,'rgba(20,30,45,.35)'); under.addColorStop(1,'rgba(20,30,45,0)'); box(c,0,422,960,48,under);
    const wallShade=c.createLinearGradient(0,180,0,330); wallShade.addColorStop(0,'rgba(20,30,45,0)'); wallShade.addColorStop(1,'rgba(20,30,45,.16)'); box(c,0,180,960,150,wallShade);
    // vinheta mais forte + cantos
    const edge=c.createLinearGradient(0,0,960,0); edge.addColorStop(0,'rgba(15,22,32,.42)'); edge.addColorStop(.22,'rgba(15,22,32,0)'); edge.addColorStop(.78,'rgba(15,22,32,0)'); edge.addColorStop(1,'rgba(15,22,32,.42)'); box(c,0,0,960,540,edge);
    const vign=c.createRadialGradient(480,300,260,480,300,640); vign.addColorStop(0,'rgba(10,16,26,0)'); vign.addColorStop(1,'rgba(10,16,26,.38)'); box(c,0,0,960,540,vign);
    c.restore();
  }
  const stages = {
    rooftop: { nome: 'ROOFTOP RD', sub: 'SÃO PAULO · 23:48', draw: stage },
    lab: { nome: 'LABORATÓRIO', sub: 'MANIPULAÇÃO · RD', draw: (c, t) => lab(c, t) }
  };
  return {stage,lab,stages,rdSymbol,fighter,portrait};
})();
