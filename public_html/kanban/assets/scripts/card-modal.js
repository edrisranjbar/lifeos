// Card modal — open / close / save / delete
function safeLabelColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#2563eb';
}

function labelTextColor(hex) {
  const color = safeLabelColor(hex).slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.36 ? '#172033' : '#ffffff';
}

function renderLabelOptions() {
  const board = getBoard(state.cardModal.boardId);
  const container = $('cardLabelOptions');
  container.replaceChildren();
  if (!board) return;
  board.labelDefs.forEach(label => {
    const row = document.createElement('div');
    row.className = 'label-option';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.draftLabelIds.includes(label.id);
    check.setAttribute('aria-label', `Assign ${label.name}`);
    check.addEventListener('change', () => {
      state.draftLabelIds = check.checked ? [...state.draftLabelIds, label.id] : state.draftLabelIds.filter(id => id !== label.id);
      renderSelectedCardLabels();
    });
    const color = document.createElement('input');
    color.type = 'color';
    color.value = safeLabelColor(label.color);
    color.setAttribute('aria-label', `Color for ${label.name}`);
    color.addEventListener('change', () => { label.color = color.value; saveState(); renderBoardContent(); renderSelectedCardLabels(); });
    const name = document.createElement('input');
    name.className = 'input';
    name.value = label.name;
    name.maxLength = 30;
    name.setAttribute('aria-label', 'Label name');
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (!next || board.labelDefs.some(other => other.id !== label.id && other.name.toLowerCase() === next.toLowerCase())) {
        name.value = label.name;
        showToast('Label names must be unique', 'error');
        return;
      }
      label.name = next;
      saveState();
      renderBoardContent();
      renderSelectedCardLabels();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Delete ${label.name} label`);
    remove.addEventListener('click', () => {
      if (!confirm(`Delete label "${label.name}" from this board and all cards?`)) return;
      board.labelDefs = board.labelDefs.filter(other => other.id !== label.id);
      board.columns.forEach(column => column.cards.forEach(card => { card.labelIds = (card.labelIds || []).filter(id => id !== label.id); }));
      state.draftLabelIds = state.draftLabelIds.filter(id => id !== label.id);
      saveState(); renderLabelOptions(); renderBoardContent();
    });
    row.append(check, color, name, remove);
    container.append(row);
  });
  renderSelectedCardLabels();
}

function renderSelectedCardLabels() {
  const board = getBoard(state.cardModal.boardId);
  const container = $('cardSelectedLabels');
  container.replaceChildren();
  (board?.labelDefs || []).filter(label => state.draftLabelIds.includes(label.id)).forEach(label => {
    const chip = document.createElement('span');
    chip.textContent = label.name;
    chip.style.background = safeLabelColor(label.color);
    chip.style.color = labelTextColor(label.color);
    container.append(chip);
  });
}

function addBoardLabel() {
  const board = getBoard(state.cardModal.boardId);
  if (!board) return;
  const name = $('newLabelName').value.trim();
  if (!name || board.labelDefs.some(label => label.name.toLowerCase() === name.toLowerCase())) {
    showToast('Enter a unique label name', 'error');
    return;
  }
  const label = {id: crypto.randomUUID(), name, color: safeLabelColor($('newLabelColor').value)};
  board.labelDefs.push(label);
  state.draftLabelIds.push(label.id);
  $('newLabelName').value = '';
  saveState(); renderLabelOptions();
}

function renderChecklist() {
  const container = $('cardChecklist');
  container.replaceChildren();
  $('cardChecklistSection').hidden = !state.draftChecklists.length;
  state.draftChecklists.forEach(list => {
    const group = document.createElement('section');
    group.className = 'named-checklist';
    group.innerHTML = '<div class="trello-section-heading"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/></svg><input class="checklist-name" maxlength="60" /><button type="button" class="delete-checklist">Delete</button></div><div class="checklist-progress-row"><span></span><progress max="100" value="0"></progress></div><div class="checklist-items"></div><button type="button" class="checklist-open-add">Add an item</button><div class="checklist-item-composer" hidden><textarea class="input" rows="2" maxlength="120" placeholder="Add an item…"></textarea><div><button type="button" class="btn-primary">Add</button><button type="button" class="btn-ghost">Cancel</button></div></div>';
    const name = group.querySelector('.checklist-name');
    name.value = list.title;
    name.setAttribute('aria-label', 'Checklist title');
    name.addEventListener('change', () => { list.title = name.value.trim() || 'Checklist'; name.value = list.title; persistCardChecklists(); });
    group.querySelector('.delete-checklist').addEventListener('click', () => {
      if (!confirm(`Delete checklist "${list.title}" and its items?`)) return;
      state.draftChecklists = state.draftChecklists.filter(other => other.id !== list.id);
      persistCardChecklists(); renderChecklist();
    });
    const done = list.items.filter(item => item.done).length;
    const percent = list.items.length ? Math.round(done / list.items.length * 100) : 0;
    group.querySelector('.checklist-progress-row span').textContent = `${percent}%`;
    const progress = group.querySelector('progress');
    progress.value = percent;
    progress.setAttribute('aria-label', `${list.title}: ${done} of ${list.items.length} complete`);
    const items = group.querySelector('.checklist-items');
    list.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'checklist-item';
      const check = document.createElement('input');
      check.type = 'checkbox'; check.checked = !!item.done;
      check.setAttribute('aria-label', `Complete ${item.text}`);
      check.addEventListener('change', () => { item.done = check.checked; persistCardChecklists(); renderChecklist(); });
      const input = document.createElement('input');
      input.className = 'input'; input.value = item.text; input.maxLength = 120;
      input.setAttribute('aria-label', 'Checklist item');
      input.addEventListener('input', () => { item.text = input.value; });
      input.addEventListener('change', () => { if (!item.text.trim()) { item.text = 'Untitled item'; input.value = item.text; } persistCardChecklists(); });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'checklist-remove-item';
      remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
      remove.setAttribute('aria-label', `Remove ${item.text}`);
      remove.addEventListener('click', () => { list.items = list.items.filter(entry => entry.id !== item.id); persistCardChecklists(); renderChecklist(); });
      row.append(check, input, remove);
      items.append(row);
    });
    const open = group.querySelector('.checklist-open-add');
    const composer = group.querySelector('.checklist-item-composer');
    const text = composer.querySelector('textarea');
    text.setAttribute('aria-label', `New item in ${list.title}`);
    open.addEventListener('click', () => { open.hidden = true; composer.hidden = false; text.focus(); });
    composer.querySelector('.btn-primary').addEventListener('click', () => addChecklistItem(list, text));
    composer.querySelector('.btn-ghost').addEventListener('click', () => { composer.hidden = true; open.hidden = false; text.value = ''; open.focus(); });
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addChecklistItem(list, text); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); composer.hidden = true; open.hidden = false; open.focus(); }
    });
    container.append(group);
  });
}

function addChecklistItem(list, input) {
  const text = input.value.trim();
  if (!text) return;
  list.items.push({id: crypto.randomUUID(), text, done: false});
  input.value = '';
  persistCardChecklists();
  renderChecklist();
  const index = state.draftChecklists.findIndex(other => other.id === list.id);
  $('cardChecklist').children[index]?.querySelector('.checklist-open-add')?.click();
}

function serializeDraftChecklists() {
  return state.draftChecklists.map(list => ({id: list.id, title: list.title.trim() || 'Checklist', items: list.items.filter(item => item.text.trim()).map(item => ({...item, text: item.text.trim()}))}));
}

function persistCardChecklists() {
  const card = currentModalCard();
  if (!card) return;
  card.checklists = serializeDraftChecklists();
  card.checklist = card.checklists.flatMap(list => list.items);
  card.updatedAt = Date.now();
  saveState(); renderBoardContent();
}

function openChecklistMenu() {
  const menu = $('cardChecklistMenu');
  if (menu.matches(':popover-open')) { closeChecklistMenu(); return; }
  $('newChecklistTitle').value = 'Checklist';
  $('checklistTitleError').hidden = true;
  menu.showPopover();
  const anchor = $('cardChecklistBtn').getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - 12))}px`;
  menu.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - menu.offsetHeight - 12))}px`;
  $('newChecklistTitle').focus(); $('newChecklistTitle').select();
}

function closeChecklistMenu() {
  $('cardChecklistMenu').hidePopover();
  $('cardChecklistBtn').focus();
}

function createCardChecklist() {
  const title = $('newChecklistTitle').value.trim();
  if (!title) { $('checklistTitleError').textContent = 'Enter a checklist title.'; $('checklistTitleError').hidden = false; $('newChecklistTitle').focus(); return; }
  state.draftChecklists.push({id: crypto.randomUUID(), title, items: []});
  persistCardChecklists(); renderChecklist(); closeChecklistMenu();
  const group = $('cardChecklist').lastElementChild;
  group.scrollIntoView({block: 'nearest'});
  group.querySelector('.checklist-open-add').click();
}

function openMoveCard(context) {
  const card = getColumn(context.boardId, context.columnId)?.cards.find(item => item.id === context.cardId);
  if (!card) return;
  state.moveCard = {...context, busy: false};
  $('moveCardSummary').textContent = card.title || 'Untitled card';
  $('moveCardError').hidden = true;
  const projects = state.boards.filter(board => board.id !== context.boardId);
  $('moveCardProject').replaceChildren();
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    $('moveCardProject').append(option);
  }
  if (!projects.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No other projects yet';
    $('moveCardProject').append(option);
  }
  ['closeMoveCard', 'cancelMoveCard'].forEach(id => { $(id).disabled = false; });
  $('moveCardProject').disabled = !projects.length;
  renderMoveCardLists();
  $('moveCardModal').showModal();
}

function renderMoveCardLists() {
  const project = getBoard($('moveCardProject').value);
  const columns = project?.columns || [];
  $('moveCardList').replaceChildren();
  for (const column of columns) {
    const option = document.createElement('option');
    option.value = column.id;
    option.textContent = column.name;
    $('moveCardList').append(option);
  }
  if (!columns.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No lists available';
    $('moveCardList').append(option);
  }
  const source = getColumn(state.moveCard.boardId, state.moveCard.columnId);
  const similar = columns.find(column => column.name.trim().toLowerCase() === source?.name.trim().toLowerCase());
  if (similar) $('moveCardList').value = similar.id;
  $('moveCardList').disabled = !columns.length;
  $('confirmMoveCard').disabled = !columns.length;
  $('confirmMoveCard').textContent = 'Move card';
  $('moveCardError').hidden = !!columns.length;
  $('moveCardError').textContent = project ? 'Add a list to this project before moving a card.' : 'Create another project first, then move this card.';
}

async function moveCardToProject(event) {
  event.preventDefault();
  const context = state.moveCard;
  if (!context || context.busy) return;
  const destinationBoardId = $('moveCardProject').value;
  const destinationColumnId = $('moveCardList').value;
  if (!getColumn(destinationBoardId, destinationColumnId) || destinationBoardId === context.boardId) return;
  if (context.fromEditor && $('cardModal').open) {
    handleCardFormSubmit({preventDefault() {}});
    if ($('cardModal').open) { $('moveCardModal').close(); $('cardTitle').focus(); return; }
    context.fromEditor = false;
  }
  // Saving the editor may have changed the card's list within its current project.
  const source = getBoard(context.boardId)?.columns.find(column => column.cards.some(card => card.id === context.cardId));
  if (!source) { $('moveCardError').textContent = 'Card not found. Reload the board and try again.'; $('moveCardError').hidden = false; return; }
  context.busy = true;
  ['moveCardProject', 'moveCardList', 'confirmMoveCard', 'cancelMoveCard', 'closeMoveCard'].forEach(id => { $(id).disabled = true; });
  $('confirmMoveCard').textContent = 'Moving…';
  $('moveCardError').hidden = true;
  try {
    const value = await appStorage.mutateItem(KEY, async ({csrf, revision}) => {
      const response = await fetch('/kanban.php', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf},
        body: JSON.stringify({source_board_id: context.boardId, source_column_id: source.id, card_id: context.cardId, destination_board_id: destinationBoardId, destination_column_id: destinationColumnId, revision})
      });
      let payload;
      try { payload = await response.json(); } catch { throw new Error('The server could not process the move. Please try again.'); }
      if (!response.ok) {
        const error = new Error(payload.error?.message || (typeof payload.error === 'string' ? payload.error : 'Unable to move the card. Please try again.'));
        error.stateConflict = payload.error?.code === 'state_conflict';
        throw error;
      }
      return payload.data;
    });
    const saved = JSON.parse(value);
    state.boards = saved.boards;
    state.activeBoardId = saved.activeBoardId;
    $('moveCardModal').close();
    render();
    showToast(`Card moved to ${getBoard(destinationBoardId)?.name || 'project'}`, 'success');
  } catch (error) {
    $('moveCardError').textContent = ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)
      ? 'The move could not be confirmed. Reload to check the card before trying again.'
      : error.message || 'Unable to move the card.';
    $('moveCardError').hidden = false;
  } finally {
    context.busy = false;
    ['moveCardProject', 'moveCardList', 'confirmMoveCard', 'cancelMoveCard', 'closeMoveCard'].forEach(id => { $(id).disabled = false; });
    $('confirmMoveCard').textContent = 'Move card';
  }
}

function setGoalCardBusy(busy) {
  ['confirmGoalCard', 'cancelGoalCard', 'closeGoalCard'].forEach(id => { $(id).disabled = busy; });
  $('confirmGoalCard').textContent = busy ? 'Moving…' : 'Move to goal';
}

function openGoalCard(context) {
  const card = getColumn(context.boardId, context.columnId)?.cards.find(item => item.id === context.cardId);
  if (!card) return;
  state.goalCard = {...context, busy: false};
  $('goalCardSummary').textContent = card.title || 'Untitled card';
  const lists = Array.isArray(card.checklists) ? card.checklists : [{items: card.checklist || []}];
  const tasks = lists.reduce((count, list) => count + (list.items || []).filter(item => item.text?.trim()).length, 0);
  const details = [
    card.description?.trim() ? 'The description becomes the goal’s specific outcome.' : '',
    card.dueDate ? `The due date (${formatCardDueDate(card.dueDate)}) becomes the deadline.` : 'No due date, so the goal starts without a deadline.',
    tasks ? `${tasks} checklist item${tasks === 1 ? '' : 's'} become${tasks === 1 ? 's' : ''} goal tasks.` : 'No checklist items yet; add tasks in Goals.',
  ].filter(Boolean);
  $('goalCardDetails').replaceChildren(...details.map(text => Object.assign(document.createElement('li'), {textContent: text})));
  $('goalCardError').hidden = true;
  setGoalCardBusy(false);
  $('goalCardModal').showModal();
}

async function moveCardToGoal(event) {
  event.preventDefault();
  const context = state.goalCard;
  if (!context || context.busy) return;
  if (context.fromEditor && $('cardModal').open) {
    handleCardFormSubmit({preventDefault() {}});
    if ($('cardModal').open) { $('goalCardModal').close(); $('cardTitle').focus(); return; }
    context.fromEditor = false;
  }
  // Saving the editor may have changed the card's list.
  const source = getBoard(context.boardId)?.columns.find(column => column.cards.some(card => card.id === context.cardId));
  if (!source) { $('goalCardError').textContent = 'Card not found. Reload the board and try again.'; $('goalCardError').hidden = false; return; }
  context.busy = true;
  setGoalCardBusy(true);
  $('goalCardError').hidden = true;
  try {
    const data = await appStorage.mutateItems([KEY, 'edi_goals_v1'], async ({csrf, revisions}) => {
      const response = await fetch('/kanban.php', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf},
        body: JSON.stringify({action: 'to_goal', board_id: context.boardId, column_id: source.id, card_id: context.cardId, revisions})
      });
      let payload;
      try { payload = await response.json(); } catch { throw new Error('The server could not process the move. Please try again.'); }
      if (!response.ok) {
        const error = new Error(payload.error?.message || (typeof payload.error === 'string' ? payload.error : 'Unable to move the card. Please try again.'));
        error.stateConflict = payload.error?.code === 'state_conflict';
        throw error;
      }
      return payload.data;
    });
    state.boards = JSON.parse(appStorage.getItem(KEY)).boards;
    $('goalCardModal').close();
    render();
    showToast(`“${data.result.title}” is now a goal`, 'success');
  } catch (error) {
    $('goalCardError').textContent = ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)
      ? 'The move could not be confirmed. Reload to check the card before trying again.'
      : error.message || 'Unable to move the card.';
    $('goalCardError').hidden = false;
  } finally {
    context.busy = false;
    setGoalCardBusy(false);
  }
}

function openCardModal({ boardId, columnId, cardId }) {
  const board = getBoard(boardId);
  if (!board) return;
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  const card = column.cards.find(c => c.id === cardId);
  if (!card) return;

  state.cardModal = { boardId, columnId, cardId };
  $('cardBoardId').value = boardId;
  $('cardColumnId').value = columnId;
  $('cardId').value = cardId;
  $('cardModalTitle').textContent = 'Edit card';
  $('cardTitle').value = card.title || '';
  $('cardDescription').value = card.description || '';
  $('cardPriority').value = card.priority || 'medium';
  $('cardDueDate').value = card.dueDate || '';
  updateCardDateSummary(card);
  $('cardCompleted').checked = !!card.completed;
  $('cardMembers').value = (card.members || []).join(', ');
  $('cardAttachmentUrl').value = card.attachmentUrl || '';
  $('legacyAttachmentField').hidden = !card.attachmentUrl;
  state.fileAttachments = [];
  $('cardFileAttachments').replaceChildren();
  loadCardAttachments();
  $('cardList').replaceChildren();
  board.columns.forEach(list => {
    const option = document.createElement('option');
    option.value = list.id;
    option.textContent = list.name;
    option.selected = list.id === columnId;
    $('cardList').append(option);
  });
  ['cardExtra', 'cardDates', 'cardMembersSection', 'cardAttachmentsSection', 'cardLabelsEditor'].forEach(id => { $(id).hidden = true; });
  document.querySelectorAll('[data-editor-target]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  $('cardDates').hidden = !card.dueDate && !card.startDate;
  $('cardMembersSection').hidden = !(card.members || []).length;
  $('cardAttachmentsSection').hidden = !card.attachmentUrl;
  $('cardChecklistSection').hidden = !(card.checklist || []).length;
  $('cardDescription').hidden = true;
  $('cardDescriptionPreview').hidden = false;
  $('cardDescriptionPreview').textContent = card.description || 'Add a more detailed description…';
  $('editDescriptionBtn').textContent = 'Edit';
  $('cardComment').value = '';
  $('saveCommentBtn').hidden = true;
  $('cardActivityDetails').hidden = true;
  $('toggleActivityDetails').textContent = 'Show details';
  $('toggleActivityDetails').setAttribute('aria-expanded', 'false');
  renderCardActivity(card);
  state.draftLabelIds = [...(card.labelIds || [])];
  state.draftChecklists = Array.isArray(card.checklists)
    ? card.checklists.map(list => ({...list, items: (list.items || []).map(item => ({...item}))}))
    : (card.checklist || []).length ? [{id: `legacy-${card.id}`, title: card.checklistTitle || 'Checklist', items: card.checklist.map(item => ({...item}))}] : [];
  state.draftCustomFields = (card.customFields || []).map(field => ({...field}));
  renderCustomFields();
  $('cardExtra').hidden = !state.draftCustomFields.length;
  renderLabelOptions();
  renderChecklist();
  clearCardFormError();
  const meta = column.name + (card.updatedAt ? ' · updated ' + new Date(card.updatedAt).toLocaleDateString() : '');
  $('cardFormMeta').textContent = meta;
  $('cardModal').showModal();
  setTimeout(() => $('cardTitle').focus(), 60);
}

function closeCardModal() {
  if ($('cardAttachMenu').matches(':popover-open')) $('cardAttachMenu').hidePopover();
  if ($('cardChecklistMenu').matches(':popover-open')) $('cardChecklistMenu').hidePopover();
  if ($('cardDatesMenu').matches(':popover-open')) $('cardDatesMenu').hidePopover();
  if ($('cardAddMenu').matches(':popover-open')) $('cardAddMenu').hidePopover();
  $('cardModal').close();
  state.cardModal = { boardId: null, columnId: null, cardId: null };
}

function setCardFormError(message) {
  const el = $('cardFormError');
  el.textContent = message;
  el.hidden = false;
}

function clearCardFormError() {
  const el = $('cardFormError');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function handleCardFormSubmit(e) {
  e.preventDefault();
  const { boardId, columnId, cardId } = state.cardModal;
  if (!boardId || !columnId || !cardId) return;
  const board = getBoard(boardId);
  if (!board) return;
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  const card = column.cards.find(c => c.id === cardId);
  if (!card) return;

  const title = $('cardTitle').value.trim();
  if (!title) {
    setCardFormError('Give the card a title.');
    $('cardTitle').focus();
    return;
  }

  const attachmentUrl = $('cardAttachmentUrl').value.trim();
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl)) {
    $('cardAttachmentsSection').hidden = false;
    setCardFormError('Use an http or https attachment link.');
    $('cardAttachmentUrl').focus();
    return;
  }

  card.title = title;
  card.description = $('cardDescription').value.trim();
  card.priority = $('cardPriority').value;
  card.dueDate = $('cardDueDate').value;
  card.labelIds = state.draftLabelIds.filter(id => board.labelDefs.some(label => label.id === id));
  card.checklists = serializeDraftChecklists();
  card.checklist = card.checklists.flatMap(list => list.items);
  card.updatedAt = Date.now();
  const newlyCompleted = !card.completed && $('cardCompleted').checked;
  card.completed = $('cardCompleted').checked;
  card.members = $('cardMembers').value.split(',').map(name => name.trim()).filter(Boolean);
  card.customFields = state.draftCustomFields.filter(field => field.name.trim()).map(field => ({...field, name: field.name.trim(), value: field.value.trim()}));
  card.attachmentUrl = attachmentUrl;
  const destination = board.columns.find(list => list.id === $('cardList').value);
  if (destination && destination.id !== columnId) {
    column.cards = column.cards.filter(item => item.id !== cardId);
    destination.cards.push(card);
  }
  if (newlyCompleted && card.recurring && card.recurring !== 'never' && card.dueDate) {
    const next = parseCardDate(card.dueDate);
    if (next) {
      const originalDay = next.getDate();
      if (card.recurring === 'monthly') {
        next.setDate(1); next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(originalDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      } else next.setDate(next.getDate() + (card.recurring === 'weekly' ? 7 : 1));
      card.dueDate = cardDateString(next);
      card.completed = false;
    }
  }

  saveState();
  render();
  closeCardModal();
  showToast('Card saved', 'success');
}
