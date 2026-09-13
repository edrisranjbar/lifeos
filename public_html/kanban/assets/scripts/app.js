const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  boards: [],
  activeBoardId: null,
  editing: {
    type: null, // 'card' or 'column'
    id: null,
    element: null
  },
  dragging: {
    card: null,
    fromColumn: null,
    fromBoard: null
  },
  cardModal: {
    boardId: null,
    columnId: null,
    cardId: null
  }
};

const KEY = "kanban_boards_v1";

function applyTheme() {
  try {
    const theme = appStorage.getItem("edi_kanban_theme") ||
                  (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await window.appStorageReady;
  loadState();
  applyTheme();
  setupEventListeners();
  render();
});

function loadState() {
  try {
    const saved = appStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.boards = parsed.boards || [];
      state.activeBoardId = parsed.activeBoardId || null;
      if (!state.activeBoardId && state.boards.length > 0) {
        state.activeBoardId = state.boards[0].id;
      }
      // Migrate existing boards to new column structure
      state.boards.forEach(board => {
        if (board.columns && board.columns.length === 3) {
          // Add "To Review" and "Backlog" columns to existing boards
          const backlogCol = { id: crypto.randomUUID(), name: "Backlog", cards: [] };
          const reviewCol = { id: crypto.randomUUID(), name: "To Review", cards: [] };
          // Keep existing columns but rename if needed
          board.columns[0].name = "To Do";
          board.columns[1].name = "In Progress";
          board.columns[2].name = "Done";
          // Insert new columns
          board.columns.unshift(backlogCol);
          board.columns.splice(3, 0, reviewCol);
        }
      });
    } else {
      state.boards.push(createBoard("My Projects"));
      state.activeBoardId = state.boards[0].id;
    }
  } catch (e) {
    console.error("Failed to load kanban state:", e);
    state.boards = [createBoard("My Projects")];
    state.activeBoardId = state.boards[0].id;
  }
}

function setupEventListeners() {
  // Add board button
  $('addBoardBtn')?.addEventListener('click', () => openBoardModal());

  // Board form submit
  $('boardForm')?.addEventListener('submit', handleBoardSubmit);

  // Delete board
  $('deleteBoardBtn')?.addEventListener('click', () => {
    if (state.boards.length <= 1) {
      showToast('Cannot delete the last board', 'error');
      return;
    }
    if (!confirm('Delete this board and all its cards?')) return;
    const boardId = $('boardId').value;
    state.boards = state.boards.filter(b => b.id !== boardId);
    if (state.activeBoardId === boardId) {
      state.activeBoardId = state.boards[0].id;
    }
    saveState();
    render();
    closeModal('boardModal');
    showToast('Board deleted', 'success');
  });

  // Close modal
  $('closeBoardModal')?.addEventListener('click', () => closeModal('boardModal'));

  // Drag & drop for columns
  $('columnsContainer')?.addEventListener('dragover', handleCardContainerDragOver);
  $('columnsContainer')?.addEventListener('dragleave', handleCardContainerDragLeave);
  $('columnsContainer')?.addEventListener('drop', handleCardContainerDrop);

  // Close modal on backdrop click
  $('boardModal')?.addEventListener('click', (e) => {
    if (e.target === $('boardModal')) closeModal('boardModal');
  });

  // Card modal
  $('closeCardModal')?.addEventListener('click', closeCardModal);
  $('cardForm')?.addEventListener('submit', handleCardFormSubmit);
  $('cardModal')?.addEventListener('click', (e) => {
    if (e.target === $('cardModal')) closeCardModal();
  });
  $('deleteCardBtn')?.addEventListener('click', deleteCurrentCard);
  $('cardTitle')?.addEventListener('input', clearCardFormError);
  $('cardDescription')?.addEventListener('input', clearCardFormError);
  $('cardLabels')?.addEventListener('input', clearCardFormError);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('cardModal')?.open) closeCardModal();
      else if ($('boardModal')?.open) closeModal('boardModal');
    }
  });
}

function saveState() {
  try {
    appStorage.setItem(KEY, JSON.stringify({
      boards: state.boards,
      activeBoardId: state.activeBoardId
    }));
  } catch (e) {
    console.error("Failed to save kanban state:", e);
    showToast("Unable to save board", "error");
  }
}

function createBoard(name) {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "New Board",
    columns: [
      { id: crypto.randomUUID(), name: "Backlog", cards: [] },
      { id: crypto.randomUUID(), name: "To Do", cards: [] },
      { id: crypto.randomUUID(), name: "In Progress", cards: [] },
      { id: crypto.randomUUID(), name: "To Review", cards: [] },
      { id: crypto.randomUUID(), name: "Done", cards: [] }
    ],
    createdAt: Date.now()
  };
}

function getBoard(id) {
  return state.boards.find(b => b.id === id);
}

function getActiveBoard() {
  return getBoard(state.activeBoardId);
}

function getColumn(boardId, columnId) {
  const board = getBoard(boardId);
  if (!board) return null;
  return board.columns.find(c => c.id === columnId);
}

// Inline edit helpers
function startInlineEdit(element, currentValue, onSave) {
  // Remove any existing inline edit
  stopInlineEdit();

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue || '';
  input.className = 'inline-edit-input';
  input.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  `;
  input.style.boxSizing = 'border-box';

  // Blink effect - add flashing border
  let blinkInterval;
  let isHighlighted = false;
  const blink = () => {
    isHighlighted = !isHighlighted;
    input.style.borderColor = isHighlighted ? 'var(--accent)' : '';
  };
  blinkInterval = setInterval(blink, 300);
  input._blinkInterval = blinkInterval;

  const finish = (save) => {
    clearInterval(blinkInterval);
    if (save && onSave) {
      onSave(input.value.trim());
    } else {
      element.textContent = currentValue || '';
    }
    if (input.parentNode) {
      input.remove();
    }
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      finish(false);
    }
  });

  element.textContent = '';
  element.appendChild(input);
  input.focus();
  input.select();
}

function stopInlineEdit() {
  $$('.inline-edit-input').forEach(input => {
    if (input._blinkInterval) {
      clearInterval(input._blinkInterval);
    }
    input.remove();
  });
}

// Render everything
function render() {
  renderBoardTabs();
  renderBoardContent();
}

// Render board tabs
function renderBoardTabs() {
  const container = $('boardTabs');
  if (!container) return;

  container.innerHTML = '';

  state.boards.forEach(board => {
    const isActive = board.id === state.activeBoardId;
    const tab = document.createElement('button');
    tab.className = `board-tab ${isActive ? 'active' : ''}`;
    tab.dataset.boardId = board.id;

    const tabName = document.createElement('span');
    tabName.className = 'tab-name';
    tabName.textContent = board.name;
    tabName.dataset.boardId = board.id;

    tab.innerHTML = `${state.boards.length > 1 ? '<span class="tab-close">×</span>' : ''}`;

    // Add tab name span for renaming
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = board.name;
    nameSpan.dataset.boardId = board.id;

    // Double-click to rename
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startBoardRename(nameSpan, board.id);
    });

    tab.insertBefore(nameSpan, tab.firstChild);

    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('tab-close')) {
        if (state.boards.length <= 1) {
          showToast('Cannot delete the last board', 'error');
          return;
        }
        if (!confirm('Delete this board and all its cards?')) return;
        state.boards = state.boards.filter(b => b.id !== board.id);
        if (state.activeBoardId === board.id) {
          state.activeBoardId = state.boards.length > 0 ? state.boards[0].id : null;
        }
        saveState();
        render();
      } else {
        state.activeBoardId = board.id;
        saveState();
        render();
      }
    });

    container.appendChild(tab);
  });

  // Add board tab
  const addTab = document.createElement('button');
  addTab.className = 'board-add-tab';
  addTab.title = 'Add new board';
  addTab.innerHTML = '+';
  addTab.addEventListener('click', () => openBoardModal());
  container.appendChild(addTab);
}

function startBoardRename(tabNameEl, boardId) {
  const currentText = tabNameEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'board-rename-input';
  input.style.cssText = `
    width: 100%;
    padding: 4px 8px;
    background: var(--surface-2);
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
  `;

  let blinkInterval;
  let isHighlighted = false;
  const blink = () => {
    isHighlighted = !isHighlighted;
    input.style.borderColor = isHighlighted ? 'var(--accent)' : '';
  };
  blinkInterval = setInterval(blink, 300);
  input._blinkInterval = blinkInterval;

  tabNameEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = (save) => {
    clearInterval(blinkInterval);
    const newName = save ? input.value.trim() : currentText;
    const board = getBoard(boardId);
    if (board && newName) {
      board.name = newName;
      saveState();
    }
    render();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      finish(false);
    }
  });
}

function startColumnRename(titleEl, columnId) {
  const currentText = titleEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'column-rename-input';
  input.style.cssText = `
    width: 100%;
    padding: 2px 6px;
    background: var(--surface-2);
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    outline: none;
  `;

  let blinkInterval;
  let isHighlighted = false;
  const blink = () => {
    isHighlighted = !isHighlighted;
    input.style.borderColor = isHighlighted ? 'var(--accent)' : '';
  };
  blinkInterval = setInterval(blink, 300);
  input._blinkInterval = blinkInterval;

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = (save) => {
    clearInterval(blinkInterval);
    const newName = save ? input.value.trim() : currentText;
    const board = getActiveBoard();
    if (board && newName) {
      const col = board.columns.find(c => c.id === columnId);
      if (col) col.name = newName;
      saveState();
    }
    render();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      finish(false);
    }
  });
}

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
  showToast('Column moved', 'success');
}

// Render board content (columns and cards) - simplified inline approach
function renderBoardContent() {
  const container = $('columnsContainer');
  if (!container) return;

  const board = getActiveBoard();
  if (!board) {
    container.innerHTML = '<div class="empty-board"><h3>No boards</h3><p>Create a board to get started</p></div>';
    return;
  }

  container.innerHTML = '';

  board.columns.forEach(column => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.columnId = column.id;
    colEl.draggable = true;

    colEl.innerHTML = `
      <div class="column-header">
        <div class="column-title-wrap">
          <span class="column-title">${escapeHtml(column.name)}</span>
          <span class="column-count">${column.cards.length}</span>
        </div>
        <div class="column-menu">
          <button class="icon-btn delete-col-btn" title="Delete column" aria-label="Delete column">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="column-cards" id="column-${column.id}"></div>
      <div class="column-footer">
        <button class="add-card-btn" aria-label="Add card to ${column.name}">
          <span>+ Add card</span>
        </button>
      </div>
    `;

    // Rename column on double-click
    const titleSpan = colEl.querySelector('.column-title');
    titleSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startColumnRename(titleSpan, column.id);
    });

    // Add card button
    const addCardBtn = colEl.querySelector('.add-card-btn');
    addCardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Add a new card with default name
      const newCard = {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        priority: 'medium',
        labels: ''
      };
      column.cards.push(newCard);
      saveState();
      render();

      // Immediately start renaming the new card
      setTimeout(() => {
        const newCardEl = document.querySelector(`[data-card-id="${newCard.id}"] .card-title`);
        if (newCardEl) {
          startInlineEdit(newCardEl, '', (newValue) => {
            if (newValue) {
              newCard.title = newValue;
              newCardEl.textContent = newValue;
              saveState();
            } else {
              newCard.title = 'Untitled';
              newCardEl.textContent = 'Untitled';
              saveState();
            }
          });
        }
      }, 50);

      showToast('Card added', 'success');
    });

    // Delete column button
    const deleteColBtn = colEl.querySelector('.delete-col-btn');
    deleteColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (column.cards.length > 0) {
        if (!confirm(`Delete column "${column.name}" and all its ${column.cards.length} card(s)?`)) return;
      } else {
        if (!confirm(`Delete column "${column.name}"?`)) return;
      }
      const board = getActiveBoard();
      board.columns = board.columns.filter(c => c.id !== column.id);
      saveState();
      render();
      showToast('Column deleted', 'success');
    });

    // Column drag & drop
    colEl.addEventListener('dragstart', handleColumnDragStart);
    colEl.addEventListener('dragend', handleColumnDragEnd);
    colEl.addEventListener('dragover', (e) => {
      // Only allow column drop if no card is being dragged
      if (columnDragState.draggingColumnId && e.dataTransfer.types.indexOf('text/x-card-id') === -1) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    colEl.addEventListener('drop', handleColumnDropOnColumn);
    colEl.addEventListener('dragenter', handleColumnDragEnter);
    colEl.addEventListener('dragleave', handleColumnDragLeave);

    // Render cards
    const cardsContainer = colEl.querySelector('.column-cards');
    column.cards.forEach((card, cardIndex) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.dataset.cardId = card.id;
      cardEl.dataset.cardIndex = cardIndex;
      cardEl.draggable = true;

      // Priority badge
      const priorityClass = `priority-${card.priority || 'medium'}`;

      // Labels HTML
      const labelsHtml = (card.labels || '').split(',')
        .map(label => label.trim())
        .filter(label => label.length > 0)
        .map(label => {
          const labelLower = label.toLowerCase();
          let labelClass = 'label-medium';
          if (labelLower.includes('urgent') || labelLower.includes('high')) {
            labelClass = 'label-high';
          } else if (labelLower.includes('low')) {
            labelClass = 'label-low';
          }
          return `<span class="label-tag ${labelClass}">${escapeHtml(label)}</span>`;
        }).join('');

      // Card content with inline edit support
      cardEl.innerHTML = `
        <div class="card-header">
          <h3 class="card-title" contenteditable="false">${escapeHtml(card.title)}</h3>
          <button class="card-remove" title="Remove card" aria-label="Remove card">✕</button>
        </div>
        ${card.description ? `<p class="card-desc">${escapeHtml(card.description)}</p>` : ''}
        <div class="card-meta">
          <div class="card-labels">${labelsHtml}</div>
          <span class="card-priority-badge ${priorityClass}">${escapeHtml((card.priority || 'medium').toUpperCase())}</span>
        </div>
      `;

      // Make title editable on double-click
      const titleEl = cardEl.querySelector('.card-title');
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const currentText = titleEl.textContent.trim();
        startInlineEdit(titleEl, currentText, (newValue) => {
          if (newValue) {
            card.title = newValue;
            titleEl.textContent = newValue;
            saveState();
          } else {
            titleEl.textContent = currentText;
          }
        });
      });

      // Remove card
      cardEl.querySelector('.card-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete this card?')) return;
        column.cards.splice(cardIndex, 1);
        saveState();
        render();
        showToast('Card deleted', 'success');
      });

      // Click anywhere on card (except title/remove) opens edit modal
      cardEl.addEventListener('click', (e) => {
        if (e.target.closest('.card-remove')) return;
        if (e.target.closest('.card-title')) return; // dblclick handles title
        openCardModal({
          boardId: state.activeBoardId,
          columnId: column.id,
          cardId: card.id
        });
      });

      // Drag & drop
      cardEl.addEventListener('dragstart', handleDragStart);
      cardEl.addEventListener('dragend', handleDragEnd);

      cardsContainer.appendChild(cardEl);
    });

    container.appendChild(colEl);
  });

  // Single "Add column" button at the end
  const addColEl = document.createElement('div');
  addColEl.className = 'add-column-card';
  addColEl.innerHTML = `
    <button class="add-column-btn" aria-label="Add new column">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Add Column</span>
    </button>
  `;
  addColEl.querySelector('.add-column-btn').addEventListener('click', () => {
    const colName = prompt('Enter column name:');
    if (colName && colName.trim()) {
      const board = getActiveBoard();
      board.columns.push({
        id: crypto.randomUUID(),
        name: colName.trim(),
        cards: []
      });
      saveState();
      render();
      showToast('Column added', 'success');
    }
  });
  container.appendChild(addColEl);
}

// Modal handlers (kept for board management)
function openBoardModal(boardId = null) {
  // Defensive: if called with an event object, treat as new board
  if (boardId && typeof boardId === 'object') boardId = null;
  if (boardId && typeof boardId !== 'string') boardId = null;

  const modal = $('boardModal');
  if (boardId) {
    const board = getBoard(boardId);
    if (!board) return;
    $('boardModalTitle').textContent = 'Edit Board';
    $('boardId').value = board.id;
    $('boardName').value = board.name;
    $('deleteBoardBtn').hidden = false;
  } else {
    $('boardModalTitle').textContent = 'New Board';
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
  if (!name) {
    showToast('Please enter a board name', 'error');
    return;
  }
  if (boardId) {
    const board = getBoard(boardId);
    if (board) {
      board.name = name;
      showToast('Board renamed', 'success');
    } else {
      showToast('Board not found', 'error');
    }
  } else {
    state.boards.push(createBoard(name));
    state.activeBoardId = state.boards[state.boards.length - 1].id;
    showToast('Board created', 'success');
  }
  saveState();
  render();
  closeModal('boardModal');
}

// Drag & drop handlers
function handleDragStart(e) {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;

  state.dragging.card = cardEl;
  state.dragging.fromColumn = cardEl.closest('.column') ? cardEl.closest('.column').dataset.columnId : null;
  state.dragging.fromBoard = state.activeBoardId;

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

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;

  void toast.offsetWidth;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function closeModal(modalId) {
  const modal = $(modalId);
  if (modal && modal.open) {
    modal.close();
  }
}

// Card modal — open / close / save / delete
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
  $('cardLabels').value = card.labels || '';
  clearCardFormError();
  const meta = column.name + (card.updatedAt ? ' · updated ' + new Date(card.updatedAt).toLocaleDateString() : '');
  $('cardFormMeta').textContent = meta;
  $('cardModal').showModal();
  setTimeout(() => $('cardTitle').focus(), 60);
}

function closeCardModal() {
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

  card.title = title;
  card.description = $('cardDescription').value.trim();
  card.priority = $('cardPriority').value;
  card.labels = $('cardLabels').value.trim();
  card.updatedAt = Date.now();

  saveState();
  render();
  closeCardModal();
  showToast('Card saved', 'success');
}

function deleteCurrentCard() {
  const { boardId, columnId, cardId } = state.cardModal;
  if (!boardId || !columnId || !cardId) return;
  const board = getBoard(boardId);
  if (!board) return;
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  if (!confirm(`Delete card "${column.cards.find(c => c.id === cardId)?.title || ''}"?`)) return;
  column.cards = column.cards.filter(c => c.id !== cardId);
  saveState();
  render();
  closeCardModal();
  showToast('Card deleted', 'success');
}
