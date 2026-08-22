import { freeplayGame } from "./games/freeplay.js";
import { highcardGame } from "./games/highcard.js";

export const GAMES = {
  [freeplayGame.id]: freeplayGame,
  [highcardGame.id]: highcardGame,
};

export function gameList() {
  return Object.values(GAMES);
}

export function getGame(id) {
  return GAMES[id] || GAMES.freeplay;
}
