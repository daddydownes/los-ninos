import {createServer,request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.LOS_NINOS_PREVIEW_PORT||8796);
const upstreamPort=Number(process.env.LOS_NINOS_FILM_PORT||8793);
if(![port,upstreamPort].every(n=>Number.isInteger(n)&&n>=1024&&n<=65535))throw new Error('Invalid preview port.');
const mime={'.css':'text/css','.js':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.woff2':'font/woff2','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    let file=null;
    if(url.pathname==='/ideas'){res.writeHead(302,{Location:'/ideas/'});res.end();return;}
    if(url.pathname==='/studies'){res.writeHead(302,{Location:'/studies/'});res.end();return;}
    if(/^\/ideas\/(?:\d{2}\/(?:index\.html|plan\.md)?|assets\/(?:fonts|photos)\/[\w.-]+|index\.html|phone-zoom\.html|README\.md)?$/.test(url.pathname)){
      let relative=url.pathname.slice('/ideas/'.length);
      if(!relative||relative.endsWith('/'))relative+='index.html';
      file=resolve(root,'../archive-ideas',relative);
    }
    else if(/^\/studies\/(?:index\.html|motion-studies\.html|README\.md|photos\/[\w-]+\.webp)?$/.test(url.pathname)){
      file=resolve(root,'../design-review',url.pathname.slice('/studies/'.length)||'index.html');
    }
    else if(url.pathname==='/'||url.pathname==='/index.html')file=resolve(root,'index.html');
    else if(['/zoom.css','/zoom.js','/hat-model-3d.js','/hat-rotation.js','/rotation-check.html'].includes(url.pathname))file=resolve(root,url.pathname.slice(1));
    else if(/^\/rotation-vendor\/(three\.module\.js|three\.core\.js|FontLoader\.js|TextGeometry\.js|gentilis\.json|helvetiker\.json)$/.test(url.pathname))file=resolve(root,'../../demo/vendor',url.pathname.split('/').pop());
    else if(/^\/rotation-assets\/[\w-]+\.(json|webp|png|mp4)$/.test(url.pathname))file=resolve(root,'rotation-assets',url.pathname.split('/').pop());
    else if(/^\/zoom-photos\/[\w-]+\.webp$/.test(url.pathname))file=resolve(root,'../archive-ideas/assets/photos',url.pathname.split('/').pop());
    if(file){
      const data=await readFile(file);
      const headers={'Content-Type':mime[extname(file)]||'text/html; charset=utf-8','Cache-Control':'no-store','Accept-Ranges':'bytes'};
      const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if(range && (range[1] || range[2])){
        const start=range[1]?Number(range[1]):Math.max(0,data.length-Number(range[2]));
        const end=range[1] && range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
        if(start>=data.length || end<start){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});res.end();return;}
        res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});
        res.end(req.method==='HEAD'?undefined:data.subarray(start,end+1));return;
      }
      res.writeHead(200,{...headers,'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);return;
    }
    const headers={...req.headers,host:`127.0.0.1:${upstreamPort}`};
    if(headers.origin)headers.origin=`http://127.0.0.1:${upstreamPort}`;
    const upstream=request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
    upstream.on('error',()=>{res.writeHead(502);res.end(`Start the film preview on port ${upstreamPort}.`);});
    req.pipe(upstream);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Integrated zoom preview: http://127.0.0.1:${port}/`));
