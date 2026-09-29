const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const {spawn}=require('child_process');
const FF='/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const [,,mode,a,b,out]=process.argv; const FPS=30;
(async()=>{
  const br=await chromium.launch();const pg=await br.newPage({viewport:{width:1920,height:1080}});
  await pg.goto('file://'+__dirname+'/anim.html?render');await pg.evaluate(()=>window.ready);
  if(mode==='stills'){for(const t of a.split(',')){await pg.evaluate(t=>render(t),+t);
      await pg.locator('#c').screenshot({path:`still_${t}.png`});} await br.close();return;}
  const f0=+a,f1=+b;
  const ff=spawn(FF,['-y','-f','image2pipe','-framerate',''+FPS,'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',out],{stdio:['pipe','ignore','inherit']});
  for(let f=f0;f<f1;f++){
    const d=await pg.evaluate(t=>{render(t);return document.getElementById('c').toDataURL('image/jpeg',.95)},f/FPS);
    const buf=Buffer.from(d.split(',')[1],'base64');
    if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
  }
  ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();
})();
