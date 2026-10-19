function cardDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatCardDueDate(value) {
  const date = parseCardDate(value);
  return date ? date.toLocaleDateString(window.lifeOsI18n.locale('en-GB'), { day: 'numeric', month: 'long' }) : value;
}

function parseCardDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return cardDateString(date) === value ? date : null;
}

function currentModalCard() {
  const {boardId, columnId, cardId} = state.cardModal;
  return getColumn(boardId, columnId)?.cards.find(card => card.id === cardId);
}

function updateCardDateSummary(card) {
  $('cardDates').hidden = !card.startDate && !card.dueDate;
  $('cardDateSummary').textContent = [card.startDate ? `Start ${formatCardDueDate(card.startDate)}` : '', card.dueDate ? `Due ${formatCardDueDate(card.dueDate)}${card.dueTime ? ' · ' + card.dueTime : ''}` : ''].filter(Boolean).join(' → ');
}

function openCardDates() {
  const card = currentModalCard();
  if (!card) return;
  const menu = $('cardDatesMenu');
  if (menu.matches(':popover-open')) { closeCardDates(); return; }
  $('datePickerStart').value = card.startDate || '';
  $('dateStartEnabled').checked = !!card.startDate;
  $('datePickerStart').disabled = !card.startDate;
  $('datePickerDue').value = card.dueDate || cardDateString(new Date());
  $('dateDueEnabled').checked = true;
  $('datePickerDue').disabled = false;
  $('datePickerTime').value = card.dueTime || '09:00';
  $('datePickerTime').disabled = false;
  $('datePickerRecurring').value = card.recurring || 'never';
  $('datePickerReminder').value = card.reminder || 'none';
  $('datePickerError').hidden = true;
  state.calendarTarget = 'Due';
  const selected = parseCardDate($('datePickerDue').value) || new Date();
  state.calendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  renderDateCalendar();
  menu.showPopover();
  const anchor = $('cardDatesBtn').getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - 12))}px`;
  menu.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - menu.offsetHeight - 12))}px`;
  $('closeCardDatesMenu').focus();
}

function closeCardDates() {
  $('cardDatesMenu').hidePopover();
  $('cardDatesBtn').focus();
}

function renderDateCalendar() {
  const month = state.calendarMonth;
  $('dateCalendarMonth').textContent = month.toLocaleDateString(window.lifeOsI18n.locale(), {month: 'long', year: 'numeric'});
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const today = cardDateString(new Date());
  const selected = $(`datePicker${state.calendarTarget}`).value;
  const grid = $('dateCalendarDays');
  grid.replaceChildren();
  for (let index = 0; index < 42; index++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
    const value = cardDateString(date);
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = window.lifeOsI18n.number(date.getDate());
    button.className = [date.getMonth() !== month.getMonth() ? 'outside-month' : '', value === today ? 'is-today' : '', value === selected ? 'is-selected' : ''].filter(Boolean).join(' ');
    button.setAttribute('aria-label', date.toLocaleDateString(window.lifeOsI18n.locale(), {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'}));
    button.setAttribute('aria-pressed', String(value === selected));
    if (value === today) button.setAttribute('aria-current', 'date');
    button.addEventListener('click', () => {
      const kind = state.calendarTarget;
      $(`datePicker${kind}`).value = value;
      $(`date${kind}Enabled`).checked = true;
      $(`datePicker${kind}`).disabled = false;
      if (kind === 'Due') $('datePickerTime').disabled = false;
      renderDateCalendar();
    });
    grid.append(button);
  }
}

function saveCardDates(remove) {
  const card = currentModalCard();
  if (!card) return;
  const startDate = !remove && $('dateStartEnabled').checked ? $('datePickerStart').value : '';
  const dueDate = !remove && $('dateDueEnabled').checked ? $('datePickerDue').value : '';
  if ((!remove && $('dateStartEnabled').checked && !parseCardDate(startDate)) || (!remove && $('dateDueEnabled').checked && !parseCardDate(dueDate)) || (startDate && dueDate && startDate > dueDate)) {
    $('datePickerError').textContent = window.lifeOsI18n.t('Choose valid dates. Start date must be on or before the due date.');
    $('datePickerError').hidden = false;
    return;
  }
  card.startDate = startDate;
  card.dueDate = dueDate;
  card.dueTime = dueDate ? ($('datePickerTime').value || '09:00') : '';
  card.recurring = dueDate ? $('datePickerRecurring').value : 'never';
  card.reminder = dueDate ? $('datePickerReminder').value : 'none';
  card.updatedAt = Date.now();
  card.reminderShown = '';
  $('cardDueDate').value = dueDate;
  updateCardDateSummary(card);
  saveState(); renderBoardContent(); closeCardDates();
  showToast(remove ? window.lifeOsI18n.t('Dates removed') : window.lifeOsI18n.t('Dates saved'), 'success');
}

function checkCardReminders() {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  for (const board of state.boards) {
    for (const column of board.columns) {
      for (const card of column.cards) {
        if (!card.dueDate || card.completed || card.reminder == null || card.reminder === 'none') continue;
        const due = new Date(`${card.dueDate}T${card.dueTime || '09:00'}`).getTime();
        const minutes = Number(card.reminder);
        if (!Number.isFinite(due) || ![0, 5, 60, 1440].includes(minutes)) continue;
        const key = `${card.dueDate}/${card.dueTime}/${card.reminder}`;
        if (now >= due - minutes * 60000 && now <= due + 86400000 && card.reminderShown !== key) {
          card.reminderShown = key;
          saveState();
          showToast(window.lifeOsI18n.t("Reminder: {value0} · due {value1} {value2}",{value0:card.title,value1:card.dueDate,value2:card.dueTime || '09:00'}));
          return;
        }
      }
    }
  }
}
