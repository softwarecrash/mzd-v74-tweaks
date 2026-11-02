// Functional UI test with a minimal DOM and simulated worker replies.
// This is not a rendering test and never executes a vehicle patch.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.join(__dirname,'../../usb');
class Node {
  constructor(tag,doc){this.tagName=tag;this.doc=doc;this.children=[];this.className='';this.disabled=false;this.scrollTop=0;this._text='';this.attributes={};this.style={};}
  appendChild(node){this.children.push(node);node.parentNode=this;return node;}
  removeChild(node){this.children.splice(this.children.indexOf(node),1);}
  get firstChild(){return this.children[0]||null;}
  set textContent(t){this._text=String(t);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){this.doc.activeElement=this;}
  getElementsByTagName(tag){let all=[];for(const n of this.children){if(n.tagName===tag)all.push(n);all=all.concat(n.getElementsByTagName(tag));}return all;}
}
function boot(manifestVersion,includeCommand,keepDisclaimer,includeExports,includeSettings,includeBundle){
  const usb={ids:null,manifests:{},installedVersions:{},updateOffers:{}},recovery={},restoreOutcomes={},recoveryHints={},savedSettings={},preflight={},savedUninstall={};
  const nodes={},jobs=[],calls=[],timers=[],intervals=[],listeners={},states={'restore-originals':'uninstalled','backup-jci':'uninstalled','logs-collector':'uninstalled',hello:'uninstalled','list-beep':'uninstalled','main-menu-loop':'installed','ssh':'error'},outcomes={},reasons={ssh:'A required component is missing.'};
  if(includeSettings)states['settings-example']='uninstalled';
  if(includeBundle)states['bundle-example']='uninstalled';
  const doc={activeElement:null,createElement(t){return new Node(t,doc);},getElementById(id){return nodes[id]||walk(nodes.app).concat(walk(nodes.overlay)).find(n=>n.id===id)||null;}};
  function walk(n){return [n].concat(n.children.flatMap(walk));}
  for(const id of ['app','header','system-info','tabs','content','cards','empty','footer-status','list-position','refresh','exit','overlay','dialog','dialog-heading','dialog-dot','dialog-title','dialog-body','dialog-state','dialog-description','dialog-settings','dialog-contributors','dialog-meta','dialog-output','dialog-actions','back','uninstall-action','update-action','restore-action','action','result-ok','transport']){nodes[id]=new Node('div',doc);nodes[id].id=id;}
  for(const id of ['refresh','exit','back','uninstall-action','update-action','restore-action','action','result-ok'])nodes[id].tagName='button';
  nodes.app.appendChild(nodes.header);nodes.header.appendChild(nodes.refresh);nodes.header.appendChild(nodes.exit);nodes.app.appendChild(nodes.tabs);nodes.app.appendChild(nodes.content);nodes.content.appendChild(nodes.cards);
  nodes.overlay.appendChild(nodes.dialog);nodes.dialog.appendChild(nodes['dialog-body']);for(const id of ['dialog-state','dialog-description','dialog-settings','dialog-contributors','dialog-meta','dialog-output'])nodes['dialog-body'].appendChild(nodes[id]);nodes.dialog.appendChild(nodes['dialog-actions']);for(const id of ['back','uninstall-action','update-action','restore-action','action','result-ok'])nodes['dialog-actions'].appendChild(nodes[id]);
  nodes['update-action'].className='primary hidden';nodes['restore-action'].className='hidden';nodes['uninstall-action'].className='hidden';
  nodes.overlay.className='hidden';nodes['result-ok'].className='primary hidden';
  nodes.transport.contentWindow={postMessage(job,origin){assert.equal(origin,'http://127.0.0.1:1234');jobs.push(job);}};
  const win={installerConfig:{origin:'http://127.0.0.1:1234',token:'secret'},innerWidth:800,innerHeight:480,setTimeout(fn){timers.push(fn);},setInterval(fn){intervals.push(fn);return intervals.length-1;},clearInterval(id){intervals[id]=null;},addEventListener(n,f){listeners[n]=f;}};
  const ctx={window:win,document:doc,escape,unescape,encodeURIComponent,decodeURIComponent,WaylandManager:function(){this.SetRequiredSurfaces=(...a)=>calls.push(['visible',...a]);this.SetKeyboardFocus=(...a)=>calls.push(['focus',...a]);}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'ui/app.js'),'utf8'),ctx);
  function event(data,origin='http://127.0.0.1:1234',source=nodes.transport.contentWindow){listeners.message({source,origin,data});}
  function ok(stdout='',code=0,stderr=''){return {started:true,exitCode:code,signal:null,stdout,stderr,startError:'',stdoutTruncated:false,stderrTruncated:false};}
  let background=null,polls=0;
  function process(job){
    assert.equal(job.program,'/bin/sh');assert.equal(job.args[0],'./installer.sh');const a=job.args.slice(1);calls.push(a);
    if(a[0]==='config-info')return ok(usb.configPresent?'present\n':'none\n');
    if(a[0]==='event' && a[1]==='focus-poll'){const requested=usb.refocusRequested;usb.refocusRequested=false;return ok(requested?'requested\n':'');}
    if(a[0]==='event')return ok();
    if(a[0]==='uninstall-check')return savedUninstall[a[1]]||ok('',1,'No saved uninstaller is available.');
    if(a[0]==='restore-check')return recovery[a[1]]?ok(recovery[a[1]]):ok('',1,'No verified original backup is available.');
    if(a[0]==='restore-original') {const code=restoreOutcomes[a[1]]||0;if(!code){states[a[1]]='uninstalled';delete recovery[a[1]];}return ok(code?'':'Original file restored. You can now retry Install.',code,code===2?'Restore cleanup failed. Do NOT reboot.':code?'Restore refused: file changed.':'');}
    if(a[0]==='preflight-info')return preflight[a[1]]||ok();
    if(a[0]==='settings-info') {
      if(a[1]==='bundle-example'){const text=fs.readFileSync(path.join(ROOT,'../development/examples/bundle/manifest.conf'),'utf8');return ok('settings_saved='+(states[a[1]]==='installed'?'true':'false')+'\n'+text.slice(text.indexOf('settings='))+'value.hud_display_language=off\n');}
      if(a[1]!=='settings-example')return ok('settings_saved=true\nsettings=\n');
      const text=savedSettings.schemaText||fs.readFileSync(path.join(ROOT,'../development/examples/settings/manifest.conf'),'utf8');
      const defs=text.slice(text.indexOf('settings='));
      return ok('settings_saved='+(savedSettings[a[1]]?'true':'false')+'\n'+defs+'value.log_limit_mb='+(savedSettings[a[1]]||'20')+'\nvalue.compress=true\nvalue.profile='+(/setting.profile.default=([^\r\n]+)/.exec(text)||[])[1]+'\n');
    }
    if(a[0]==='update-info')return usb.updateOffers[a[1]]||ok('',1,'Update not available.');
    if(a[0]==='package-info')return ok(states[a[1]]==='installed'?(usb.installedVersions[a[1]]||'0.7.0')+'\tinstalled\n':'');
    if(a[0]==='metrics')return ok('cpu\t1000\t700\t'+(a[1]==='0'?'-':'30')+'\ndisk\t/\t42\ndisk\t/tmp/mnt/resources\t18\ndisk\t/tmp/mnt/sdb1\t80\n');
    if(a[0]==='start-run'){background=a[1];polls=0;return ok('job.test01\n');}
    if(a[0]==='job-status'){polls++;return ok(polls===1?'running\n0\n0\nCreating archive\n':polls===2?'running\n5\n10\nCopying files\n':'done\n'+(outcomes[background]||0)+'\n');}
    if(a[0]==='job-output')return ok(a[2]==='stdout'?'Saved to USB: /mnt/sdb1/exports/'+background:'');
    if(a[0]==='list' && usb.ids!==null)return ok(usb.ids.join('\n')+'\n');
    if(a[0]==='list')return ok((includeBundle?'bundle-example\n':'')+(includeSettings?'settings-example\n':'')+'list-beep\nmain-menu-loop\nssh\nbroken\n'+(includeCommand?'hello\n':'')+(includeExports?'backup-jci\nlogs-collector\nrestore-originals\n':''));
    if(a[0]==='manifest'){if(Object.prototype.hasOwnProperty.call(usb.manifests,a[1]))return ok(usb.manifests[a[1]]);if(a[1]==='bundle-example')return ok(fs.readFileSync(path.join(ROOT,'../development/examples/bundle/manifest.conf'),'utf8'));if(a[1]==='settings-example')return ok(fs.readFileSync(path.join(ROOT,'../development/examples/settings/manifest.conf'),'utf8'));if(a[1]==='broken')return ok('{broken');let m=fs.readFileSync(a[1]==='hello'?path.join(ROOT,'../development/examples/hello/manifest.conf'):path.join(ROOT,'tweaks',a[1],'manifest.conf'),'utf8');if(a[1]==='list-beep')m=m.replace(/^contributors=.*\r?\n?/gm,'')+'contributors=Original author; port by Example <developer>\n';if(manifestVersion)m=m.replace(/^contract_version=.*$/m,'contract_version='+manifestVersion);return ok(m);}
    if(a[0]==='statuses')return ok(a[1].split(' ').map(id=>id+'\t'+(states[id]==='error'?'error':states[id])+'\t'+(states[id]==='error'?'Patch state is ambiguous.':['unavailable','broken'].includes(states[id])?(reasons[id]||''):'' )+'\n').join(''));
    if(a[2]==='status')return states[a[1]]==='error'?ok('',1,'Patch state is ambiguous.'):ok(states[a[1]]+'\n',0,['unavailable','broken'].includes(states[a[1]])?(reasons[a[1]]||''):'');
    const code=outcomes[a[1]]||0;
    if(code===0)states[a[1]]=['install','update'].includes(a[2])?'installed':'uninstalled';
    return ok(code?(code===1&&recovery[a[1]]&&recoveryHints[a[1]]!==false?'MZD_RECOVERY_CANDIDATE\n':''):a[2]+' completed. Other changes were preserved.',code,code===2?'Rollback failed. Do NOT reboot.':code?'Installation rejected.':'');
  }
  function pump(){let count=0;while(jobs.length){if(++count>100)throw new Error('request loop');const j=jobs.shift();event({type:'shell-result',token:'secret',id:j.id,result:process(j),error:null});}}
  event({type:'shell-ready',token:'wrong'});event({type:'shell-ready',token:'secret'},'http://wrong');assert.equal(jobs.length,0);
  event({type:'shell-ready',token:'secret'});pump();
  if(!keepDisclaimer){nodes.action.onclick();pump();}
  const click=id=>{const n=doc.getElementById(id);assert(n,'missing '+id);assert(!n.disabled,'disabled '+id);n.onclick();};
  return {usb,nodes,doc,jobs,calls,states,outcomes,reasons,recovery,restoreOutcomes,recoveryHints,savedSettings,preflight,savedUninstall,timers,intervals,pump,click,ok,event};
}
let x=boot();
assert.equal(x.calls.filter(a=>a[0]==='statuses').length,1);
assert.equal(x.calls.filter(a=>a[0]==='action'&&a[2]==='status').length,0);
assert.equal(x.nodes.tabs.children.length,3); // Errors, Interface, System.
assert.equal(x.nodes.cards.firstChild.id,'tweak-broken');
assert.equal(x.nodes.cards.firstChild.children[0].className,'dot error');
x.click('tweak-broken');assert.equal(x.nodes.action.disabled,true);x.click('back');
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
assert.equal(x.doc.getElementById('tweak-main-menu-loop').children[0].className,'dot installed');
assert.equal(x.doc.getElementById('tweak-list-beep').children[0].className,'dot uninstalled');
x.click('tweak-list-beep');assert.equal(x.nodes.action.textContent,'Install');assert.match(x.nodes['dialog-description'].textContent,/beeps/);assert.match(x.nodes['dialog-meta'].textContent,/Restart required:Yes/);
x.click('action');assert.equal(x.nodes['dialog-state'].textContent,'Installing');assert.equal(x.nodes.back.disabled,true);assert.equal(x.nodes.exit.disabled,true);
const installAnimation=x.intervals[x.intervals.length-1],requestsBeforeAnimation=x.jobs.length;
installAnimation();assert.equal(x.nodes['dialog-state'].textContent,'Installing.');
installAnimation();assert.equal(x.nodes['dialog-state'].textContent,'Installing..');
installAnimation();assert.equal(x.nodes['dialog-state'].textContent,'Installing...');
installAnimation();assert.equal(x.nodes['dialog-state'].textContent,'Installing');assert.equal(x.jobs.length,requestsBeforeAnimation);x.pump();
assert.equal(x.intervals[x.intervals.length-1],null);installAnimation();assert.equal(x.nodes['dialog-state'].textContent,'Install completed');
assert.equal(x.nodes['dialog-title'].textContent,'Operation completed');assert.equal(x.nodes['dialog-state'].textContent,'Install completed');assert.doesNotMatch(x.nodes['dialog-output'].textContent,/install in progress|install completed/i);
x.click('result-ok');x.pump();assert.equal(x.doc.getElementById('tweak-list-beep').children[0].className,'dot installed');
x.click('tweak-list-beep');assert.equal(x.nodes.action.textContent,'Uninstall');x.click('action');assert.equal(x.nodes['dialog-state'].textContent,'Checking configuration');x.pump();assert.equal(x.nodes['dialog-state'].textContent,'Uninstall completed');x.click('result-ok');x.pump();assert.equal(x.states['list-beep'],'uninstalled');
x.outcomes['list-beep']=1;x.click('tweak-list-beep');x.click('action');x.pump();assert.equal(x.nodes['dialog-title'].textContent,'Operation failed');assert.equal(x.nodes['dialog-state'].textContent,'Install failed');x.click('result-ok');x.pump();assert.equal(x.nodes.refresh.disabled,false);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();x.click('tweak-ssh');assert.equal(x.nodes.action.textContent,'Retry status');assert.match(x.nodes['dialog-state'].textContent,/ambiguous/);x.click('back');
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.outcomes['list-beep']=2;x.click('tweak-list-beep');x.click('action');x.pump();assert.equal(x.nodes['dialog-title'].textContent,'Manual check required');assert.match(x.nodes['dialog-description'].textContent,/Do NOT reboot/);x.click('result-ok');assert.equal(x.nodes.refresh.disabled,true);x.click('tweak-main-menu-loop');assert.equal(x.nodes.action.disabled,true);x.click('back');
x.click('exit');x.pump();assert.deepEqual(x.calls.filter(a=>a[0]==='focus').at(-1),['focus','JCI_OPERA_PRIMARY']);
// A known start failure cannot have changed the target and must not falsely
// claim that manual rollback or a no-reboot state is required.
x=boot();x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.click('tweak-list-beep');x.click('action');
let request=x.jobs.pop();assert.equal(request.args[1],'action');x.event({type:'shell-result',token:'secret',id:request.id,error:null,result:{started:false,exitCode:null,signal:null,stdout:'',stderr:'',startError:'Missing executable'}});
assert.equal(x.nodes['dialog-title'].textContent,'Operation failed');x.click('result-ok');x.pump();assert.equal(x.nodes.refresh.disabled,false);
console.log('INSTALLER_UI_TESTS_PASSED: discovery, tabs, dots, metadata, status errors, install/uninstall, result OK, critical lock, Exit.');

// A blocked or broken state is a valid inspection, with a required reason.
for(const state of ['unavailable','broken']) {
  x=boot();x.states.ssh=state;x.click('refresh');x.pump();
  x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
  assert.equal(x.doc.getElementById('tweak-ssh').children[0].className,'dot '+state);
  x.click('tweak-ssh');assert.equal(x.nodes.action.textContent,'Retry status');
  assert.match(x.nodes['dialog-state'].textContent,/required component/);
  x.click('back');assert.equal(x.nodes.refresh.disabled,false);
}
x=boot();x.states.ssh='unavailable';x.reasons.ssh='';x.click('refresh');x.pump();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.click('tweak-ssh');assert.match(x.nodes['dialog-state'].textContent,/without a reason/);
x=boot(99);assert.equal(x.nodes.tabs.children.length,1);x.click('tweak-list-beep');assert.equal(x.nodes.action.disabled,true);
console.log('CONTRACT_V1_UI_PASSED: unavailable, broken, reasons and unsupported contract version.');

x=boot(undefined,true);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Examples')===0).onclick();
x.click('tweak-hello');assert.equal(x.nodes.action.textContent,'Run');
x.click('action');x.pump();assert(x.calls.some(a=>a[0]==='action'&&a[1]==='hello'&&a[2]==='run'));
x.click('result-ok');x.pump();assert.equal(x.states.hello,'uninstalled');
console.log('COMMAND_UI_PASSED: manifest discovery, Run and status refresh.');

// Real CMU controller codes: rotate M/N, tilt arrows, Backspace on release.
x=boot(undefined,false,false,true);
function controller(type,key,whichOnly=false){
  let prevented=false;const event={preventDefault(){prevented=true;}};
  event[whichOnly?'which':'keyCode']=key;x.doc[type](event);assert.equal(prevented,true);
}
x.nodes.refresh.focus();controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes.exit);
controller('onkeydown',78,true);assert.equal(x.doc.activeElement,x.nodes.refresh);
controller('onkeydown',40);assert.equal(x.doc.activeElement,x.nodes.exit);
controller('onkeydown',38);assert.equal(x.doc.activeElement,x.nodes.refresh);
const interfaceTab=x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0);
const systemTab=x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0);
interfaceTab.onclick();assert.equal(x.doc.activeElement,interfaceTab);
controller('onkeydown',77);assert.equal(x.doc.activeElement,systemTab);
controller('onkeydown',13);assert.equal(x.doc.activeElement,systemTab);
assert.equal(systemTab.attributes['aria-selected'],'true');
assert.equal(interfaceTab.attributes['aria-selected'],'false');
controller('onkeydown',78);assert.equal(x.doc.activeElement,interfaceTab);
controller('onkeydown',13);assert.equal(x.doc.activeElement,interfaceTab);
systemTab.onclick();assert.equal(x.doc.activeElement,systemTab);
controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes.cards.children[0]);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
x.click('tweak-list-beep');controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes.action);
controller('onkeydown',78);assert.equal(x.doc.activeElement,x.nodes.back);
const top=x.nodes['dialog-body'].scrollTop;
controller('onkeydown',40);assert.equal(x.doc.activeElement,x.nodes.action);
controller('onkeydown',38);assert.equal(x.doc.activeElement,x.nodes.back);
controller('onkeydown',77);controller('onkeydown',77);
assert.equal(x.doc.activeElement,x.nodes['dialog-description'].children[0]);
const section=x.doc.activeElement;section.offsetParent=x.nodes['dialog-body'];section.offsetTop=300;section.offsetHeight=70;x.nodes['dialog-body'].clientHeight=200;
section.onfocus();assert.equal(x.nodes['dialog-body'].scrollTop,170);
controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes['dialog-meta']);
controller('onkeydown',8);assert(!x.nodes.overlay.className.includes('hidden'));
controller('onkeyup',8);assert(x.nodes.overlay.className.includes('hidden'));
// Back cannot dismiss an in-flight operation or skip result acknowledgement.
x.click('tweak-list-beep');x.click('action');controller('onkeydown',8);controller('onkeyup',8);
assert(!x.nodes.overlay.className.includes('hidden'));x.pump();controller('onkeyup',8);
assert.equal(x.nodes['dialog-title'].textContent,'Operation completed');
x.click('result-ok');x.pump();controller('onkeydown',8);controller('onkeyup',8);x.pump();
assert.equal(x.nodes['dialog-title'].textContent,'Restart recommended');
controller('onkeyup',8);x.pump();
assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
console.log('MULTICONTROLLER_PASSED: rotate, tilt up/down, Back on release, browser-history suppression and action guards.');

// Exercise the production manifest parser directly with literal text values.
const appSource=fs.readFileSync(path.join(ROOT,'ui/app.js'),'utf8');
const manifestFunction=appSource.slice(appSource.indexOf('    function settingDefinitions('),appSource.indexOf('    function discover('));
const parseConf=vm.runInNewContext('(function(){function trim(v){return String(v||" ").replace(/^\\s+|\\s+$/g,"");}'+manifestFunction+';return parseManifest;}())');
// Parser cases control attribution explicitly, regardless of current tweak credits.
const rawConf=fs.readFileSync(path.join(ROOT,'tweaks/list-beep/manifest.conf'),'utf8').replace(/^contributors=.*\r?\n?/gm,'');
const literal='Text = # "quotes" $(not_a_command) `not_a_command`';
const parsedConf=parseConf('list-beep',rawConf.replace(/^name=.*$/m,'name='+literal));
assert.equal(parsedConf.name,literal);assert.equal(parsedConf.actions.join(' '),'install uninstall status');
assert.equal(parsedConf.requires.length,0);assert.equal(parsedConf.reboot_required,true);
for(const raw of [rawConf+'id=list-beep\n',rawConf+'unknown=value\n',rawConf.replace(/^id=.*\n/m,''),rawConf+'# tab\t\n']) {
  assert.throws(()=>parseConf('list-beep',raw));
}
console.log('MANIFEST_UI_PASSED: literal values, lists, booleans, duplicate/unknown/missing/control rejection.');

// Startup is entirely in the styled UI; no discovery or worker runs before OK.
x=boot(undefined,false,true);
assert.equal(x.nodes['dialog-title'].textContent,'Before you begin');
assert.equal(x.nodes.action.textContent,'OK');assert.equal(x.nodes.back.textContent,'Exit');
assert.equal(x.doc.activeElement,x.nodes.action);assert.equal(x.nodes.refresh.disabled,true);
assert(!x.calls.some(a=>['list','manifest','action'].includes(a[0])));
controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes.back);
controller('onkeydown',78);assert.equal(x.doc.activeElement,x.nodes.action);
controller('onkeydown',13);x.pump();assert.equal(x.calls.filter(a=>a[0]==='list').length,1);
assert.equal(x.nodes.back.textContent,'Back');assert.equal(x.nodes.refresh.disabled,false);
x=boot(undefined,false,true);x.click('back');x.pump();
assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
assert(!x.calls.some(a=>['list','manifest','action'].includes(a[0])));
x=boot(undefined,false,true);controller('onkeydown',8);
assert(!x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
controller('onkeyup',8);x.pump();assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
x.nodes.action.onclick();x.pump();assert(!x.calls.some(a=>a[0]==='list'));
x=boot(undefined,false,true);controller('onkeydown',27);x.pump();
assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
assert(!fs.readFileSync(path.join(ROOT,'autorun.sh'),'utf8').includes('/jci/tools/jci-dialog'));
console.log('STARTUP_NOTICE_PASSED: controller OK/Exit/Back/Escape, no discovery before acceptance, no native dialog.');

// Export jobs release the serial bridge and update progress between polls.
for(const id of ['backup-jci','logs-collector']){
 x=boot(undefined,false,false,true);
 x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
 x.click('tweak-'+id);assert.equal(x.nodes.action.textContent,'Run');x.click('action');x.pump();
 assert.match(x.nodes['dialog-state'].textContent,/Creating archive/);assert.equal(x.nodes.exit.disabled,true);
 assert.equal(x.timers.length,1);x.timers.shift()();x.pump();assert.match(x.nodes['dialog-state'].textContent,/5\/10/);
 x.timers.shift()();x.pump();assert.equal(x.nodes['dialog-title'].textContent,'Operation completed');
 assert.match(x.nodes['dialog-output'].textContent,/Saved to USB/);x.click('result-ok');x.pump();assert.equal(x.nodes.exit.disabled,false);
 assert(!x.calls.some(a=>a[0]==='action'&&a[1]===id&&a[2]==='run'));
}
console.log('EXPORT_PROGRESS_UI_PASSED: background start, phase/file progress, final output and operation guards.');

// Read-only header telemetry, periodic refresh and no polling during a worker.
x=boot();assert.match(x.nodes['system-info'].textContent,/CPU: --/);
assert.match(x.nodes['system-info'].textContent,/Resources: 18% free/);
x.intervals[0]();x.pump();assert.match(x.nodes['system-info'].textContent,/CPU: 30%/);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
x.click('tweak-list-beep');x.click('action');
let metricCount=x.calls.filter(a=>a[0]==='metrics').length;
x.intervals[0]();x.pump();assert.equal(x.calls.filter(a=>a[0]==='metrics').length,metricCount);
x.click('result-ok');x.pump();x.intervals[0]();x.pump();
assert.equal(x.calls.filter(a=>a[0]==='metrics').length,metricCount+1);
console.log('SYSTEM_METRICS_UI_PASSED: CPU sampling, partition free space and paused polling during operations.');

// Restore is a deliberate second confirmation and refreshes every tweak afterwards.
x=boot(undefined,false,false,true);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.click('tweak-restore-originals');x.click('action');
assert.match(x.nodes['dialog-title'].textContent,/Confirm:/);
assert.match(x.nodes['dialog-description'].textContent,/Tweak services may stop/);
assert.equal(x.nodes.action.textContent,'Continue');
assert(!x.calls.some(a=>a[0]==='start-run'));
x.click('back');assert.equal(x.nodes.action.textContent,'Run');
x.click('action');x.click('action');x.pump();
while(x.timers.length){x.timers.shift()();x.pump();}
assert.equal(x.nodes['dialog-title'].textContent,'Operation completed');
let statusBefore=x.calls.filter(a=>a[0]==='statuses').length;
x.click('result-ok');x.pump();
assert.equal(x.calls.filter(a=>a[0]==='statuses').length,statusBefore+1);
x.click('exit');assert.equal(x.nodes['dialog-title'].textContent,'Restart recommended');x.click('back');x.pump();
for(const blockedState of ['broken','unavailable']) {
 x=boot();x.states['list-beep']=blockedState;x.reasons['list-beep']='Target mismatch';x.click('refresh');x.pump();
 x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.click('tweak-list-beep');
 assert.match(x.nodes['dialog-description'].textContent,/System > Restore originals/);
 assert.match(x.nodes['dialog-description'].textContent,/ALL patches/);
}
console.log('RESTORE_UI_PASSED: confirmation/cancel, reset action, full status refresh and repair guidance.');

function finishPatch(action='install',code=0) {
 const y=boot();y.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
 const id=action==='uninstall'?'main-menu-loop':'list-beep';y.outcomes[id]=code;
 y.click('tweak-'+id);y.click('action');y.pump();y.click('result-ok');y.pump();return y;
}
for(const action of ['install','uninstall']) {
 x=finishPatch(action);x.click('exit');x.pump();
 assert.equal(x.nodes['dialog-title'].textContent,'Restart recommended');
 assert.equal(x.nodes.back.textContent,'Exit');assert.equal(x.nodes.action.textContent,'Restart');
 assert(!x.calls.some(a=>a[0]==='event'&&['restart','close'].includes(a[1])));
 x.click('back');x.pump();assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
 assert(!x.calls.some(a=>a[0]==='event'&&a[1]==='restart'));
}
x=finishPatch();x.click('exit');x.click('action');x.pump();
assert(x.calls.some(a=>a[0]==='event'&&a[1]==='restart'));
for(const code of [1,2]) {
 x=finishPatch('install',code);x.click('exit');x.pump();
 assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
 assert(!x.calls.some(a=>a[0]==='event'&&a[1]==='restart'));
}
x=boot();x.click('exit');x.pump();assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
x=boot();x.states.ssh='uninstalled';x.click('refresh');x.pump();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.click('tweak-ssh');x.click('action');x.pump();x.click('result-ok');x.pump();x.click('exit');x.pump();
assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));assert(!x.calls.some(a=>a[0]==='event'&&a[1]==='restart'));
// A rejected restart request leaves both choices usable.
x=finishPatch();x.click('exit');x.click('action');
let restartRequest=x.jobs.shift();assert.equal(restartRequest.args[2],'restart');
x.event({type:'shell-result',token:'secret',id:restartRequest.id,result:x.ok('',1,'Restart unavailable')});
assert.equal(x.nodes.back.disabled,false);assert.equal(x.nodes.action.disabled,false);
x.click('back');x.pump();assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
console.log('RESTART_UI_PASSED: successful install/uninstall, optional Exit, explicit restart, failed/critical/no-restart actions and request failure.');

// Read-only scanning does not trap the user in the installer.
x=boot();let beforeScan=x.calls.filter(a=>a[0]==='statuses').length;
x.click('refresh');assert.equal(x.nodes.exit.disabled,false);
x.click('exit');x.pump();assert(x.calls.some(a=>a[0]==='event'&&a[1]==='close'));
assert.equal(x.calls.filter(a=>a[0]==='statuses').length,beforeScan,'Exit during discovery must not start a status scan');
console.log('SCAN_EXIT_PASSED: Exit stays available and stops subsequent read-only status requests.');

// Exiting a scan is safe, but Restart must wait for its result.
x=finishPatch();x.click('refresh');x.click('exit');assert.equal(x.nodes.action.disabled,true);
let pendingStatus=x.jobs.shift();x.event({type:'shell-result',token:'secret',id:pendingStatus.id,result:x.ok('',2,'Critical status result')});
assert.equal(x.nodes.action.disabled,true);x.click('back');x.pump();
assert(!x.calls.some(a=>a[0]==='event'&&a[1]==='restart'));
console.log('SCAN_RESTART_GUARD_PASSED: critical scan cannot be bypassed by a queued restart.');

// A newer USB manifest does not replace the installed version in the details.
x=boot();x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
x.click('tweak-main-menu-loop');x.pump();
assert.match(x.nodes['dialog-meta'].textContent,/0\.7\.0 installed \/ [0-9]+\.[0-9]+\.[0-9]+ on USB/);
assert.equal(x.nodes.action.textContent,'Uninstall');
console.log('SAVED_VERSION_UI_PASSED: installed and USB versions shown in one row, existing uninstall action retained.');

// A broken receipt may still contain a verified matching uninstaller.
function brokenSaved(reply) {
 const y=boot();y.states.ssh='broken';y.reasons.ssh='Saved installation state: failed.';
 if(reply)y.savedUninstall.ssh=reply;
 y.click('refresh');y.pump();
 assert(!y.calls.some(a=>a[0]==='uninstall-check'),'Eligibility must not slow the menu scan');
 y.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
 y.click('tweak-ssh');return y;
}
x=brokenSaved();assert(x.nodes['uninstall-action'].className.includes('hidden'));x.pump();
assert(x.nodes['uninstall-action'].className.includes('hidden'));assert.equal(x.nodes.action.textContent,'Retry status');
assert.match(x.nodes['dialog-description'].textContent,/Saved uninstall unavailable:[\s\S]*No saved uninstaller/);
x=brokenSaved();x.savedUninstall.ssh=x.ok('available\t0.8.3\tfailed\n');x.pump();
assert(!x.nodes['uninstall-action'].className.includes('hidden'));assert.equal(x.doc.activeElement,x.nodes.back);
assert.equal(x.nodes.action.textContent,'Retry status');assert.match(x.nodes['dialog-meta'].textContent,/0\.8\.3 saved \/ .* on USB/);
assert(!x.calls.some(a=>a[0]==='action'&&a[2]==='uninstall'));
controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes['uninstall-action']);controller('onkeydown',13);
assert(x.nodes['uninstall-action'].className.includes('hidden'));x.pump();
assert(x.calls.some(a=>a[0]==='action'&&a[1]==='ssh'&&a[2]==='uninstall'));
assert.equal(x.nodes['dialog-state'].textContent,'Uninstall completed');x.click('result-ok');x.pump();
assert.equal(x.states.ssh,'uninstalled');assert(!x.calls.some(a=>a[0]==='action'&&a[2]==='install'));
x.click('tweak-ssh');assert.equal(x.nodes.action.textContent,'Install');assert(x.nodes['uninstall-action'].className.includes('hidden'));
for(const raw of ['available\tbad\tfailed\n','available\t0.8.3\tfailed','available\t0.8.3\tfailed\nextra\n']) {
 x=brokenSaved();x.savedUninstall.ssh=x.ok(raw);x.pump();assert(x.nodes['uninstall-action'].className.includes('hidden'));
}
x=brokenSaved();x.savedUninstall.ssh=x.ok('available\t0.8.3\tfailed\n');
const staleUninstall=x.jobs.find(j=>j.args[1]==='uninstall-check');x.jobs.splice(x.jobs.indexOf(staleUninstall),1);
x.click('back');x.event({type:'shell-result',token:'secret',id:staleUninstall.id,result:x.savedUninstall.ssh});
assert(x.nodes['uninstall-action'].className.includes('hidden'));
x=brokenSaved();x.savedUninstall.ssh=x.ok('available\t0.8.3\tfailed\n');x.pump();x.outcomes.ssh=2;
x.click('uninstall-action');x.pump();assert.match(x.nodes['dialog-description'].textContent,/Do NOT reboot/);
x.click('result-ok');assert.equal(x.nodes.refresh.disabled,true);
console.log('BROKEN_SAVED_UNINSTALL_UI_PASSED: detail-only eligibility, saved version, controller access, refusal/stale guards, cleanup and critical failure.');

function recoveryOffer(raw='available\t'+'a'.repeat(32)+'\t/jci/test.js\n') {
  const r=boot();r.recovery['list-beep']=raw;r.states['list-beep']='broken';r.reasons['list-beep']='An existing modification was detected.';
  r.click('refresh');r.pump();
  r.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
  r.click('tweak-list-beep');r.pump();return r;
}
// A stock target permits Install; a verified recovery offer requires Restore first.
for (const raw of ['original\n','available\t'+'a'.repeat(32)+'\t/jci/test.js\n']) {
  x=boot();x.recovery['list-beep']=raw;
  x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
  x.click('tweak-list-beep');x.pump();
  assert.equal(x.nodes.action.textContent,'Install');assert.equal(x.nodes.action.disabled,raw!=='original\n');
  assert.equal(x.nodes['restore-action'].className.includes('hidden'),raw==='original\n');
  assert.doesNotMatch(x.nodes['dialog-description'].textContent,/Restore original unavailable/);
  if(raw==='original\n')assert.doesNotMatch(x.nodes['dialog-description'].textContent,/Restore original resets/);
  else {
    assert.match(x.nodes['dialog-description'].textContent,/Restore original resets ALL changes/);
    const installs=x.calls.filter(a=>a[0]==='action'&&a[2]==='install').length;
    x.nodes.action.disabled=false;x.nodes.action.onclick();x.pump();
    assert.equal(x.calls.filter(a=>a[0]==='action'&&a[2]==='install').length,installs,'action guard must also reject Install while Restore is required');
  }
}
x=recoveryOffer();assert.equal(x.nodes['dialog-title'].textContent,'No List Beep - Broken installation');
assert(!x.nodes['restore-action'].className.includes('hidden'));
assert.equal(x.nodes.action.textContent,'Retry status');
assert.equal(x.nodes.action.disabled,false,'Restore offer must not disable Retry status');
assert.equal(x.doc.activeElement,x.nodes.back,'Showing Restore must not move focus');
assert(!x.calls.some(a=>a[0]==='action'&&a[2]==='install'),'Broken tweaks need no attempted install');
assert(!x.calls.some(a=>a[0]==='restore-original'));
x.click('restore-action');assert.equal(x.nodes['dialog-title'].textContent,'Restore original file?');
assert.match(x.nodes['dialog-description'].textContent,/ALL tweaks/);
assert.match(x.nodes['dialog-description'].textContent,/saved to USB/);
assert(x.nodes['restore-action'].className.includes('hidden'));
assert(!x.calls.some(a=>a[0]==='restore-original'));
x.click('back');x.pump();assert.equal(x.nodes['dialog-title'].textContent,'No List Beep - Broken installation');
assert(!x.calls.some(a=>a[0]==='restore-original'));
x=recoveryOffer();controller('onkeydown',77);assert.equal(x.doc.activeElement,x.nodes['restore-action']);
controller('onkeydown',13);assert.equal(x.nodes['dialog-title'].textContent,'Restore original file?');
controller('onkeyup',8);x.pump();assert.equal(x.nodes['dialog-title'].textContent,'No List Beep - Broken installation');
x=recoveryOffer();x.click('restore-action');x.click('action');x.pump();
assert.deepEqual(Array.from(x.calls.find(a=>a[0]==='restore-original')),['restore-original','list-beep','a'.repeat(32)]);
assert.equal(x.nodes['dialog-state'].textContent,'Restore completed');
assert.equal(x.calls.filter(a=>a[0]==='action'&&a[2]==='install').length,0,'Restore must not automatically reinstall');
x.click('result-ok');x.pump();x.outcomes['list-beep']=0;x.click('tweak-list-beep');assert.equal(x.nodes.action.textContent,'Install');
x.pump();assert(x.nodes['restore-action'].className.includes('hidden'));assert.equal(x.nodes.action.disabled,false,'Install becomes available after successful Restore');
x=recoveryOffer();x.restoreOutcomes['list-beep']=2;x.click('restore-action');x.click('action');x.pump();
assert.match(x.nodes['dialog-description'].textContent,/Do NOT reboot/);x.click('result-ok');assert.equal(x.nodes.refresh.disabled,true);
for(const raw of ['', 'original', 'original\nextra\n', 'available\tbad-hash\t/jci/test.js\n','available\t'+'a'.repeat(32)+'\t/jci/test.js','available\t'+'a'.repeat(32)+'\t/jci/test.js\nextra\n']) {
  x=recoveryOffer(raw);assert.match(x.nodes['dialog-description'].textContent,/Restore original unavailable:/);assert.equal(x.nodes['dialog-title'].textContent,'No List Beep - Broken installation');assert(x.nodes['restore-action'].className.includes('hidden'));assert(!x.calls.some(a=>a[0]==='restore-original'));
}
// Eligibility is not required to arrive before the user navigates elsewhere.
x=recoveryOffer();x.click('back');x.click('tweak-list-beep');let oldRecovery=x.jobs.shift();x.click('back');x.click('tweak-list-beep');
x.event({type:'shell-result',token:'secret',id:oldRecovery.id,result:x.ok('available\t'+'a'.repeat(32)+'\t/jci/test.js\n')});
assert(x.nodes['restore-action'].className.includes('hidden'),'An older detail-view response must not reveal Restore');
delete x.recovery['list-beep'];x.pump();assert(x.nodes['restore-action'].className.includes('hidden'));
assert.match(x.nodes['dialog-description'].textContent,/Restore original unavailable:[\s\S]*No verified original backup is available/);
assert.equal(x.doc.activeElement,x.nodes.back,'A refused restore check must preserve focus');
// A blocked install returns to details after OK, without opening confirmation.
x=boot();x.recovery['list-beep']='available\t'+'a'.repeat(32)+'\t/jci/test.js\n';x.outcomes['list-beep']=1;
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.click('tweak-list-beep');x.click('action');x.pump();
assert.equal(x.nodes['dialog-title'].textContent,'Operation failed');x.click('result-ok');x.pump();
assert.equal(x.nodes['dialog-title'].textContent,'No List Beep - Not installed');assert(!x.nodes['restore-action'].className.includes('hidden'));
assert(!x.calls.some(a=>a[0]==='restore-original'));
// A later settings reply must not re-enable Install after Restore was offered.
x=boot();x.usb.manifests['list-beep']=fs.readFileSync(path.join(ROOT,'tweaks/list-beep/manifest.conf'),'utf8')+'\nsettings=flag\nsetting.flag.type=boolean\nsetting.flag.label=Flag\nsetting.flag.default=false\n';
x.click('refresh');x.pump();x.recovery['list-beep']='available\t'+'a'.repeat(32)+'\t/jci/test.js\n';
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.click('tweak-list-beep');
const lateSettings=x.jobs.find(j=>j.args[1]==='settings-info');assert(lateSettings);x.jobs.splice(x.jobs.indexOf(lateSettings),1);x.pump();
assert(x.nodes.action.disabled);assert(!x.nodes['restore-action'].className.includes('hidden'));
x.event({type:'shell-result',token:'secret',id:lateSettings.id,result:x.ok('settings_saved=false\nsettings=\n')});
assert(x.nodes.action.disabled,'late settings must preserve the Restore requirement');
console.log('TARGET_RECOVERY_UI_PASSED: Restore blocks Install, late-settings/action guards, re-enable after restore, Retry status preserved, explicit confirmation and critical failures.');

// Generic controls use real manifest declarations, not a preview-only widget.
x=boot(null,false,false,false,true);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.click('tweak-settings-example');assert(x.nodes.action.disabled);x.pump();
assert.match(x.nodes['dialog-settings'].textContent,/Log storage limit/);
assert.equal(x.nodes['dialog-settings'].getElementsByTagName('button').find(n=>n.id==='setting-profile-choice').textContent,'Stock');
x.click('setting-log_limit_mb-plus');x.click('setting-compress-toggle');x.click('setting-profile-choice');x.click('choice-option-1');
assert.equal(x.nodes['dialog-settings'].getElementsByTagName('button').find(n=>n.id==='setting-profile-choice').textContent,'Medium');
x.click('action');x.pump();
assert.deepEqual(Array.from(x.calls.find(a=>a[0]==='start-run')),['start-run','settings-example','log_limit_mb=25','compress=false','profile=medium']);
x=boot(null,false,false,false,true);x.states['settings-example']='installed';x.savedSettings['settings-example']='35';x.click('refresh');x.pump();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();x.click('tweak-settings-example');x.pump();
assert.match(x.nodes['dialog-settings'].textContent,/INSTALLED SETTINGS/);assert.match(x.nodes['dialog-settings'].textContent,/35 MB/);
assert.equal(x.nodes['dialog-settings'].getElementsByTagName('button').length,0);
// Closing/reopening discards a draft; stale replies cannot populate another dialog.
x=boot(null,false,false,false,true);x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.click('tweak-settings-example');x.pump();x.click('setting-log_limit_mb-minus');x.click('back');x.click('tweak-settings-example');x.pump();
assert.match(x.nodes['dialog-settings'].textContent,/20 MB/);
for(let n=0;n<8 && !(x.doc.activeElement.id||'').startsWith('setting-');n++)controller('onkeydown',78);
assert(x.doc.activeElement.id.indexOf('setting-')===0);
// Choice navigation is a local transaction: focus, cancel, commit and stale handlers.
x=boot(null,false,false,false,true);x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();x.click('tweak-settings-example');x.pump();
x.click('setting-profile-choice');assert.equal(x.doc.activeElement.id,'choice-option-0');let picker=x.doc.getElementById('choice-picker');assert(picker);let callsBeforePicker=x.calls.length;
controller('onkeydown',77);assert.equal(x.doc.activeElement.id,'choice-option-1');controller('onkeyup',8);assert(!x.doc.getElementById('choice-picker'));assert.equal(x.doc.activeElement.id,'setting-profile-choice');assert.equal(x.doc.activeElement.textContent,'Stock');assert.equal(x.calls.length,callsBeforePicker);
x.click('setting-profile-choice');let staleChoice=x.doc.getElementById('choice-option-2').onclick;controller('onkeydown',77);controller('onkeydown',13);assert.equal(x.doc.activeElement.id,'setting-profile-choice');assert.equal(x.doc.activeElement.textContent,'Medium');assert(!x.doc.getElementById('choice-picker'));
x.click('setting-profile-choice');assert.equal(x.doc.activeElement.id,'choice-option-1');x.click('choice-cancel');assert.equal(x.doc.activeElement.textContent,'Medium');staleChoice();assert.equal(x.doc.activeElement.textContent,'Medium');
x.click('setting-profile-choice');controller('onkeydown',27);assert(!x.doc.getElementById('choice-picker'));assert.equal(x.doc.activeElement.id,'setting-profile-choice');
console.log('CHOICE_PICKER_UI_PASSED: >=3 options, marked/focused current value, controller selection, Back/Escape/click cancellation, trigger focus and stale-handler guards.');
console.log('SETTINGS_UI_PASSED: generic fields, parameter arrays, saved read-only values, draft cancellation and controller access.');

assert.equal(parseConf('shim-example',fs.readFileSync(path.join(ROOT,'../development/examples/shim/manifest.conf'),'utf8')).shim_service,'jciMMUI');

// Compatibility belongs to details, not the fast scan; warnings remain actionable.
x=boot(null,false,false,false,false,true);
assert(!x.calls.some(a=>a[0]==='preflight-info'));
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.preflight['bundle-example']=x.ok('block\tNo compatible HUD.\n',1);
x.click('tweak-bundle-example');assert(x.nodes.action.disabled);x.pump();
assert(x.nodes.action.disabled);assert.match(x.nodes['dialog-description'].textContent,/Cannot install: No compatible HUD/);
x.click('back');x.preflight['bundle-example']=x.ok('warning\tNo extra function in this region.\n');
x.click('tweak-bundle-example');x.pump();assert(!x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Note: No extra function/);
x.click('back');x.preflight['bundle-example']=x.ok('info\tSupported HUD detected.\n');
x.click('tweak-bundle-example');x.pump();assert(!x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Info: Supported HUD detected/);
x.click('back');x.preflight['bundle-example']=x.ok('info\tSupported HUD detected.\nwarning\tLimited functionality in this region.\n');
x.click('tweak-bundle-example');x.pump();assert(!x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Info: Supported HUD detected/);
assert.match(x.nodes['dialog-description'].textContent,/Note: Limited functionality in this region/);
x.click('back');x.preflight['bundle-example']=x.ok('info\tSupported HUD detected.\nblock\tIncompatible hardware.\n',1);
x.click('tweak-bundle-example');x.pump();assert(x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Info: Supported HUD detected/);
assert.match(x.nodes['dialog-description'].textContent,/Cannot install: Incompatible hardware/);
x.click('back');x.preflight['bundle-example']=x.ok('info\tSupported HUD detected.\n');
// A stale blocked result must not lock the newly opened view.
x.click('back');x.click('tweak-bundle-example');const stale=x.jobs.splice(0);x.click('back');
x.click('tweak-bundle-example');for(const job of stale)x.event({type:'shell-result',token:'secret',id:job.id,result:x.ok('block\tStale HUD failure.\n',1)});
x.pump();assert(!x.nodes.action.disabled);assert.doesNotMatch(x.nodes['dialog-description'].textContent,/Stale HUD/);
x.click('back');x.states['bundle-example']='installed';x.click('refresh');x.pump();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
const before=x.calls.filter(a=>a[0]==='preflight-info').length;
x.click('tweak-bundle-example');x.pump();assert.equal(x.nodes.action.textContent,'Uninstall');assert(!x.nodes.action.disabled);
assert.equal(x.calls.filter(a=>a[0]==='preflight-info').length,before,'Hardware failure must not block saved uninstall');
console.log('COMPATIBILITY_UI_PASSED: detail-only bounded queries, hard block, soft warning, info message, stale replies and unrestricted saved uninstall.');

// Non-bundle tweak preflight info (Touchscreen While Driving)
x=boot(null,false,false,false,false,false);
x.usb.ids=['touch-while-driving'];
x.states['touch-while-driving']='uninstalled';
x.preflight['touch-while-driving']=x.ok('info\tTouchscreen while driving is already enabled. Install to disable additional menu operation restriction.\n');
x.click('refresh');x.pump();
x.click('tweak-touch-while-driving');x.pump();
assert(!x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Info: Touchscreen while driving is already enabled/);
x.click('back');
x.preflight['touch-while-driving']=x.ok();
x.click('tweak-touch-while-driving');x.pump();
assert(!x.nodes.action.disabled);
assert.doesNotMatch(x.nodes['dialog-description'].textContent,/Info: Touchscreen while driving/);
x.click('back');
x.preflight['touch-while-driving']=x.ok('',1,'Cannot read valid speed restriction settings.');
x.click('tweak-touch-while-driving');x.pump();
assert(x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Cannot read valid speed restriction settings/);

const touchManifest=parseConf('touch-while-driving',fs.readFileSync(path.join(ROOT,'tweaks/touch-while-driving/manifest.conf'),'utf8'));
assert.equal(touchManifest.preflight,true);
assert.throws(()=>parseConf('touch-while-driving',fs.readFileSync(path.join(ROOT,'tweaks/touch-while-driving/manifest.conf'),'utf8').replace('preflight=true','preflight=yes')));

// Non-bundle tweak preflight info (HUD Street Name)
x=boot(null,false,false,false,false,false);
x.usb.ids=['hud-street-name'];
x.states['hud-street-name']='uninstalled';
x.recovery['hud-street-name']='original\n';
x.preflight['hud-street-name']=x.ok('info\tDetected compatible color Windshield HUD.\n');
x.click('refresh');x.pump();
x.click('tweak-hud-street-name');x.pump();
assert(!x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Info: Detected compatible color Windshield HUD/);
x.click('back');
x.preflight['hud-street-name']=x.ok('block\tDetected unsupported Combiner HUD (monochrome).\n',1);
x.click('tweak-hud-street-name');x.pump();
assert(x.nodes.action.disabled);
assert.match(x.nodes['dialog-description'].textContent,/Cannot install: Detected unsupported Combiner HUD/);

const hudManifest=parseConf('hud-street-name',fs.readFileSync(path.join(ROOT,'tweaks/hud-street-name/manifest.conf'),'utf8'));
assert.equal(hudManifest.preflight,true);
assert.throws(()=>parseConf('hud-street-name',fs.readFileSync(path.join(ROOT,'tweaks/hud-street-name/manifest.conf'),'utf8').replace('preflight=true','preflight=yes')));

const clusterManifest=parseConf('cluster-language',fs.readFileSync(path.join(ROOT,'tweaks/cluster-language/manifest.conf'),'utf8'));
assert.equal(clusterManifest.settingDefs[0].key,'hud_display_language');
assert.equal(clusterManifest.settingDefs[0].default,'off');
assert.equal(clusterManifest.components,'components.tsv');
console.log('CLUSTER_MANIFEST_UI_PASSED: real test tweak defaults and generic settings schema.');

// Long status messages retain all text in small, controller-reachable sections.
x=boot();
x.states.ssh='unavailable';
x.reasons.ssh=('A long diagnostic line with details. ').repeat(18)+'Final diagnostic details';
x.click('refresh');x.pump();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
x.click('tweak-ssh');x.pump();
const chunks=x.nodes['dialog-state'].children;
assert(chunks.length>1);
for(const chunk of chunks){assert(chunk.textContent.length<=361);assert.equal(chunk.tagName,'button');}
assert(x.nodes['dialog-state'].textContent.includes(x.reasons.ssh));
assert.equal(chunks[0].attributes['data-heading'],'DETAILS');for(const chunk of chunks.slice(1))assert.equal(chunk.attributes['data-heading'],'CONTINUED');
console.log('DETAIL_SECTIONS_PASSED: bounded sections preserve long diagnostics and use controller focus navigation.');

x=boot();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
assert.equal(x.nodes['list-position'].children.length,x.nodes.cards.children.length);
x.nodes.cards.children[1].onfocus();
assert.equal(x.nodes['list-position'].children.filter(n=>n.className.includes('active')).length,1);
assert(x.nodes['list-position'].children[1].className.includes('active'));
assert(parseFloat(x.nodes['list-position'].children[1].style.height)>parseFloat(x.nodes['list-position'].children[0].style.height));
assert.equal(x.nodes['footer-status'].textContent,'');
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();
assert.equal(x.nodes['list-position'].children.length,x.nodes.cards.children.length);
assert.equal(x.nodes['list-position'].children.filter(n=>n.className.includes('active')).length,1);
console.log('LIST_POSITION_PASSED: one segment per category entry, one active marker and category rebuild.');

x=boot();x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.click('tweak-list-beep');
assert.match(x.nodes['dialog-meta'].textContent,/Original author; port by Example <developer>/);
assert.equal(x.nodes['dialog-meta'].tabIndex,0);
assert.equal(x.nodes['dialog-meta'].getElementsByTagName('button').length,0);
x.click('back');assert.equal(x.nodes['dialog-contributors'].textContent,'');
assert.equal(parseConf('list-beep',rawConf+'contributors=Name $(literal) <text>\n').contributors,'Name $(literal) <text>');
assert.throws(()=>parseConf('list-beep',rawConf+'contributors=A\ncontributors=B\n'));
console.log('CONTRIBUTORS_PASSED: optional literal attribution, focusable details and stale-view cleanup.');

x=boot();
assert.equal(x.nodes['list-position'].children.length,1);
assert(Number.isFinite(parseFloat(x.nodes['list-position'].children[0].style.height)));
assert.equal(parseFloat(x.nodes['list-position'].children[0].style.top),0);
console.log('DYNAMIC_POSITION_PASSED: enlarged selected segment, finite single-entry geometry and no idle footer prompt.');

const guiConf=fs.readFileSync(path.join(ROOT,'../development/examples/gui-extension/manifest.conf'),'utf8');
assert.equal(parseConf('gui-example',guiConf).gui_menu_path,'');
for(const bad of [guiConf.replace('gui_api=1','gui_api=2'),guiConf.replace('gui_menu_path=','gui_menu_path=Tools//Examples'),guiConf.replace('assets/view.html','assets/../view.html'),guiConf.replace('reset_entrypoint=reset.sh\n','')]) assert.throws(()=>parseConf('gui-example',bad));
assert.throws(()=>parseConf('games',guiConf.replace('id=gui-example','id=games')));
assert.equal(parseConf('gui-example',guiConf+'gui_resident=assets/resident.js\ngui_service=assets/service/entry.lua\n').gui_service,'assets/service/entry.lua');
for(const extra of ['gui_resident=\n','gui_resident=assets/resident.js\ngui_service=\n','gui_service=assets/service.lua\n','gui_resident=assets/../resident.js\n','gui_resident=assets/resident.lua\n','gui_resident=assets/resident.js\ngui_service=assets/service.js\n'])assert.throws(()=>parseConf('gui-example',guiConf+extra));
console.log('GUI_MANIFEST_UI_PASSED: neutral extension, API, parent, path, reset and reserved ID checks.');

const options64=Array.from({length:64},(_,i)=>'opt'+String(i).padStart(2,'0'));
x=boot(null,false,false,false,true);x.savedSettings.schemaText=fs.readFileSync(path.join(ROOT,'../development/examples/settings/manifest.conf'),'utf8').replace('profile.default=stock','profile.default=opt00').replace('stock medium large',options64.join(' '));
x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();x.click('tweak-settings-example');x.pump();x.click('setting-profile-choice');assert.equal(x.doc.getElementById('choice-picker').getElementsByTagName('button').length,65);for(let i=0;i<12;i++)controller('onkeydown',77);assert.equal(x.doc.activeElement.id,'choice-option-12');assert(x.doc.getElementById('choice-picker').children[1].scrollTop>0);controller('onkeydown',13);assert.equal(x.doc.activeElement.textContent,'Opt12');
console.log('CHOICE_SCROLL_UI_PASSED: 64 options, controller focus visibility and selected value.');

x=boot(null,false,false,false,true);x.savedSettings.schemaText=fs.readFileSync(path.join(ROOT,'../development/examples/settings/manifest.conf'),'utf8').replace('stock medium large','stock medium');x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();x.click('tweak-settings-example');x.pump();x.click('setting-profile-choice');assert(!x.doc.getElementById('choice-picker'));assert.equal(x.doc.getElementById('setting-profile-choice').textContent,'Medium');x.click('setting-profile-choice');assert.equal(x.doc.getElementById('setting-profile-choice').textContent,'Stock');
console.log('TWO_CHOICE_UI_PASSED: two options retain direct cycling without a picker.');

// Descriptions are one semantic field regardless of an arbitrary character count.
x=boot(null,false,false,false,false,true);x.preflight['bundle-example']=x.ok('warning\t'+('Language compatibility details '.repeat(11))+'overridden\n');x.nodes.tabs.children.find(n=>n.textContent.indexOf('System')===0).onclick();x.click('tweak-bundle-example');x.pump();const descriptionParts=x.nodes['dialog-description'].children;assert.equal(descriptionParts.length,1);assert.equal(descriptionParts[0].attributes['data-heading'],'DESCRIPTION');assert(x.nodes['dialog-description'].textContent.includes('overridden'));const descriptionField=descriptionParts[0];descriptionField.clientHeight=190;descriptionField.scrollHeight=500;descriptionField.focus();controller('onkeydown',40);assert.equal(x.doc.activeElement,descriptionField);assert.equal(descriptionField.scrollTop,46);controller('onkeydown',38);assert.equal(descriptionField.scrollTop,0);
console.log('DESCRIPTION_FIELD_PASSED: one continuous field, complete warning text and controller scrolling for genuinely long descriptions.');

// Refresh discovers changed USB content rather than only rechecking old states.
x=boot();
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();
x.click('tweak-list-beep');x.click('back');
x.usb.ids=['list-beep','hello'];x.states.hello='uninstalled';
x.usb.manifests['list-beep']=fs.readFileSync(path.join(ROOT,'tweaks/list-beep/manifest.conf'),'utf8')
 .replace(/^name=.*$/m,'name=Updated tweak').replace(/^description=.*$/m,'description=Updated USB description')
 .replace(/^version=.*$/m,'version=9.8.7').replace(/^group=.*$/m,'group=traffic-jam');
const beforeRefresh=x.calls.length;
x.click('refresh');assert(x.nodes.refresh.disabled);assert(x.nodes.cards.children.every(n=>n.disabled));x.pump();
assert(x.calls.slice(beforeRefresh).some(a=>a[0]==='list'));
assert.equal(x.calls.slice(beforeRefresh).filter(a=>a[0]==='manifest').length,2);
assert.equal(x.nodes.tabs.children.length,2);assert(!x.nodes.tabs.textContent.includes('Interface'));
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Traffic Jam')===0).onclick();
assert.equal(x.nodes.cards.children.length,1);assert(x.nodes.cards.textContent.includes('Updated tweak'));
x.click('tweak-list-beep');assert.match(x.nodes['dialog-description'].textContent,/Updated USB description/);assert(x.nodes['dialog-meta'].textContent.includes('9.8.7'));x.click('back');
x.click('refresh');x.pump();assert.equal(x.nodes.cards.children.length,1,'repeated discovery must not duplicate tweaks');
x.usb.ids=['hello'];x.click('refresh');x.pump();assert.equal(x.nodes.tabs.children.length,1);assert.equal(x.nodes.cards.children.length,1);assert.equal(x.nodes.cards.firstChild.id,'tweak-hello');
x.usb.ids=[];x.click('refresh');x.pump();assert.equal(x.nodes.tabs.children.length,0);assert.equal(x.nodes.cards.children.length,0);assert.equal(x.nodes.refresh.disabled,false);
console.log('FULL_REFRESH_PASSED: reread USB list/manifests, changed metadata/category, added/removed tweaks, disabled stale cards and no duplicates.');

// Updates are offered only for a higher USB version, beside saved Uninstall.
function updateOffer(usbVersion,installedVersion){
 const r=boot();r.usb.manifests['list-beep']=fs.readFileSync(path.join(ROOT,'tweaks/list-beep/manifest.conf'),'utf8').replace(/^version=.*$/m,'version='+usbVersion);
 r.usb.installedVersions['list-beep']=installedVersion;r.usb.updateOffers['list-beep']=r.ok('available\t'+installedVersion+'\t'+usbVersion+'\n');
 r.states['list-beep']='installed';r.click('refresh');r.pump();r.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();r.click('tweak-list-beep');r.pump();return r;
}
for(const [u,i] of [['1.2.0','1.2.0'],['1.2.0','1.10.0'],['1.0.0','2.0.0']]){
 const r=updateOffer(u,i);assert(r.nodes['update-action'].className.includes('hidden'));assert.equal(r.nodes.action.textContent,'Uninstall');assert(!r.calls.some(a=>a[0]==='update-info'));
}
x=updateOffer('1.10.0','1.2.0');assert(!x.nodes['update-action'].className.includes('hidden'));assert(!x.nodes['update-action'].disabled);assert.equal(x.nodes.action.textContent,'Uninstall');
x.click('update-action');assert.equal(x.nodes['dialog-title'].textContent,'Update: No List Beep');x.click('back');x.pump();assert.equal(x.nodes.action.textContent,'Uninstall');assert(!x.calls.some(a=>a[0]==='action'&&a[2]==='update'));
x.click('update-action');x.click('action');assert.equal(x.nodes['dialog-state'].textContent,'Updating');x.pump();assert(x.calls.some(a=>JSON.stringify(a)===JSON.stringify(['action','list-beep','update','1.10.0'])));assert.equal(x.states['list-beep'],'installed');assert.equal(x.nodes['dialog-state'].textContent,'Update completed');
x=updateOffer('2.0.0','1.0.0');x.usb.updateOffers['list-beep']=x.ok('',1,'Dependent package blocks replacement.');x.click('back');x.click('tweak-list-beep');x.pump();assert(x.nodes['update-action'].disabled);assert.match(x.nodes['dialog-description'].textContent,/Update unavailable/);assert.equal(x.nodes.action.textContent,'Uninstall');
console.log('INSTALLER_UPDATES_PASSED: version ordering, eligibility, confirmation, cancellation and version-pinned action.');

x=boot();const pollFocus=x.intervals[1];assert.equal(typeof pollFocus,'function');
let focusBefore=x.calls.filter(a=>a[0]==='focus').length;
pollFocus();x.pump();assert.equal(x.calls.filter(a=>a[0]==='focus').length,focusBefore);
x.usb.refocusRequested=true;pollFocus();pollFocus();x.pump();
assert.equal(x.calls.filter(a=>a[0]==='focus').length,focusBefore+1);
assert(x.calls.some(a=>a[0]==='event'&&a[1]==='refocus-ready'));
pollFocus();x.pump();assert.equal(x.calls.filter(a=>a[0]==='focus').length,focusBefore+1);
x.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();x.click('tweak-list-beep');x.pump();x.click('action');
x.usb.refocusRequested=true;const pendingRequests=x.jobs.length;pollFocus();assert.equal(x.jobs.length,pendingRequests,'No focus polling during a worker');
x.pump();pollFocus();x.pump();assert.equal(x.calls.filter(a=>a[0]==='focus').length,focusBefore+2);
console.log('REPLUG_FOCUS_UI_PASSED: explicit request only, coalescing, no idle focus stealing and deferred while operating.');

function installedWithConfig(){const r=boot();r.usb.configPresent=true;r.states['list-beep']='installed';r.click('refresh');r.pump();r.nodes.tabs.children.find(n=>n.textContent.indexOf('Interface')===0).onclick();r.click('tweak-list-beep');r.pump();r.click('action');r.pump();return r;}
x=installedWithConfig();assert.equal(x.nodes['dialog-title'].textContent,'Keep configuration?');assert(!x.calls.some(a=>a[0]==='action'&&a[2]==='uninstall'));x.click('action');x.pump();assert(x.calls.some(a=>a[0]==='action'&&a[2]==='uninstall'&&a[3]==='--preserve-config'));
x=installedWithConfig();x.click('back');x.pump();assert(x.calls.some(a=>a[0]==='action'&&a[2]==='uninstall'&&a.length===3));
console.log('MUTABLE_CONFIG_UI_PASSED: keep/remove only for declared configs, explicit CLI flag and no question for other tweaks.');
