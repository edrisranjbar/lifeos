window.mountNotepadHistory = ({ activeNote, save, checkSnapshot }) => {
  const {t} = window.lifeOsI18n;
  const make = (tag, text, cls) => { const el=document.createElement(tag); if(text) el.textContent=text; if(cls) el.className=cls; return el; };
  const dialog=make('dialog',null,'revision-dialog');
  dialog.setAttribute('aria-labelledby','revisionHeading');
  const header=make('header'), heading=make('h2',t('Version history')); heading.id='revisionHeading';
  const close=make('button',t('Close')); close.type='button'; close.onclick=()=>dialog.close(); header.append(heading,close);
  const help=make('p',t('Preview a saved version. Restoring keeps your current text in history.'),'revision-help');
  const label=make('label',t('Document')); label.htmlFor='revisionDocument';
  const select=make('select'); select.id='revisionDocument';
  const layout=make('div',null,'revision-layout'), list=make('div',null,'revision-list'), detail=make('div',null,'revision-detail');
  list.setAttribute('aria-label',t('Saved versions'));
  const previewTitle=make('h3'), preview=make('textarea'); preview.readOnly=true; preview.dir='auto'; preview.setAttribute('aria-label',t('Version preview'));
  const restore=make('button',t('Restore this version'),'revision-restore'); restore.type='button'; restore.disabled=true;
  const status=make('p',null,'revision-status'); status.setAttribute('role','status');
  detail.append(previewTitle,preview,restore); layout.append(list,detail); dialog.append(header,help,label,select,layout,status); document.body.append(dialog);
  let selected=null, generation=0, busy=false;
  const request=async path=>{const r=await fetch('/notepad-history.php'+path,{cache:'no-store',headers:{Accept:'application/json'},redirect:'error'});const d=await r.json();if(!r.ok)throw Error(d.error||t('Unable to load history.'));return d;};
  const date=value=>new Intl.DateTimeFormat(window.lifeOsI18n.locale('en-GB'),{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Tehran'}).format(new Date(value));
  async function versions(before=null) {
    const token=generation, note=select.value;
    if(!before){list.replaceChildren();selected=null;preview.value='';previewTitle.textContent='';restore.disabled=true;}
    try {
      const d=await request('?note='+encodeURIComponent(note)+(before?'&before='+encodeURIComponent(before):''));
      if(token!==generation||note!==select.value)return;
      if(!d.revisions.length&&!before)status.textContent=t('No saved versions yet.');
      for(const row of d.revisions){
        const button=make('button',date(row.created_at)+(row.event==='deleted'?' · '+t('Deleted'):''));button.type='button';button.dataset.revision=row.id;
        button.onclick=async()=>{
          const pick=++generation; restore.disabled=true; status.textContent=t('Loading…');
          try{const d=await request('?revision='+encodeURIComponent(row.id));if(pick!==generation)return;
            selected=d;previewTitle.textContent=d.note.title||t('Untitled note');preview.value=d.note.body||'';
            list.querySelectorAll('[data-revision]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
            restore.disabled=false;status.textContent=date(d.created_at)+' · '+t('Tehran time');
          }catch(e){if(pick===generation)status.textContent=e.message;}
        };list.append(button);
      }
      if(d.revisions.length===50){const more=make('button',t('Load older versions'));more.type='button';more.onclick=()=>{more.remove();versions(d.revisions.at(-1).id);};list.append(more);}
    }catch(e){status.textContent=e.message;}
  }
  select.onchange=()=>{generation++;status.textContent='';versions();};
  document.getElementById('noteHistory').onclick=async()=>{
    if(busy)return;busy=true;
    try{
      if(!await save())throw Error(t('Save failed. Copy your edits and reload before restoring.'));
      const d=await request('');select.replaceChildren();
      for(const row of d.documents){const option=make('option',row.title||t('Untitled note'));option.value=row.note_id;select.append(option);}
      if([...select.options].some(o=>o.value===activeNote().id))select.value=activeNote().id;
      generation++;status.textContent='';dialog.showModal();versions();
    }catch(e){document.getElementById('saveStatus').textContent=e.message;}
    finally{busy=false;}
  };
  restore.onclick=async()=>{
    if(!selected||busy)return;
    if(!confirm(t('Restore this version? Your current version will remain in history.')))return;
    if(!checkSnapshot()){status.textContent=t('This document changed elsewhere. Copy your edits and reload.');return;}
    busy=true;restore.disabled=true;select.disabled=true;close.disabled=true;
    try{
      await appStorage.mutateItem('edi_notepad_v1',async({csrf,revision})=>{
        const r=await fetch('/notepad-history.php',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({revision:selected.id,expectedRevision:revision})});
        const d=await r.json();if(!r.ok){const e=Error(d.error||t('Restore failed.'));e.stateConflict=r.status===409;throw e;}return d;
      });
      location.reload();
    }catch(e){status.textContent=e.message;restore.disabled=false;select.disabled=false;close.disabled=false;busy=false;}
  };
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{generation++;document.getElementById('noteHistory').focus();});
};
