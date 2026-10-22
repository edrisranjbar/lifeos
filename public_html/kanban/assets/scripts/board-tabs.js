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

  const allGroup = document.createElement('div');
  allGroup.className = `board-tab-group all-projects-tab ${state.allProjects ? 'active' : ''}`;
  const allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = 'board-tab';
  allTab.setAttribute('aria-current', state.allProjects ? 'page' : 'false');
  allTab.innerHTML = '<span class="tab-name">All projects</span>';
  allTab.addEventListener('click', () => {
    state.allProjects = true;
    saveState();
    render();
  });
  allGroup.appendChild(allTab);
  container.appendChild(allGroup);

  state.boards.forEach(board => {
    const isActive = !state.allProjects && board.id === state.activeBoardId;
    const group = document.createElement('div');
    group.className = `board-tab-group ${isActive ? 'active' : ''}`;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'board-tab';
    tab.setAttribute('aria-current', isActive ? 'page' : 'false');
    tab.dataset.boardId = board.id;

    // Keep board navigation and settings as separate accessible buttons.
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = board.name;
    nameSpan.dataset.boardId = board.id;

    tab.insertBefore(nameSpan, tab.firstChild);

    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeBoardId = board.id;
      state.allProjects = false;
      saveState();
      render();
    });
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'board-settings';
    settings.title = 'Board settings';
    settings.setAttribute('aria-label', `Settings for ${board.name}`);
    settings.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 3-.5 2-2 1.2-2-.6L3 9l1.5 1.5v3L3 15l2 3.4 2-.6L9 19l.5 2h5l.5-2 2-1.2 2 .6 2-3.4-1.5-1.5v-3L21 9l-2-3.4-2 .6L15 5l-.5-2Z"/><circle cx="12" cy="12" r="3"/></svg>';
    settings.addEventListener('click', () => openBoardModal(board.id));
    group.append(tab, settings);
    container.appendChild(group);
  });

  // Add board tab
  const addTab = document.createElement('button');
  addTab.className = 'board-add-tab';
  addTab.title = 'Add new board';
  addTab.textContent = '+ New board';
  addTab.addEventListener('click', () => openBoardModal());
  container.appendChild(addTab);
}

function startBoardRename(tabNameEl, boardId) {
  createInlineEditor(tabNameEl, tabNameEl.textContent, 'board-rename-input', true, (save, value) => {
    const board = getBoard(boardId);
    if (save && board && value) { board.name = value; saveState(); }
    render();
  });
}

function startColumnRename(titleEl, columnId) {
  createInlineEditor(titleEl, titleEl.textContent, 'column-rename-input', true, (save, value) => {
    const column = getActiveBoard()?.columns.find(item => item.id === columnId);
    if (save && column && value) { column.name = value; saveState(); }
    render();
  });
}
