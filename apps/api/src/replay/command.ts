export function parseReplayMatchId(arguments_: readonly string[]): string {
  const matchId = arguments_[1];
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== '--match' ||
    matchId === undefined ||
    matchId.length === 0
  ) {
    throw new Error('Usage: pnpm replay --match <matchId>');
  }
  return matchId;
}
