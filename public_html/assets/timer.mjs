export function remainingSeconds(state, now) {
  return state.deadline === null ? state.remaining : Math.max(0, Math.ceil((state.deadline - now) / 1000));
}
export function nextMode(mode, completedSessions) {
  return mode === 'focus' ? (completedSessions > 0 && completedSessions % 4 === 0 ? 'long' : 'short') : 'focus';
}
