import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyInstallPlan, applyUninstallPlan, applyPendingRecovery, buildInstallPlan,
  buildUninstallPlan, compareSemver, inspectPendingRecovery, readOwnership,
} from '../../lib/install-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hostsDir = path.join(root, 'hosts');
const skillPath = '.agents/skills/dw-start/SKILL.md';
const skillText = fs.readFileSync(path.join(root,'skills/dw-start/SKILL.md'));

function tempProject() {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'dw-r3-test-'));
  return {parent, clean:()=>fs.rmSync(parent,{recursive:true,force:true})};
}
function source(version='1.0.0', extras={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-r3-source-'));
  fs.mkdirSync(path.join(dir,'skills/dw-start'),{recursive:true});
  fs.writeFileSync(path.join(dir,'skills/dw-start/SKILL.md'),`${skillText}\n# ${version}\n`);
  fs.writeFileSync(path.join(dir,'VERSION'),`${version}\n`);
  for(const [rel,contents] of Object.entries(extras)) {
    const f=path.join(dir,'skills/dw-start/references',rel);
    fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,contents);
  }
  return {dir,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function install(project,src,host='codex',opts={}){
  const plan=buildInstallPlan({sourceRoot:src,projectRoot:project,hostsDir,host,...opts});
  assert.deepEqual(plan.conflicts,[],JSON.stringify(plan.conflicts));
  return applyInstallPlan(plan);
}
function journalPath(project){return path.join(project,'.dev-workflow/installs/.txn-journal.json');}

test('R3-REG-SEMVER-01: prerelease numeric ordering and strict parsing',()=>{
  assert.ok(compareSemver('1.0.0-beta.2','1.0.0-beta.10')<0);
  assert.ok(compareSemver('1.0.0-beta.10','1.0.0-rc.1')<0);
  assert.ok(compareSemver('1.0.0-rc.1','1.0.0')<0);
  assert.equal(compareSemver('1.2.3+meta','1.2.3+other'),0);
  assert.throws(()=>compareSemver('1.2.3garbage','1.2.3'),/Invalid SemVer/);
});

test('R3-REG-JOURNAL-01/02/03: hostile WAL cannot erase non-owned paths or ledger directory',()=>{
  const w=tempProject();
  try {
    fs.mkdirSync(path.dirname(journalPath(w.parent)),{recursive:true});
    fs.writeFileSync(path.join(w.parent,'README.md'),'SENTINEL');
    const tid='01234567-89ab-4cde-8fab-0123456789ab';
    const base={schema_version:2,transaction_id:tid,operation:'install',host:'codex',scope:'project',mode:'skills',target_root:'.agents/skills',status:'in_progress',backupDir:`.dev-workflow/installs/.txn-backup-install-${tid}`,undoEntries:[]};
    for(const variant of [
      {...base,undoEntries:[{type:'delete_created',state:'applied',relative_path:'README.md',after_sha:'0'.repeat(64),before_sha:null}]},
      {...base,backupDir:'.dev-workflow/installs'},
      {...base,undoEntries:[{type:'shell',relative_path:skillPath}]},
    ]){
      fs.writeFileSync(journalPath(w.parent),JSON.stringify(variant));
      assert.throws(()=>applyPendingRecovery({projectRoot:w.parent}),/journal|Journal|Untrusted|backup|Unsafe/i);
      assert.equal(fs.readFileSync(path.join(w.parent,'README.md'),'utf8'),'SENTINEL');
    }
  } finally{w.clean();}
});

test('R3-REG-CREATE-RACE-01: competing writer is not deleted when exclusive create fails',()=>{
  const w=tempProject(),src=source();
  const originalLink=fs.linkSync;
  let triggered=false;
  try{
    const plan=buildInstallPlan({sourceRoot:src.dir,projectRoot:w.parent,hostsDir,host:'codex'});
    fs.linkSync=function(from,to){
      if(!triggered && to.endsWith(path.join('dw-start','SKILL.md'))){
        triggered=true;
        fs.writeFileSync(to,'EXTERNAL WRITER');
      }
      return originalLink.call(this,from,to);
    };
    assert.throws(()=>applyInstallPlan(plan),/EEXIST|file already exists/i);
    assert.equal(fs.readFileSync(path.join(w.parent,skillPath),'utf8'),'EXTERNAL WRITER');
    assert.ok(fs.existsSync(journalPath(w.parent)),'Ambiguous transaction journal should be retained');
  }finally{fs.linkSync=originalLink;src.clean();w.clean();}
});

test('R3-REG-SHARED-FILESET-01: cross-host coordinated upgrade retains new references until final consumer leaves',()=>{
  const w=tempProject(),old=source('1.0.0'),newer=source('2.0.0',{'new.md':'New reference\n'});
  try{
    install(w.parent,old.dir,'codex');
    install(w.parent,newer.dir,'grok-build',{upgradeShared:true});
    const codex=readOwnership({scopeRoot:w.parent,host:'codex',scope:'project',mode:'skills',hostsDir});
    assert.ok(codex.data.files['.agents/skills/dw-start/references/new.md']);
    const removal=buildUninstallPlan({projectRoot:w.parent,hostsDir,host:'grok-build',scope:'project',sourceRoot:newer.dir});
    applyUninstallPlan(removal);
    assert.ok(fs.existsSync(path.join(w.parent,'.agents/skills/dw-start/references/new.md')));
  }finally{old.clean();newer.clean();w.clean();}
});

test('R3-REG-RECOVERY-WIP-01: crash journal refuses to overwrite modified target',()=>{
  const w=tempProject(),old=source('1.0.0'),newer=source('2.0.0');
  try{
    install(w.parent,old.dir);
    const plan=buildInstallPlan({sourceRoot:newer.dir,projectRoot:w.parent,hostsDir,host:'codex'});
    assert.throws(()=>applyInstallPlan(plan,{onPhase:phase=>{if(phase==='before_ledger_commit'||phase==='before_rollback_restore')throw Error('injected failure');}}),/injected failure/);
    const target=path.join(w.parent,skillPath);
    fs.writeFileSync(target,'USER MODIFIED AFTER CRASH');
    assert.throws(()=>applyPendingRecovery({projectRoot:w.parent}),/Recovery|recover|changed|rollback/i);
    assert.equal(fs.readFileSync(target,'utf8'),'USER MODIFIED AFTER CRASH');
    assert.ok(fs.existsSync(journalPath(w.parent)));
  }finally{old.clean();newer.clean();w.clean();}
});

test('R3-REG-SHARED-FILESET-02: coordinated upgrade retires old references for all consumers',()=>{
  const w=tempProject(),old=source('1.0.0',{'legacy.md':'OLD\n'}),newer=source('2.0.0',{'fresh.md':'NEW\n'});
  try{
    install(w.parent,old.dir,'codex');
    const plan=buildInstallPlan({sourceRoot:newer.dir,projectRoot:w.parent,hostsDir,host:'grok-build',upgradeShared:true});
    assert.ok(plan.actions.some(a=>a.kind==='delete_shared_stale' && a.relative_path.endsWith('legacy.md')));
    assert.deepEqual(plan.conflicts,[]);
    applyInstallPlan(plan);
    assert.equal(fs.existsSync(path.join(w.parent,'.agents/skills/dw-start/references/legacy.md')),false);
    const rec=readOwnership({scopeRoot:w.parent,host:'codex',scope:'project',mode:'skills',hostsDir});
    assert.ok(rec.data.files['.agents/skills/dw-start/references/fresh.md']);
    assert.equal(rec.data.files['.agents/skills/dw-start/references/legacy.md'],undefined);
  }finally{old.clean();newer.clean();w.clean();}
});

test('R3-REG-RECOVERY-WIP-02: rollback never deletes a created file modified after interrupted install',()=>{
  const w=tempProject(),src=source();
  try{
    fs.mkdirSync(path.join(src.dir,'skills/dw-build'),{recursive:true});
    fs.copyFileSync(path.join(root,'skills/dw-build/SKILL.md'),path.join(src.dir,'skills/dw-build/SKILL.md'));
    const plan=buildInstallPlan({sourceRoot:src.dir,projectRoot:w.parent,hostsDir,host:'codex'});
    let seen=0;
    assert.throws(()=>applyInstallPlan(plan,{
      onBeforeAction:()=>{if(++seen===2)throw Error('Simulated interruption');},
      onPhase:phase=>{if(phase==='before_rollback_restore')throw Error('Recovery deferred');}
    }),/Simulated interruption/);
    const created=path.join(w.parent,plan.actions[0].relative_path);
    fs.writeFileSync(created,'CHANGED AFTER INTERRUPTION');
    assert.throws(()=>applyPendingRecovery({projectRoot:w.parent}),/Recovery encountered rollback errors/i);
    assert.equal(fs.readFileSync(created,'utf8'),'CHANGED AFTER INTERRUPTION');
    assert.equal(fs.existsSync(journalPath(w.parent)),true);
  }finally{src.clean();w.clean();}
});

test('R3-REG-RECOVERY-IDEMPOTENT-01: recovery on clean crash leaves consistent state and can repeat safely',()=>{
  const w=tempProject(),old=source('1.0.0'),newer=source('2.0.0');
  try{
    install(w.parent,old.dir);
    const plan=buildInstallPlan({sourceRoot:newer.dir,projectRoot:w.parent,hostsDir,host:'codex'});
    assert.throws(()=>applyInstallPlan(plan,{
      onPhase:phase=>{if(['before_ledger_commit','before_rollback_restore'].includes(phase))throw Error('Stop transaction');}
    }),/Stop transaction/);
    assert.equal(fs.existsSync(journalPath(w.parent)),true);
    const recovered=applyPendingRecovery({projectRoot:w.parent});
    assert.equal(recovered.recovered,true);
    assert.equal(fs.existsSync(journalPath(w.parent)),false);
    const again=applyPendingRecovery({projectRoot:w.parent});
    assert.equal(again.nothingToRecover,true);
    assert.ok(fs.readFileSync(path.join(w.parent,skillPath),'utf8').includes('1.0.0'));
  }finally{old.clean();newer.clean();w.clean();}
});
