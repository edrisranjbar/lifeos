function renderCustomFields() {
  const container = $('cardCustomFields');
  container.replaceChildren();
  state.draftCustomFields.forEach(field => {
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    const name = document.createElement('input');
    name.className = 'input'; name.value = field.name; name.maxLength = 60;
    name.placeholder = window.lifeOsI18n.t('Field name'); name.setAttribute('aria-label', window.lifeOsI18n.t('Custom field name'));
    name.addEventListener('input', () => { field.name = name.value; });
    const value = document.createElement('input');
    value.className = 'input'; value.value = field.value; value.maxLength = 500;
    value.placeholder = window.lifeOsI18n.t('Value'); value.setAttribute('aria-label', window.lifeOsI18n.t('Custom field value'));
    value.addEventListener('input', () => { field.value = value.value; });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn-ghost'; remove.textContent = window.lifeOsI18n.t('Remove');
    remove.setAttribute('aria-label', window.lifeOsI18n.t("Remove {value0}",{value0:field.name || 'custom field'}));
    remove.addEventListener('click', () => { state.draftCustomFields = state.draftCustomFields.filter(item => item.id !== field.id); renderCustomFields(); });
    row.append(name, value, remove);
    container.append(row);
  });
}

function renderCardActivity(card) {
  const container = $('cardComments');
  container.replaceChildren();
  (card.comments || []).slice().reverse().forEach(comment => {
    const row = document.createElement('article');
    row.className = 'trello-comment';
    const avatar = document.createElement('span');
    avatar.className = 'comment-avatar';
    avatar.textContent = 'E';
    const content = document.createElement('div');
    const author = document.createElement('strong');
    author.textContent = window.lifeOsI18n.t('You');
    const date = document.createElement('time');
    date.dateTime = new Date(comment.createdAt).toISOString();
    date.textContent = new Date(comment.createdAt).toLocaleString(window.lifeOsI18n.locale());
    const message = document.createElement('p');
    message.dir = 'auto';
    message.textContent = comment.text;
    content.append(author, date, message);
    row.append(avatar, content);
    container.append(row);
  });
  const dates = [];
  if (card.createdAt) dates.push(window.lifeOsI18n.t('Created {date}',{date:new Date(card.createdAt).toLocaleString(window.lifeOsI18n.locale())}));
  if (card.updatedAt) dates.push(window.lifeOsI18n.t('Last updated {date}',{date:new Date(card.updatedAt).toLocaleString(window.lifeOsI18n.locale())}));
  $('cardActivityDetails').textContent = dates.join('\n') || window.lifeOsI18n.t('No earlier activity recorded.');
}

function saveCardComment() {
  const {boardId, columnId, cardId} = state.cardModal;
  const card = getColumn(boardId, columnId)?.cards.find(item => item.id === cardId);
  const text = $('cardComment').value.trim();
  if (!card || !text) return;
  card.comments = [...(card.comments || []), {id: crypto.randomUUID(), text, createdAt: Date.now()}];
  saveState();
  renderCardActivity(card);
  $('cardComment').value = '';
  $('saveCommentBtn').hidden = true;
  showToast(window.lifeOsI18n.t('Comment saved'), 'success');
}

function deleteCurrentCard() {
  const { boardId, columnId, cardId } = state.cardModal;
  if (!boardId || !columnId || !cardId) return;
  const board = getBoard(boardId);
  if (!board) return;
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  if (!confirm(window.lifeOsI18n.t("Delete card \"{value0}\"?",{value0:column.cards.find(c => c.id === cardId)?.title || ''}))) return;
  column.cards = column.cards.filter(c => c.id !== cardId);
  saveState();
  render();
  closeCardModal();
  showToast(window.lifeOsI18n.t('Card deleted'), 'success');
}
