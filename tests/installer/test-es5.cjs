// Modern Node accepts block functions which CMU Opera's strict parser rejects.
// Check ES5 grammar AND declaration placement before any browser/DOM mocks run.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const key=Object.keys(process.binding('natives')).find(k=>k.endsWith('acorn/dist/acorn'));
assert(key,'This check requires the Acorn parser bundled with Node.js.');
const parserModule=new Module('cmu-es5-parser');
parserModule._compile(process.binding('natives')[key],'cmu-es5-parser.js');
function check(source,name){
  const tree=parserModule.exports.parse(source,{ecmaVersion:5,locations:true});
  function walk(node,parent,grandparent){
    if(node.type==='FunctionDeclaration'){
      const body=parent && parent.type==='BlockStatement' && grandparent &&
        /^(FunctionDeclaration|FunctionExpression)$/.test(grandparent.type) && grandparent.body===parent;
      assert(parent && (parent.type==='Program' || body),name+':'+node.loc.start.line+': FunctionDeclaration in Statement context (CMU Opera strict mode)');
    }
    for(const field of Object.keys(node)){
      const value=node[field];
      if(Array.isArray(value)){for(const child of value)if(child && child.type)walk(child,node,parent);}
      else if(value && typeof value==='object' && value.type)walk(value,node,parent);
    }
  }
  walk(tree,null,null);
}
assert.throws(()=>check('"use strict"; if (true) { function update() {} }','regression'),/Statement context/);
check('"use strict"; if (true) { var update=function() {}; update(); }','fixed');
const root=path.join(__dirname,'../../usb/ui');let count=0;
for(const name of fs.readdirSync(root)){
  const source=fs.readFileSync(path.join(root,name),'utf8');
  if(name.endsWith('.js')){check(source,name);count++;}
  if(name.endsWith('.html')){
    const scripts=source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
    for(const script of scripts)if(script[1].trim()){check(script[1],name);count++;}
  }
}
for(const name of fs.readdirSync(path.join(__dirname,'../../usb/lib/gui-runtime'))){
  if(name.endsWith('.js')){check(fs.readFileSync(path.join(__dirname,'../../usb/lib/gui-runtime',name),'utf8'),name);count++;}
}
for(const name of ['view.js','i18n.js']){check(fs.readFileSync(path.join(__dirname,'../../development/examples/gui-hello-world/assets',name),'utf8'),name);count++;}
for(const name of fs.readdirSync(path.join(__dirname,'../../usb/tweaks/tetris/assets'))){if(name.endsWith('.js')){check(fs.readFileSync(path.join(__dirname,'../../usb/tweaks/tetris/assets',name),'utf8'),name);count++;}}
for(const name of fs.readdirSync(path.join(__dirname,'../../usb/tweaks/wallpaper-manager/assets'))){if(name.endsWith('.js')){check(fs.readFileSync(path.join(__dirname,'../../usb/tweaks/wallpaper-manager/assets',name),'utf8'),name);count++;}}
for(const id of ['snake','minesweeper'])for(const name of fs.readdirSync(path.join(__dirname,'../../usb/tweaks',id,'assets'))){if(name.endsWith('.js')){check(fs.readFileSync(path.join(__dirname,'../../usb/tweaks',id,'assets',name),'utf8'),id+'/'+name);count++;}}
for(const name of ['demo.js','i18n.js','data.js','model.js','resident.js','live.js','preferences.js','view.js','skins/registry.js','skins/bm2014.js']){
  check(fs.readFileSync(path.join(__dirname,'../../usb/tweaks/speedometer/assets',name),'utf8'),'speedometer/'+name);count++;
}
console.log('CMU_ES5_PASSED:',count,'runtime scripts; ES5 grammar and no block-scoped function declarations.');
