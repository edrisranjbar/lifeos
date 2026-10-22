// Drag & drop handlers
function handleDragStart(e) {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;

  state.dragging.card = cardEl;
  state.dragging.fromColumn = cardEl.closest('.column') ? cardEl.closest('.column').dataset.columnId : null;
  state.dragging.fromBoard = cardEl.dataset.boardId || state.activeBoardId;

  cardEl.classList.add('dragging');

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/x-card-id', cardEl.dataset.cardId);

  // Don't let the column pick this up as a column drag
  e.stopPropagation();

  $$('.column-cards').forEach(col => col.classList.add('drag-over'));
}

function handleDragEnd(e) {
  const cardEl = state.dragging.card;
  if (cardEl) cardEl.classList.remove('dragging');
  $$('.column-cards').forEach(col => col.classList.remove('drag-over'));

  state.dragging = { card: null, fromColumn: null, fromBoard: null };
}

function handleCardContainerDragOver(e) {
  // Only allow drop if a card (not a column) is being dragged
  if (columnDragState.draggingColumnId) return;
  // Check what types are present
  if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.indexOf('text/x-card-id') === -1) {
    // No card id in payload — might be a column or unknown
    return;
  }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCardContainerDragLeave(e) {
  if (!e.target.classList.contains('column-cards')) {
    $$('.column-cards').forEach(col => col.classList.remove('drag-over'));
  }
}

function handleCardContainerDrop(e) {
  // If a column is being dragged, let the column handler do its job
  if (columnDragState.draggingColumnId) return;

  const cardId = e.dataTransfer.getData('text/x-card-id') || state.dragging.card?.dataset.cardId;
  if (!cardId) return;

  e.preventDefault();

  if (state.allProjects) {
    handleAllProjectsDrop(e, cardId);
    return;
  }

  // Find the column the drop landed in
  const targetColEl = e.target.closest('.column-cards');
  if (!targetColEl) return;
  const targetColId = targetColEl.parentElement.dataset.columnId;

  // Find the card under the cursor, if any, so we can insert before it
  const cardUnder = e.target.closest('.card');
  const beforeCardId = cardUnder ? cardUnder.dataset.cardId : null;

  const board = getActiveBoard();
  if (!board) return;

  const toCol = board.columns.find(c => c.id === targetColId);
  if (!toCol) return;

  // Find the source column by locating the card id
  let fromCol = null;
  for (const col of board.columns) {
    if (col.cards.some(c => c.id === cardId)) { fromCol = col; break; }
  }
  if (!fromCol) return;

  const fromIndex = fromCol.cards.findIndex(c => c.id === cardId);
  if (fromIndex === -1) return;
  const [moved] = fromCol.cards.splice(fromIndex, 1);

  if (beforeCardId && beforeCardId !== cardId) {
    const insertAt = toCol.cards.findIndex(c => c.id === beforeCardId);
    if (insertAt === -1) toCol.cards.push(moved);
    else toCol.cards.splice(insertAt, 0, moved);
  } else {
    toCol.cards.push(moved);
  }

  saveState();
  render();
  showToast('Card moved', 'success');
}
