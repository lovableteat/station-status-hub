const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setMaxListeners } = require('node:events');
const { createRequire } = require('node:module');
const ts = require('typescript');
// QA dependencies stay outside the application lockfile.
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const React = qa('react');
const renderer = qa('react-test-renderer');
const child = ({children, ...props}) => React.createElement('stub', props, children);
const ui = new Proxy({}, {get: (_, name) => name === '__esModule' ? true : child});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function browser() {
  const events = new EventTarget();
  setMaxListeners(0, events); // 20 simulated browser clients share this test event target.
  const storage = new Map();
  const localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem:key=>storage.delete(key)};
  const location = new URL('http://localhost/?workspace=station-status&project=A');
  const session = new Map();
  return Object.assign(events, {
    location, localStorage, sessionStorage: {getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value)}, confirm: () => false,
    history: {replaceState: (_,__,url) => { location.href = String(url); }, pushState: (_,__,url) => { location.href = String(url); }},
    setTimeout, clearTimeout, setInterval, clearInterval,
    matchMedia: () => ({matches:true, addEventListener(){}, removeEventListener(){}}),
    scrollTo(){},
  });
}
function database(run) {
  const channels = [];
  const reads = [];
  function query(table) {
    const q = {table, filters:{}, method:'select'};
    const builder = new Proxy(q, {get: (target, key) => {
      if (key === 'then') return (ok,no) => { reads.push({...q,filters:{...q.filters}}); return Promise.resolve().then(() => run(q)).then(ok,no); };
      if (key === 'eq') return (column,value) => {q.filters[column] = value; return builder;};
      if (['insert','update','upsert','delete'].includes(key)) return payload => {q.method=key;q.payload=payload;return builder;};
      return () => builder;
    }});
    return builder;
  }
  return {
    reads, channels, from:query,
    rpc: (name,args) => Promise.resolve().then(() => run({table:name,args,method:'rpc',filters:{}})),
    channel: name => {
      const channel = {name,removed:false,handlers:[],
        on(kind,config,fn){this.handlers.push({kind,config,fn});return this;},
        subscribe(fn){this.status=fn;channels.push(this);return this;},
        emit(table,payload){this.handlers.filter(h=>h.config.table===table).forEach(h=>h.fn(payload));},
      };return channel;
    },
    removeChannel: channel => {channel.removed=true;return Promise.resolve();},
  };
}
function loader({mocks={}, window=browser(), transform, globals={}}={}) {
  const cache = new Map();
  const load = file => {
    file = path.resolve(file);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    let source=fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','false').replaceAll('import.meta.env.BASE_URL','"/"');
    if(transform)source=transform(source,file);
    const output=ts.transpileModule(source,{fileName:file.replace(/\.mjs$/,'.js'),compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const localRequire=spec=>{
      if(spec in mocks)return mocks[spec];
      if(spec==='react')return React;
      if(spec==='react/jsx-runtime')return qa(spec);
      if(spec==='lucide-react'||spec.startsWith('@/components/ui/'))return ui;
      if(spec.endsWith('.css'))return {};
      if(spec.startsWith('@/'))return load(resolveFile(path.resolve('src',spec.slice(2))));
      if(spec.startsWith('.'))return load(resolveFile(path.resolve(path.dirname(file),spec)));
      return require(spec);
    };
    vm.runInNewContext('(function(require,module,exports){'+output+'\n})',{
      console,window,document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
      setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams,Event,CustomEvent,AbortController,structuredClone,
      crypto:globalThis.crypto, ...globals,
    },{filename:file})(localRequire,module,module.exports);
    return module.exports;
  };
  return load;
}
function resolveFile(file) {
  return [file,file+'.ts',file+'.tsx',file+'.mjs',file+'.js'].find(f=>fs.existsSync(f)) || file;
}
const flush = async (delay=0) => renderer.act(async()=>{await new Promise(resolve=>setTimeout(resolve,delay));});
module.exports={React,...renderer,ui,child,deferred,browser,database,loader,flush};
