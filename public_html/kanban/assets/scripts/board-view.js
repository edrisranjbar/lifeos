// Render board content (columns and cards) - simplified inline approach
function closeColumnMenus() {
  document.querySelectorAll('.column-actions-menu').forEach(menu => { menu.hidden = true; });
  document.querySelectorAll('.column-actions').forEach(button => button.setAttribute('aria-expanded', 'false'));
}

function renderBoardContent() {
  const container = $('columnsContainer');
  if (!container) return;

  const board = getActiveBoard();
  if (!board) {
    container.innerHTML = window.lifeOsI18n.markup('<div class="empty-board"><h3>No boards</h3><p>Create a board to get started</p></div>');
    return;
  }

  $('boardMain').dataset.background = safeBoardBackground(board.background);
  $('boardHeading').textContent = board.name;
  $('boardDescription').textContent = board.description || '';
  $('boardDescription').hidden = !board.description;
  const cardCount = board.columns.reduce((total, column) => total + column.cards.length, 0);
  $('boardSummary').textContent = window.lifeOsI18n.t("{value0} lists · {value1} cards",{value0:board.columns.length,value1:cardCount});
  container.innerHTML = '';

  board.columns.forEach(column => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.columnId = column.id;
    colEl.draggable = true;

    colEl.innerHTML = `
      <div class="column-header">
        <div class="column-title-wrap">
          <span class="column-title">${escapeHtml(['Backlog','To Do','In Progress','To Review','Done'].includes(column.name)?window.lifeOsI18n.t(column.name):column.name)}</span>
          <span class="column-count">${column.cards.length}</span>
        </div>
        <div class="column-menu">
          <button class="icon-btn column-actions" type="button" aria-label="Actions for ${escapeHtml(['Backlog','To Do','In Progress','To Review','Done'].includes(column.name)?window.lifeOsI18n.t(column.name):column.name)}" aria-haspopup="menu" aria-expanded="false" title="${window.lifeOsI18n.t("Column actions")}">⋯</button>
          <div class="column-actions-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-action="add">${window.lifeOsI18n.t("Add card")}</button>
            <button type="button" role="menuitem" data-action="rename">${window.lifeOsI18n.t("Rename column")}</button>
            <div class="menu-divider" role="separator"></div>
            <button type="button" role="menuitem" data-action="delete" class="menu-danger">${window.lifeOsI18n.t("Delete column")}</button>
          </div>
        </div>
      </div>
      <div class="column-cards" id="column-${column.id}"></div>
      <div class="column-footer">
        <button class="add-card-btn" aria-label="Add card to ${escapeHtml(['Backlog','To Do','In Progress','To Review','Done'].includes(column.name)?window.lifeOsI18n.t(column.name):column.name)}">
          <span>${window.lifeOsI18n.t("+ Add card")}</span>
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
        labelIds: [],
        dueDate: '',
        checklist: []
      };
      column.cards.push(newCard);
      saveState();
      render();

      // Immediately start renaming the new card
      setTimeout(() => {
        const newCardEl = document.querySelector(`[data-card-id="${newCard.id}"] .card-title`);
        if (newCardEl) {
          // Escape or an empty title discards the card that was just created.
          const discard = () => {
            column.cards = column.cards.filter(c => c.id !== newCard.id);
            saveState();
            render();
          };
          startInlineEdit(newCardEl, '', (newValue) => {
            if (!newValue) { discard(); return; }
            newCard.title = newValue;
            newCardEl.textContent = newValue;
            saveState();
            showToast(window.lifeOsI18n.t('Card added'), 'success');
          }, discard);
        }
      }, 50);
    });

    const actionsButton = colEl.querySelector('.column-actions');
    const actionsMenu = colEl.querySelector('.column-actions-menu');
    colEl.querySelector('.column-menu').addEventListener('dragstart', e => e.stopPropagation());
    actionsButton.addEventListener('click', e => {
      e.stopPropagation();
      const opening = actionsMenu.hidden;
      closeColumnMenus();
      actionsMenu.hidden = !opening;
      actionsButton.setAttribute('aria-expanded', String(opening));
      if (opening) actionsMenu.querySelector('button').focus();
    });
    actionsMenu.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...actionsMenu.querySelectorAll('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement);
      items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
    actionsMenu.addEventListener('click', e => {
      e.stopPropagation();
      const action = e.target.closest('[data-action]')?.dataset.action;
      closeColumnMenus();
      if (action === 'add') { addCardBtn.click(); return; }
      if (action === 'rename') { startColumnRename(titleSpan, column.id); return; }
      if (action !== 'delete') return;
      if (column.cards.length > 0) {
        if (!confirm(window.lifeOsI18n.t("Delete column \"{value0}\" and all its {value1} card(s)?",{value0:column.name,value1:column.cards.length}))) return;
      } else {
        if (!confirm(window.lifeOsI18n.t("Delete column \"{value0}\"?",{value0:column.name}))) return;
      }
      const board = getActiveBoard();
      board.columns = board.columns.filter(c => c.id !== column.id);
      saveState();
      render();
      showToast(window.lifeOsI18n.t('Column deleted'), 'success');
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

      const priority = ['low', 'medium', 'high'].includes(card.priority) ? card.priority : 'medium';
      const priorityClass = `priority-${priority}`;

      // Labels HTML
      const labelsHtml = (card.labelIds || []).map(id => board.labelDefs.find(label => label.id === id)).filter(Boolean)
        .map(label => `<span class="label-tag" style="background:${safeLabelColor(label.color)};color:${labelTextColor(label.color)}">${escapeHtml(label.name)}</span>`).join('');
      const checklist = card.checklist || [];
      const completed = checklist.filter(item => item.done).length;
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(card.dueDate || '') ? card.dueDate : '';
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dueClass = dueDate && column.name.toLowerCase() !== 'done' ? (dueDate < today ? 'overdue' : dueDate === today ? 'due-today' : '') : '';

      // Card content with inline edit support
      cardEl.innerHTML = `
        <div class="card-header">
          <span class="priority-dot ${priorityClass}" role="img" aria-label="${escapeHtml(window.lifeOsI18n.t(priority + ' priority'))}" title="${escapeHtml(window.lifeOsI18n.t(priority + ' priority'))}"></span>
          <h3 class="card-title" contenteditable="false">${escapeHtml(card.title)}</h3>
          <details class="card-menu"><summary aria-label="${window.lifeOsI18n.t("Card actions")}" title="${window.lifeOsI18n.t("Card actions")}">⋯</summary><div class="card-actions-menu"><button type="button" data-action="edit">${window.lifeOsI18n.t("Edit card")}</button><button type="button" data-action="move">${window.lifeOsI18n.t("Move to another project")}</button><button type="button" data-action="goal">${window.lifeOsI18n.t("Move to goal")}</button><button type="button" data-action="delete" class="menu-danger">${window.lifeOsI18n.t("Delete card")}</button></div></details>
        </div>
        ${card.description ? `<p class="card-desc">${escapeHtml(card.description)}</p>` : ''}
        ${labelsHtml ? `<div class="card-meta"><div class="card-labels">${labelsHtml}</div></div>` : ''}
        ${(dueDate || checklist.length) ? `<div class="card-details-meta">${dueDate ? `<span class="due-badge ${dueClass}" title="Due ${escapeHtml(dueDate)}">◷ ${escapeHtml(formatCardDueDate(dueDate))}</span>` : ''}${checklist.length ? `<span class="checklist-badge" title="${window.lifeOsI18n.t("Checklist progress")}">☑ ${completed}/${checklist.length}</span>` : ''}</div>` : ''}
      `;

      // Remove card
      cardEl.querySelector('.card-menu').addEventListener('click', (e) => e.stopPropagation());
      cardEl.querySelector('.card-menu').addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
      cardEl.querySelector('[data-action="edit"]').addEventListener('click', () => {
        cardEl.querySelector('.card-menu').open = false;
        openCardModal({ boardId: board.id, columnId: column.id, cardId: card.id });
      });
      cardEl.querySelector('[data-action="move"]').addEventListener('click', () => {
        cardEl.querySelector('.card-menu').open = false;
        openMoveCard({boardId: board.id, columnId: column.id, cardId: card.id, fromEditor: false});
      });
      cardEl.querySelector('[data-action="goal"]').addEventListener('click', () => {
        cardEl.querySelector('.card-menu').open = false;
        openGoalCard({boardId: board.id, columnId: column.id, cardId: card.id, fromEditor: false});
      });
      cardEl.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(window.lifeOsI18n.t('Delete this card?'))) return;
        column.cards.splice(cardIndex, 1);
        saveState();
        render();
        showToast(window.lifeOsI18n.t('Card deleted'), 'success');
      });

      // Open details from any part of the card, as on a Trello board.
      cardEl.addEventListener('click', (e) => {
        if (e.target.closest('.card-menu')) return;
        if (e.target.closest('.inline-edit-input')) return;
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
    <button class="add-column-btn" aria-label="${window.lifeOsI18n.t("Add new column")}">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>${window.lifeOsI18n.t("Add Column")}</span>
    </button>
  `;
  addColEl.querySelector('.add-column-btn').addEventListener('click', () => {
    const colName = prompt(window.lifeOsI18n.t('Enter column name:'));
    if (colName && colName.trim()) {
      const board = getActiveBoard();
      board.columns.push({
        id: crypto.randomUUID(),
        name: colName.trim(),
        cards: []
      });
      saveState();
      render();
      showToast(window.lifeOsI18n.t('Column added'), 'success');
    }
  });
  container.appendChild(addColEl);
}
