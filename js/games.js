import { freeplayGame } from "./games/freeplay.js";
import { presidentGame } from "./games/president.js";
import { flipSevenGame } from "./games/flipSeven.js";

export const GAMES = {
  [freeplayGame.id]: freeplayGame,
  [presidentGame.id]: presidentGame,
  [flipSevenGame.id]: flipSevenGame,
};

export function gameList() {
  return Object.values(GAMES);
}

export function getGame(id) {
  return GAMES[id] || GAMES.freeplay;
}
