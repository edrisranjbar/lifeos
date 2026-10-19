function attachmentSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function attachmentCsrf() {
  const response = await fetch('/state.php', {headers: {Accept: 'application/json'}, cache: 'no-store', redirect: 'error'});
  if (!response.ok) throw new Error('Please sign in again and reload the page.');
  return (await response.json()).csrf;
}

async function attachmentResponse(response) {
  if (!(response.headers.get('Content-Type') || '').includes('application/json')) {
    throw new Error(response.status === 404 ? 'Attachment service is unavailable. Reload the page and try again.' : 'Unable to access attachments. Please reload or sign in again.');
  }
  return response.json();
}

async function loadCardAttachments() {
  const {boardId, cardId} = state.cardModal;
  try {
    const response = await fetch(`/attachments.php?board=${encodeURIComponent(boardId)}&card=${encodeURIComponent(cardId)}`, {headers: {Accept: 'application/json'}, cache: 'no-store', redirect: 'error'});
    const data = await attachmentResponse(response);
    if (!response.ok) throw new Error(data.error || 'Unable to load attachments.');
    if (state.cardModal.boardId !== boardId || state.cardModal.cardId !== cardId) return;
    const byId = new Map((data.attachments || []).map(file => [file.id, file]));
    state.fileAttachments.forEach(file => byId.set(file.id, file));
    state.fileAttachments = Array.from(byId.values());
    state.attachmentMaxSize = data.maxSize;
    $('attachmentSizeLimit').textContent = window.lifeOsI18n.t("Up to {value0} per file",{value0:attachmentSize(data.maxSize)});
    renderFileAttachments();
  } catch (error) {
    if (state.cardModal.boardId !== boardId || state.cardModal.cardId !== cardId) return;
    const message = document.createElement('p');
    message.className = 'attachment-error'; message.textContent = error.message;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'btn-ghost'; retry.textContent = window.lifeOsI18n.t('Retry');
    retry.addEventListener('click', loadCardAttachments);
    $('cardFileAttachments').replaceChildren(message, retry);
    $('cardAttachmentsSection').hidden = false;
  }
}

function renderFileAttachments() {
  const container = $('cardFileAttachments');
  container.replaceChildren();
  $('cardAttachmentsSection').hidden = !state.fileAttachments.length && !$('cardAttachmentUrl').value;
  state.fileAttachments.forEach(file => {
    const row = document.createElement('div');
    row.className = 'card-file-attachment';
    const icon = document.createElement('span');
    icon.className = 'card-file-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5V3Z"/><path d="M14 3v6h5M8 13h8M8 17h5"/></svg>';
    const info = document.createElement('div');
    const download = document.createElement('a');
    download.href = `/attachments.php?id=${encodeURIComponent(file.id)}`;
    download.textContent = file.name;
    download.setAttribute('download', file.name);
    const size = document.createElement('small');
    size.textContent = window.lifeOsI18n.t("{value0} · Download",{value0:attachmentSize(file.size)});
    info.append(download, size);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn-ghost'; remove.textContent = window.lifeOsI18n.t('Remove');
    remove.addEventListener('click', async () => {
      if (!confirm(window.lifeOsI18n.t("Remove attachment \"{value0}\"?",{value0:file.name}))) return;
      remove.disabled = true;
      const {boardId, cardId} = state.cardModal;
      try {
        const csrf = await attachmentCsrf();
        const response = await fetch(`/attachments.php?id=${encodeURIComponent(file.id)}`, {method: 'DELETE', headers: {Accept: 'application/json', 'X-CSRF-Token': csrf}, redirect: 'error'});
        const result = await attachmentResponse(response);
        if (!response.ok) throw new Error(result.error || 'Unable to remove attachment.');
        if (state.cardModal.boardId === boardId && state.cardModal.cardId === cardId) {
          state.fileAttachments = state.fileAttachments.filter(other => other.id !== file.id);
          renderFileAttachments();
        }
      } catch (error) { showToast(error.message, 'error'); remove.disabled = false; }
    });
    row.append(icon, info, remove);
    container.append(row);
  });
}

function openAttachmentMenu() {
  const menu = $('cardAttachMenu');
  if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
  if (!state.uploadingAttachments) $('attachmentUploadStatus').textContent = '';
  menu.showPopover();
  const anchor = document.querySelector('.trello-action-row [data-editor-target="cardAttachmentsSection"]').getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - 12))}px`;
  menu.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - menu.offsetHeight - 12))}px`;
  $('uploadCardFiles').focus();
}

async function uploadCardFiles(files) {
  if (!files.length || state.uploadingAttachments) return;
  const {boardId, cardId} = state.cardModal;
  if (!boardId || !cardId) return;
  state.uploadingAttachments = true;
  $('uploadCardFiles').disabled = true;
  const status = $('attachmentUploadStatus');
  status.classList.remove('attachment-error');
  const progress = $('attachmentUploadProgress');
  progress.hidden = false;
  const failures = [];
  let uploaded = 0;
  try {
    const csrf = await attachmentCsrf();
    for (const file of files) {
      if (state.cardModal.boardId !== boardId || state.cardModal.cardId !== cardId) break;
      if (file.size > (state.attachmentMaxSize || 8 * 1048576)) { failures.push(`${file.name}: file is too large`); continue; }
      status.textContent = window.lifeOsI18n.t("Uploading {value0}…",{value0:file.name});
      progress.value = 0;
      try {
        const attachment = await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('POST', '/attachments.php');
          request.setRequestHeader('Accept', 'application/json');
          request.setRequestHeader('X-CSRF-Token', csrf);
          request.timeout = 120000;
          request.upload.onprogress = e => { if (e.lengthComputable) progress.value = Math.round(e.loaded / e.total * 100); };
          request.onload = () => {
            try {
              if (!(request.getResponseHeader('Content-Type') || '').includes('application/json')) throw new Error('Attachment service is unavailable. Reload the page and try again.');
              const result = JSON.parse(request.responseText);
              if (request.status < 200 || request.status >= 300) throw new Error(result.error || 'Upload failed.');
              resolve(result.attachment);
            } catch (error) { reject(new Error(error.message || 'Upload failed.')); }
          };
          request.onerror = () => reject(new Error('Connection lost. Please try again.'));
          request.ontimeout = () => reject(new Error('Upload timed out. Please try again.'));
          const data = new FormData();
          data.append('board', boardId); data.append('card', cardId); data.append('file', file);
          request.send(data);
        });
        uploaded++;
        if (state.cardModal.boardId === boardId && state.cardModal.cardId === cardId) {
          state.fileAttachments.push(attachment);
          renderFileAttachments();
        }
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    status.textContent = [`${uploaded} file${uploaded === 1 ? '' : 's'} attached.`, ...failures].join('\n');
    status.classList.toggle('attachment-error', failures.length > 0);
  } catch (error) { status.textContent = error.message; status.classList.add('attachment-error'); }
  finally {
    state.uploadingAttachments = false;
    $('uploadCardFiles').disabled = false;
    progress.hidden = true;
  }
}
