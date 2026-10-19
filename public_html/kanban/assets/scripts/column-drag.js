// Column drag & drop handlers
let columnDragState = {
  draggingColumnId: null
};

function handleColumnDragStart(e) {
  // If a card inside this column is the actual drag target, let the card handle it
  if (e.target.closest('.card')) {
    e.stopPropagation(); // prevent column drag from kicking in
    return;
  }

  const colEl = e.currentTarget;
  columnDragState.draggingColumnId = colEl.dataset.columnId;
  colEl.classList.add('column-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/x-column-id', colEl.dataset.columnId);
}

function handleColumnDragEnd(e) {
  const colEl = e.currentTarget;
  colEl.classList.remove('column-dragging');
  document.querySelectorAll('.column').forEach(c => c.classList.remove('column-drop-target'));
  columnDragState.draggingColumnId = null;
}

function handleColumnDragEnter(e) {
  if (columnDragState.draggingColumnId &&
      columnDragState.draggingColumnId !== e.currentTarget.dataset.columnId) {
    e.currentTarget.classList.add('column-drop-target');
  }
}

function handleColumnDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('column-drop-target');
  }
}

function handleColumnDropOnColumn(e) {
  const colEl = e.currentTarget;
  colEl.classList.remove('column-drop-target');

  if (!columnDragState.draggingColumnId) return;
  if (columnDragState.draggingColumnId === colEl.dataset.columnId) return;

  e.preventDefault();
  e.stopPropagation();

  const board = getActiveBoard();
  if (!board) return;

  const fromId = columnDragState.draggingColumnId;
  const toId = colEl.dataset.columnId;

  const fromIndex = board.columns.findIndex(c => c.id === fromId);
  const toIndex = board.columns.findIndex(c => c.id === toId);

  if (fromIndex === -1 || toIndex === -1) return;

  const [movedCol] = board.columns.splice(fromIndex, 1);
  board.columns.splice(toIndex, 0, movedCol);

  saveState();
  render();
  showToast(window.lifeOsI18n.t('Column moved'), 'success');
}
