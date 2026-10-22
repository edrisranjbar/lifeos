// All-projects view: every project's lists merged by name, so the same stage
// (Backlog, To Do, In Progress, …) shows tasks from all boards side by side.
function columnKey(name) {
  return String(name || '').trim().toLowerCase();
}

function getAllProjectsColumns() {
  const merged = new Map();
  state.boards.forEach(board => board.columns.forEach(column => {
    const key = columnKey(column.name);
    if (!merged.has(key)) merged.set(key, {key, name: column.name.trim() || 'Untitled', entries: []});
    column.cards.forEach((card, cardIndex) => merged.get(key).entries.push({board, column, card, cardIndex}));
  }));
  return [...merged.values()];
}

function renderAllProjectsContent() {
  const container = $('columnsContainer');
  const columns = getAllProjectsColumns();
  const cardCount = columns.reduce((total, column) => total + column.entries.length, 0);

  $('boardMain').dataset.background = 'default';
  $('boardHeading').textContent = window.lifeOsI18n.t("All projects");
  $('boardDescription').textContent = window.lifeOsI18n.t("Tasks from every project, grouped by list. Drag a card to move it to that list in its own project.");
  $('boardDescription').hidden = false;
  $('boardSummary').textContent = `${window.lifeOsI18n.t('{projects} projects · {cards} cards', {projects: window.lifeOsI18n.number(state.boards.length), cards: window.lifeOsI18n.number(cardCount)})}`;
  container.innerHTML = '';

  if (!columns.length) {
    container.innerHTML = window.lifeOsI18n.markup('<div class="empty-board"><h3>No lists</h3><p>Add lists to a project to see its tasks here</p></div>');
    return;
  }

  columns.forEach(group => {
    const colEl = document.createElement('div');
    colEl.className = 'column all-projects-column';
    colEl.dataset.columnKey = group.key;
    colEl.innerHTML = `
      <div class="column-header">
        <div class="column-title-wrap">
          <span class="column-title">${escapeHtml(group.name)}</span>
          <span class="column-count">${group.entries.length}</span>
        </div>
      </div>
      <div class="column-cards"></div>
    `;
    const cardsContainer = colEl.querySelector('.column-cards');
    group.entries.forEach(({board, column, card, cardIndex}) => {
      cardsContainer.appendChild(createCardElement(board, column, card, cardIndex, true));
    });
    container.appendChild(colEl);
  });
}

// Moves a dropped card to the list with the same name in the card's own project.
function handleAllProjectsDrop(e, cardId) {
  const targetColEl = e.target.closest('.all-projects-column');
  if (!targetColEl) return;
  const board = getBoard(state.dragging.card?.dataset.boardId) ||
    state.boards.find(item => item.columns.some(column => column.cards.some(card => card.id === cardId)));
  if (!board) return;

  const fromCol = board.columns.find(column => column.cards.some(card => card.id === cardId));
  const toCol = board.columns.find(column => columnKey(column.name) === targetColEl.dataset.columnKey);
  if (!fromCol) return;
  if (!toCol) {
    showToast(window.lifeOsI18n.t('{board} has no "{list}" list', {board: board.name, list: targetColEl.querySelector('.column-title').textContent}), 'error');
    return;
  }

  const cardUnder = e.target.closest('.card');
  const beforeCardId = cardUnder && cardUnder.dataset.boardId === board.id ? cardUnder.dataset.cardId : null;
  const [moved] = fromCol.cards.splice(fromCol.cards.findIndex(card => card.id === cardId), 1);
  const insertAt = beforeCardId && beforeCardId !== cardId ? toCol.cards.findIndex(card => card.id === beforeCardId) : -1;
  if (insertAt === -1) toCol.cards.push(moved);
  else toCol.cards.splice(insertAt, 0, moved);

  saveState();
  render();
  showToast(window.lifeOsI18n.t("Card moved"), 'success');
}
