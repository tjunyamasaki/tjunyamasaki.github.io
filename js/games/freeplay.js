import { defaultCardOrder } from "../cards.js";
import { applyTableAction } from "../tableOps.js";

export const freeplayGame = {
  id: "freeplay",
  name: "Free play (test)",
  blurb: "Sandbox table: table, personal spaces, discard, turns, host tools.",
  layout: "table",
  tableActions: {
    placeShared: true,
    placePersonal: true,
    placeDiscard: true,
    endTurn: true,
    sendCards: false,
    betCoins: true,
  },
  preset: {
    ...defaultCardOrder(),
    decks: 1,
    minPlayers: 1,
    maxPlayers: 15,
    banished: [],
    spaces: {
      deck: true,
      table: true,
      special: false,
      personal: true,
      discard: true,
      hand: true,
    },
    handSortDefault: "suit",
    handSortModes: ["suit", "rank"],
  },
  handSort: { default: "suit", modes: ["suit", "rank"] },
  applyAction: applyTableAction,
};
