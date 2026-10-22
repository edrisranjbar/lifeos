const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  boards: [],
  activeBoardId: null,
  allProjects: false,
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
  },
  draftLabelIds: [],
  draftChecklists: []
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


function loadState() {
  try {
    const saved = appStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.boards = parsed.boards || [];
      state.activeBoardId = parsed.activeBoardId || null;
      state.allProjects = parsed.allProjects === true;
      if (!state.activeBoardId && state.boards.length > 0) {
        state.activeBoardId = state.boards[0].id;
      }
      // Migrate existing boards to new column structure
      let migrated = false;
      state.boards.forEach(board => {
        if (board.columns && board.columns.length === 3) {
          migrated = true;
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
        if (!Array.isArray(board.labelDefs)) { board.labelDefs = []; migrated = true; }
        board.columns.forEach(column => column.cards.forEach(card => {
          if (!Array.isArray(card.labelIds)) {
            migrated = true;
            card.labelIds = (card.labels || '').split(',').map(name => name.trim()).filter(Boolean).map(name => {
              let definition = board.labelDefs.find(label => label.name.toLowerCase() === name.toLowerCase());
              if (!definition) {
                const lower = name.toLowerCase();
                definition = {id: crypto.randomUUID(), name, color: lower.includes('urgent') || lower.includes('high') ? '#dc2626' : lower.includes('low') ? '#16a34a' : '#d97706'};
                board.labelDefs.push(definition);
              }
              return definition.id;
            });
            delete card.labels;
          }
          if (!Array.isArray(card.checklist)) { card.checklist = []; migrated = true; }
          if (typeof card.dueDate !== 'string') { card.dueDate = ''; migrated = true; }
        }));
      });
      if (migrated) saveState();
    } else {
      state.boards.push(createBoard(window.lifeOsI18n.t("My Projects")));
      state.activeBoardId = state.boards[0].id;
    }
  } catch (e) {
    console.error("Failed to load kanban state:", e);
    state.boards = [createBoard(window.lifeOsI18n.t("My Projects"))];
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
      showToast(window.lifeOsI18n.t('Cannot delete the last board'), 'error');
      return;
    }
    if (!confirm(window.lifeOsI18n.t('Delete this board and all its cards?'))) return;
    const boardId = $('boardId').value;
    state.boards = state.boards.filter(b => b.id !== boardId);
    if (state.activeBoardId === boardId) {
      state.activeBoardId = state.boards[0].id;
    }
    saveState();
    render();
    closeModal('boardModal');
    showToast(window.lifeOsI18n.t('Board deleted'), 'success');
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
  $('moveCardBtn').addEventListener('click', () => {
    document.querySelector('.editor-more').open = false;
    openMoveCard({...state.cardModal, fromEditor: true});
  });
  $('moveCardProject').addEventListener('change', renderMoveCardLists);
  $('moveCardForm').addEventListener('submit', moveCardToProject);
  ['closeMoveCard', 'cancelMoveCard'].forEach(id => $(id).addEventListener('click', () => {
    if (!state.moveCard?.busy) $('moveCardModal').close();
  }));
  $('moveCardModal').addEventListener('click', event => {
    if (event.target === $('moveCardModal') && !state.moveCard?.busy) $('moveCardModal').close();
  });
  $('moveCardModal').addEventListener('cancel', event => { if (state.moveCard?.busy) event.preventDefault(); });
  $('goalCardBtn').addEventListener('click', () => {
    document.querySelector('.editor-more').open = false;
    openGoalCard({...state.cardModal, fromEditor: true});
  });
  $('goalCardForm').addEventListener('submit', moveCardToGoal);
  ['closeGoalCard', 'cancelGoalCard'].forEach(id => $(id).addEventListener('click', () => {
    if (!state.goalCard?.busy) $('goalCardModal').close();
  }));
  $('goalCardModal').addEventListener('click', event => {
    if (event.target === $('goalCardModal') && !state.goalCard?.busy) $('goalCardModal').close();
  });
  $('goalCardModal').addEventListener('cancel', event => { if (state.goalCard?.busy) event.preventDefault(); });
  $('cardTitle')?.addEventListener('input', clearCardFormError);
  $('cardDescription')?.addEventListener('input', clearCardFormError);
  $('addLabelBtn')?.addEventListener('click', addBoardLabel);
  $('newLabelName')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBoardLabel(); } });
  $('cardAddBtn').addEventListener('click', () => {
    const menu = $('cardAddMenu');
    if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
    menu.showPopover();
    const buttonRect = $('cardAddBtn').getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(buttonRect.left, window.innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(buttonRect.bottom + 8, window.innerHeight - menu.offsetHeight - 12))}px`;
    $('closeCardAddMenu').focus();
  });
  $('cardAddMenu').addEventListener('toggle', e => $('cardAddBtn').setAttribute('aria-expanded', String(e.newState === 'open')));
  $('closeCardAddMenu').addEventListener('click', () => { $('cardAddMenu').hidePopover(); $('cardAddBtn').focus(); });
  document.querySelectorAll('[data-add-target]').forEach(button => button.addEventListener('click', () => {
    $('cardAddMenu').hidePopover();
    if (button.dataset.addTarget === 'cardDates') { openCardDates(); return; }
    if (button.dataset.addTarget === 'cardChecklistSection') { openChecklistMenu(); return; }
    if (button.dataset.addTarget === 'cardAttachmentsSection') { openAttachmentMenu(); return; }
    const panel = $(button.dataset.addTarget);
    panel.hidden = false;
    document.querySelectorAll(`[data-editor-target="${panel.id}"]`).forEach(trigger => trigger.setAttribute('aria-expanded', 'true'));
    panel.scrollIntoView({block: 'nearest'});
    panel.querySelector('input, select, textarea')?.focus();
  }));
  $('addCustomFieldBtn').addEventListener('click', () => {
    state.draftCustomFields.push({id: crypto.randomUUID(), name: '', value: ''});
    renderCustomFields();
    $('cardCustomFields').lastElementChild?.querySelector('input')?.focus();
  });
  window.addEventListener('resize', () => { if ($('cardAddMenu').matches(':popover-open')) $('cardAddMenu').hidePopover(); });
  $('cardDatesBtn').addEventListener('click', openCardDates);
  $('cardChecklistBtn').addEventListener('click', openChecklistMenu);
  $('closeCardChecklistMenu').addEventListener('click', closeChecklistMenu);
  $('cardChecklistMenu').addEventListener('toggle', e => $('cardChecklistBtn').setAttribute('aria-expanded', String(e.newState === 'open')));
  $('createChecklistBtn').addEventListener('click', createCardChecklist);
  $('newChecklistTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); createCardChecklist(); } });
  window.addEventListener('resize', () => { if ($('cardChecklistMenu').matches(':popover-open')) closeChecklistMenu(); });
  $('cardDateSummary').addEventListener('click', openCardDates);
  $('closeCardDatesMenu').addEventListener('click', closeCardDates);
  $('cardDatesMenu').addEventListener('toggle', e => $('cardDatesBtn').setAttribute('aria-expanded', String(e.newState === 'open')));
  $('saveCardDatesBtn').addEventListener('click', () => saveCardDates(false));
  $('removeCardDatesBtn').addEventListener('click', () => saveCardDates(true));
  document.querySelectorAll('[data-calendar-shift]').forEach(button => button.addEventListener('click', () => {
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + Number(button.dataset.calendarShift), 1);
    renderDateCalendar();
  }));
  ['Start', 'Due'].forEach(kind => {
    $(`date${kind}Enabled`).addEventListener('change', () => {
      $(`datePicker${kind}`).disabled = !$(`date${kind}Enabled`).checked;
      if (kind === 'Due') $('datePickerTime').disabled = !$('dateDueEnabled').checked;
      if ($(`date${kind}Enabled`).checked) state.calendarTarget = kind;
      renderDateCalendar();
    });
    $(`datePicker${kind}`).addEventListener('focus', () => { state.calendarTarget = kind; renderDateCalendar(); });
    $(`datePicker${kind}`).addEventListener('change', () => {
      const date = parseCardDate($(`datePicker${kind}`).value);
      if (date) state.calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      state.calendarTarget = kind;
      renderDateCalendar();
    });
  });
  window.addEventListener('resize', () => { if ($('cardDatesMenu').matches(':popover-open')) closeCardDates(); });
  document.querySelectorAll('[data-editor-target]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.editorTarget === 'cardAttachmentsSection') { openAttachmentMenu(); return; }
      const panel = $(button.dataset.editorTarget);
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input, select, textarea')?.focus();
    });
  });
  $('editDescriptionBtn').addEventListener('click', () => {
    const editing = $('cardDescription').hidden;
    $('cardDescription').hidden = !editing;
    $('cardDescriptionPreview').hidden = editing;
    $('editDescriptionBtn').textContent = editing ? window.lifeOsI18n.t('Done') : window.lifeOsI18n.t('Edit');
    if (editing) $('cardDescription').focus();
    else $('cardDescriptionPreview').textContent = $('cardDescription').value || window.lifeOsI18n.t('Add a more detailed description…');
  });
  $('cardComment').addEventListener('input', () => { $('saveCommentBtn').hidden = !$('cardComment').value.trim(); });
  $('saveCommentBtn').addEventListener('click', saveCardComment);
  $('toggleActivityDetails').addEventListener('click', () => {
    const showing = $('cardActivityDetails').hidden;
    $('cardActivityDetails').hidden = !showing;
    $('toggleActivityDetails').textContent = showing ? window.lifeOsI18n.t('Hide details') : window.lifeOsI18n.t('Show details');
    $('toggleActivityDetails').setAttribute('aria-expanded', String(showing));
  });
  $('closeCardAttachMenu').addEventListener('click', () => $('cardAttachMenu').hidePopover());
  $('uploadCardFiles').addEventListener('change', async e => { await uploadCardFiles(Array.from(e.target.files || [])); e.target.value = ''; });
  const dropZone = $('attachmentDropZone');
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); }));
  dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); uploadCardFiles(Array.from(e.dataTransfer.files || [])); });
  window.addEventListener('resize', () => { if ($('cardAttachMenu').matches(':popover-open')) $('cardAttachMenu').hidePopover(); });

  document.addEventListener('click', e => {
    if (!e.target.closest('.column-menu')) closeColumnMenus();
    document.querySelectorAll('.card-menu[open]').forEach(menu => { if (!menu.contains(e.target)) menu.open = false; });
  });
  document.addEventListener('toggle', e => {
    if (e.target.matches('.card-menu') && e.target.open) {
      closeColumnMenus();
      document.querySelectorAll('.card-menu[open]').forEach(menu => { if (menu !== e.target) menu.open = false; });
    }
  }, true);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('moveCardModal').open) return;
      if ($('cardAttachMenu').matches(':popover-open')) { e.preventDefault(); $('cardAttachMenu').hidePopover(); return; }
      if ($('cardChecklistMenu').matches(':popover-open')) { e.preventDefault(); closeChecklistMenu(); return; }
      if ($('cardDatesMenu').matches(':popover-open')) { e.preventDefault(); closeCardDates(); return; }
      if ($('cardAddMenu').matches(':popover-open')) { e.preventDefault(); $('cardAddMenu').hidePopover(); $('cardAddBtn').focus(); return; }
      const cardMenu = document.querySelector('.card-menu[open]');
      if (cardMenu) { cardMenu.open = false; cardMenu.querySelector('summary').focus(); return; }
      const openMenuButton = document.querySelector('.column-actions[aria-expanded="true"]');
      if (openMenuButton) { closeColumnMenus(); openMenuButton.focus(); }
      else if ($('cardModal')?.open) closeCardModal();
      else if ($('boardModal')?.open) closeModal('boardModal');
    }
  });
}

function saveState() {
  try {
    appStorage.setItem(KEY, JSON.stringify({
      boards: state.boards,
      activeBoardId: state.activeBoardId,
      allProjects: state.allProjects
    }));
  } catch (e) {
    console.error("Failed to save kanban state:", e);
    showToast(window.lifeOsI18n.t("Unable to save board"), "error");
  }
}

function createBoard(name) {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "New Board",
    labelDefs: [],
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
