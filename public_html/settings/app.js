(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', currentUserId = null, isAdmin = false, editingUser = null, savingUser = false;
  const roleName = role => role === 'admin' ? 'Administrator' : 'Member';
  const joined = value => { const date = new Date(String(value).replace(' ', 'T')); return Number.isNaN(date.getTime()) ? '' : `Joined ${date.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'})}`; };
  const pill = (text, kind) => { const node = document.createElement('span'); node.className = `pill ${kind}`; node.textContent = text; return node; };
  const status = (id, text, kind = '') => { $(id).textContent = text; $(id).className = `status ${kind}`; };
  async function request(url, body) {
    const response = await fetch(url, {method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', headers: {Accept:'application/json', ...(body ? {'Content-Type':'application/json','X-CSRF-Token':csrf} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
    let data;
    try { data = await response.json(); } catch { throw new Error('The server could not complete this request. Reload and try again.'); }
    if (!response.ok) throw new Error(data.error || 'Could not complete the request.');
    return data;
  }
  const initials = name => Array.from(name || '?').slice(0,2).join('').toUpperCase();
  function setAccount(name) {
    $('accountName').textContent = name;
    $('accountAvatar').textContent = initials(name);
    $('username').value = name;
  }
  async function loadAccount() {
    try {
      const data = await request('/credentials.php');
      csrf = data.csrf; currentUserId = data.user_id; setAccount(data.username); loadMail();
      isAdmin = data.role === 'admin';
      $('accountRole').textContent = `${roleName(data.role)} · Private workspace`;
      // Only administrators can manage accounts; members never see the section.
      $('people').hidden = !isAdmin; $('peopleNav').hidden = !isAdmin;
      $('save').disabled = false; $('signOut').disabled = false;
      if (isAdmin) await loadUsers();
      spy();
    } catch (error) { $('accountName').textContent = 'Account unavailable'; status('message',error.message,'error'); }
  }
  function openUser(user = null) {
    editingUser = user;
    $('userForm').reset(); status('userFormMessage','');
    $('userDialogTitle').textContent = user ? 'Manage account' : 'Add account';
    $('userDialogHint').textContent = user ? 'Leave the password blank to keep it. Deactivation preserves this user’s data.' : 'A new account starts with an empty private workspace.';
    $('userUsername').value = user?.username || '';
    $('userPassword').required = !user; $('userConfirmPassword').required = !user;
    $('activeUserLabel').hidden = !user; $('userActive').checked = user?.active ?? true;
    $('saveUser').textContent = user ? 'Save account' : 'Create account';
    $('userDialog').showModal(); $('userUsername').focus();
  }
  async function loadUsers() {
    $('addUser').disabled = true; $('retryUsers').hidden = true; status('usersMessage','');
    try {
      const data = await request('/users.php');
      csrf = data.csrf; currentUserId = data.current_user_id;
      $('usersList').replaceChildren(); $('accountCount').textContent = String(data.users.length);
      for (const user of data.users) {
        const row = document.createElement('div'); row.className = `user-row${user.active ? '' : ' inactive'}`;
        const avatar = document.createElement('span'); avatar.className='avatar'; avatar.setAttribute('aria-hidden','true'); avatar.textContent=initials(user.username);
        const info = document.createElement('div'); info.className='user-info';
        const name = document.createElement('div'); name.className='user-name'; name.textContent=user.username;
        if (user.id === currentUserId) name.append(pill('You','you'));
        const meta = document.createElement('div'); meta.className='user-meta';
        meta.append(pill(roleName(user.role), user.role === 'admin' ? 'admin' : 'member'), pill(user.active ? 'Active' : 'Inactive', user.active ? 'active' : 'inactive'));
        const since = joined(user.created_at);
        if (since) { const date = document.createElement('span'); date.className='user-joined'; date.textContent=since; meta.append(date); }
        info.append(name,meta); row.append(avatar,info);
        if (user.id !== currentUserId) {
          const edit = document.createElement('button'); edit.type='button'; edit.className='secondary'; edit.textContent='Manage'; edit.setAttribute('aria-label',`Manage ${user.username}`); edit.addEventListener('click',()=>openUser(user)); row.append(edit);
        }
        $('usersList').append(row);
      }
      $('addUser').disabled = false;
    } catch (error) { status('usersMessage',error.message,'error'); $('retryUsers').hidden=false; }
  }
  $('addUser').addEventListener('click',()=>openUser()); $('retryUsers').addEventListener('click',loadUsers);
  for (const id of ['closeUserDialog','cancelUserDialog']) $(id).addEventListener('click',()=>{ if (!savingUser) $('userDialog').close(); });
  $('userDialog').addEventListener('cancel',event=>{ if (savingUser) event.preventDefault(); });
  $('userDialog').addEventListener('close',()=>{ $('userForm').reset(); editingUser=null; });
  $('userForm').addEventListener('submit',async event=>{
    event.preventDefault(); if (savingUser || !$('userForm').reportValidity()) return;
    const body = {action:editingUser?'update':'create', id:editingUser?.id, username:$('userUsername').value.trim(), password:$('userPassword').value, confirm_password:$('userConfirmPassword').value, current_password:$('adminPassword').value, active:$('userActive').checked, role:'admin'};
    savingUser=true; $('saveUser').disabled=true; status('userFormMessage','Saving…');
    try { await request('/users.php',body); $('userDialog').close(); await loadUsers(); status('usersMessage',body.action==='create'?'Account created. They can sign in with their own password.':'Account updated.','success'); }
    catch (error) { status('userFormMessage',error.message,'error'); }
    finally { savingUser=false; $('saveUser').disabled=false; $('adminPassword').value=''; }
  });
  $('credentialsForm').addEventListener('submit',async event=>{
    event.preventDefault(); if (!$('credentialsForm').reportValidity()) return;
    $('save').disabled=true; status('message','Saving…');
    try {
      const data=await request('/credentials.php',{new_username:$('username').value.trim(),new_password:$('newPassword').value,confirm_password:$('confirmPassword').value,current_password:$('currentPassword').value});
      csrf=data.csrf; setAccount(data.username);
      for (const id of ['newPassword','confirmPassword','currentPassword']) $(id).value='';
      if (isAdmin) await loadUsers(); status('message','Account updated. Your other sessions will need to sign in again.','success');
    } catch (error) { status('message',error.message,'error'); }
    finally { $('save').disabled=false; }
  });
  $('signOut').addEventListener('click',async()=>{
    $('signOut').disabled=true; status('signOutMessage','Signing out…');
    try { const data=await request('/logout.php',{}); if (!data.ok) throw new Error('Could not sign out.'); window.top.location.href='/login.php'; }
    catch (error) { status('signOutMessage',error.message,'error'); $('signOut').disabled=false; }
  });
  const themeButtons=[...document.querySelectorAll('[data-theme-choice]')];
  const updateThemeButtons=()=>themeButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===document.documentElement.dataset.theme)));
  for (const currency of lifeOsCurrency.list) $('currency').append(new Option(`${currency.name} (${currency.unit})`,currency.code));
  window.appStorageReady.then(()=>{
    document.documentElement.dataset.theme=appStorage.getItem('edi_os_theme') || 'dark'; updateThemeButtons();
    $('currency').value=lifeOsCurrency.current().code; $('currency').disabled=false; themeButtons.forEach(button=>button.disabled=false);
    $('calendar').value=appStorage.getItem('edi_calendar_v1')==='jalali'?'jalali':'gregorian'; $('calendar').disabled=false;
  }).catch(()=>status('preferenceMessage','Unable to load preferences. Reload to try again.','error'));
  $('currency').addEventListener('change',async()=>{
    $('currency').disabled=true;
    try { appStorage.setItem(lifeOsCurrency.KEY,$('currency').value); await appStorage.flush(); status('preferenceMessage','Display currency saved.','success'); }
    catch (error) { status('preferenceMessage',error.message,'error'); }
    finally { $('currency').disabled=false; }
  });
  $('calendar').addEventListener('change',async()=>{
    $('calendar').disabled=true;
    try { appStorage.setItem('edi_calendar_v1',$('calendar').value); await appStorage.flush(); status('preferenceMessage','Calendar saved.','success'); }
    catch (error) { status('preferenceMessage',error.message,'error'); }
    finally { $('calendar').disabled=false; }
  });
  themeButtons.forEach(button=>button.addEventListener('click',async()=>{
    themeButtons.forEach(item=>item.disabled=true);
    try {
      const theme=button.dataset.themeChoice;
      for (const key of ['edi_os_theme','edifinance_theme','habittify_theme','edi_kanban_theme','edi_goals_theme','edi_notes_theme']) appStorage.setItem(key,theme);
      document.documentElement.dataset.theme=theme; updateThemeButtons(); await appStorage.flush(); status('preferenceMessage','Appearance saved.','success');
    } catch (error) { status('preferenceMessage',error.message,'error'); }
    finally { themeButtons.forEach(item=>item.disabled=false); }
  }));
  new MutationObserver(updateThemeButtons).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  // Highlight the section in view, not just the last clicked link.
  const navLinks=[...document.querySelectorAll('.settings-nav a')];
  const markCurrent=id=>navLinks.forEach(link=>link.getAttribute('href')===`#${id}` ? link.setAttribute('aria-current','location') : link.removeAttribute('aria-current'));
  navLinks.forEach(link=>link.addEventListener('click',()=>markCurrent(link.getAttribute('href').slice(1))));
  // The last cards can never reach the top, so at the page bottom pick the last one.
  let spyFrame=0;
  const spy=()=>{ cancelAnimationFrame(spyFrame); spyFrame=requestAnimationFrame(()=>{
    const cards=[...document.querySelectorAll('.settings-card')].filter(card=>!card.hidden);
    const atBottom=innerHeight+scrollY>=document.documentElement.scrollHeight-4;
    const current=atBottom ? cards.at(-1) : cards.filter(card=>card.getBoundingClientRect().top<=innerHeight*0.3).at(-1) || cards[0];
    if (current) markCurrent(current.id);
  }); };
  addEventListener('scroll',spy,{passive:true}); addEventListener('resize',spy);
  // Browser notifications for due items; the bell panel in the top bar shares this setting.
  import('/assets/due-alerts.js?v=due-alerts-1').then(due=>{
    const button=$('dueNotifyToggle');
    const sync=()=>{
      if (!due.notificationsSupported()) { button.hidden=true; $('dueNotifyHint').textContent='This browser does not support notifications.'; return; }
      const blocked=Notification.permission==='denied';
      button.disabled=blocked; button.textContent=due.notificationsEnabled()?'Turn off':'Turn on';
      if (blocked) $('dueNotifyHint').textContent='Notifications are blocked for this site. Allow them in your browser settings to turn this on.';
    };
    button.addEventListener('click',async()=>{
      try { if (due.notificationsEnabled()) due.disableNotifications(); else await due.enableNotifications(); status('preferenceMessage',due.notificationsEnabled()?'Due-date notifications are on for this device.':'Due-date notifications are off.','success'); }
      catch (error) { status('preferenceMessage',error.message,'error'); }
      sync();
    });
    sync();
  }).catch(()=>{ $('dueNotifyToggle').hidden=true; });
  // Email summary: credentials go to /mail.php and are never read back into the page.
  let mailSettings = null, mailBusy = false;
  async function mailRequest(body, query = 'view=settings') {
    const response = await fetch(`/mail.php${body ? '' : '?' + query}`, {method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', headers: {Accept:'application/json', ...(body ? {'Content-Type':'application/json','X-CSRF-Token':csrf} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
    let payload;
    try { payload = await response.json(); } catch { throw new Error('The server could not complete this request. Reload and try again.'); }
    if (!response.ok) throw new Error(payload.error?.message || 'Could not complete the request.');
    return payload.data;
  }
  function renderMail() {
    const settings = mailSettings, provider = $('aiProvider').value;
    $('mailSave').textContent = settings.connected ? 'Save' : 'Connect';
    $('mailDisconnect').hidden = !settings.connected;
    $('imapPasswordSaved').hidden = !settings.imap.hasPassword;
    $('aiFields').hidden = provider === '';
    $('aiBaseWrap').hidden = provider !== 'openai_compatible';
    const keySaved = settings.ai.hasKey && settings.ai.provider === provider;
    $('aiKeyNote').textContent = keySaved ? 'saved · leave blank to keep' : provider === 'openai_compatible' ? 'optional for local servers' : '';
  }
  function setMailBusy(busy) {
    mailBusy = busy;
    for (const id of ['mailSave', 'mailDisconnect', 'loadModels']) $(id).disabled = busy;
  }
  async function loadMail() {
    try {
      mailSettings = await mailRequest();
      for (const provider of mailSettings.providers) $('aiProvider').append(new Option(provider.name, provider.id));
      $('imapHost').value = mailSettings.imap.host; $('imapUser').value = mailSettings.imap.user;
      $('aiProvider').value = mailSettings.ai.provider; $('aiModel').value = mailSettings.ai.model; $('aiBaseUrl').value = mailSettings.ai.baseUrl;
      renderMail(); setMailBusy(false);
    } catch (error) { status('mailMessage', error.message, 'error'); }
  }
  $('aiProvider').addEventListener('change', () => { $('aiModel').value = ''; $('aiModels').replaceChildren(); renderMail(); });
  $('loadModels').addEventListener('click', async () => {
    if (mailBusy) return;
    setMailBusy(true); status('mailMessage', 'Loading models…');
    try {
      const {models} = await mailRequest({action:'models', ai_provider:$('aiProvider').value, ai_base_url:$('aiBaseUrl').value.trim(), ai_key:$('aiKey').value.trim()});
      $('aiModels').replaceChildren(...models.map(model => new Option(model.name === model.id ? model.id : model.name, model.id)));
      status('mailMessage', models.length ? `${models.length} models available. Pick one from the Model field.` : 'This provider listed no models; type a model ID instead.', models.length ? 'success' : '');
      $('aiModel').focus();
    } catch (error) { status('mailMessage', error.message, 'error'); }
    finally { setMailBusy(false); }
  });
  $('mailForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (mailBusy) return;
    if (!$('imapHost').reportValidity() || !$('imapUser').reportValidity()) return;
    setMailBusy(true); status('mailMessage', mailSettings.connected ? 'Saving…' : 'Signing in to your mailbox…');
    try {
      mailSettings = await mailRequest({action:'save', imap_host:$('imapHost').value.trim(), imap_user:$('imapUser').value.trim(), imap_password:$('imapPassword').value,
        ai_provider:$('aiProvider').value, ai_model:$('aiModel').value.trim(), ai_base_url:$('aiBaseUrl').value.trim(), ai_key:$('aiKey').value.trim()});
      $('imapPassword').value = ''; $('aiKey').value = '';
      renderMail();
      status('mailMessage', 'Email connected. Your inbox and summary appear on the Overview.', 'success');
    } catch (error) { status('mailMessage', error.message, 'error'); }
    finally { setMailBusy(false); }
  });
  $('mailDisconnect').addEventListener('click', async () => {
    if (mailBusy || !confirm('Disconnect this mailbox? The saved app password, AI key and summaries are deleted from LifeOS.')) return;
    setMailBusy(true);
    try {
      mailSettings = await mailRequest({action:'disconnect'});
      $('imapPassword').value = ''; $('aiKey').value = ''; $('aiProvider').value = ''; $('aiModel').value = '';
      renderMail(); status('mailMessage', 'Mailbox disconnected.', 'success');
    } catch (error) { status('mailMessage', error.message, 'error'); }
    finally { setMailBusy(false); }
  });
  loadAccount();
})();
