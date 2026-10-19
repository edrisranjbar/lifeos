// Modal handlers (kept for board management)
function openBoardModal(boardId = null) {
  // Defensive: if called with an event object, treat as new board
  if (boardId && typeof boardId === 'object') boardId = null;
  if (boardId && typeof boardId !== 'string') boardId = null;

  const modal = $('boardModal');
  if (boardId) {
    const board = getBoard(boardId);
    if (!board) return;
    $('boardModalTitle').textContent = window.lifeOsI18n.t('Edit Board');
    $('boardId').value = board.id;
    $('boardName').value = board.name;
    $('boardDescriptionInput').value = board.description || '';
    $('boardForm').elements.boardBackground.value = safeBoardBackground(board.background);
    $('deleteBoardBtn').hidden = false;
  } else {
    $('boardModalTitle').textContent = window.lifeOsI18n.t('New Board');
    $('boardForm').reset();
    $('boardId').value = '';
    $('deleteBoardBtn').hidden = true;
  }
  $('boardModal').showModal();
}

function handleBoardSubmit(e) {
  e.preventDefault();
  const boardId = $('boardId').value;
  const name = $('boardName').value.trim();
  const description = $('boardDescriptionInput').value.trim();
  const background = safeBoardBackground($('boardForm').elements.boardBackground.value);
  if (!name) {
    showToast(window.lifeOsI18n.t('Please enter a board name'), 'error');
    return;
  }
  if (boardId) {
    const board = getBoard(boardId);
    if (board) {
      board.name = name;
      board.description = description;
      board.background = background;
      showToast(window.lifeOsI18n.t('Board settings saved'), 'success');
    } else {
      showToast(window.lifeOsI18n.t('Board not found'), 'error');
    }
  } else {
    state.boards.push({...createBoard(name), description, background});
    state.activeBoardId = state.boards[state.boards.length - 1].id;
    showToast(window.lifeOsI18n.t('Board created'), 'success');
  }
  saveState();
  render();
  closeModal('boardModal');
}

function safeBoardBackground(value) {
  return ['default', 'mint', 'ocean', 'sunset', 'violet', 'slate'].includes(value) ? value : 'default';
}
