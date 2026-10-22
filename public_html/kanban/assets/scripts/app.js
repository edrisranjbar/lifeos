document.addEventListener('DOMContentLoaded', async () => {
  await window.appStorageReady;
  loadState();
  applyTheme();
  setupEventListeners();
  render();
  const link = new URLSearchParams(location.search);
  const linkedBoard = getBoard(link.get('board'));
  if (linkedBoard && link.get('card')) {
    const linkedColumn = linkedBoard.columns.find(column => column.cards.some(card => card.id === link.get('card')));
    if (linkedColumn) {
      state.activeBoardId = linkedBoard.id;
      state.allProjects = false;
      saveState(); render();
      openCardModal({boardId: linkedBoard.id, columnId: linkedColumn.id, cardId: link.get('card')});
    }
  }
  checkCardReminders();
  setInterval(checkCardReminders, 60000);
});
