import { freeplayGame } from "./games/freeplay.js";
import { highcardGame } from "./games/highcard.js";
import { presidentGame } from "./games/president.js";
import { flipSevenGame } from "./games/flipSeven.js";

export const GAMES = {
  [freeplayGame.id]: freeplayGame,
  [highcardGame.id]: highcardGame,
  [presidentGame.id]: presidentGame,
  [flipSevenGame.id]: flipSevenGame,
};

export function gameList() {
  return Object.values(GAMES);
}

export function getGame(id) {
  return GAMES[id] || GAMES.freeplay;
}
