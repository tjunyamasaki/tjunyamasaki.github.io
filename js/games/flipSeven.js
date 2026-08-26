import { cardLabel, shuffle } from "../cards.js";
import { setPlayerStatValue, ensurePlayerStats } from "../stats.js";
import {
  currentPlayerId,
  isInactive,
  isBusted,
  move,
  moveAll,
  resolveZone,
  setInactive,
  setBusted,
  clearInactive,
  rebuildTable,
  zoneItems,
} from "../tableState.js";
import {
  announce,
  applyTableAction,
  pushHistory,
  skipSeats,
  advanceTurn,
  canPlayerAct,
} from "../tableOps.js";

const WIN_POINTS = 200;
const ACTION_LABELS = new Set(["Freeze", "Flip Three"]);

function card(rank, copies) {
  return {
    kind: "card",
    face: { rank: String(rank), suit: "", symbol: "", color: "black" },
    copies,
  };
}

function token(label, copies, color = "black") {
  return { kind: "token", face: { label, color }, copies };
}

function flipSevenCatalog() {
  const catalog = [card(0, 1)];
  for (let n = 1; n <= 12; n++) catalog.push(card(n, n));
  catalog.push(
    token("Freeze", 3),
    token("Flip Three", 3),
    token("Second Chance", 3)
  );
  for (const label of ["+2", "+4", "+6", "+8", "+10", "x2"]) {
    catalog.push(token(label, 1, "red"));
  }
  return catalog;
}

function numberRank(el) {
  if (!el || el.kind === "token") return null;
  const rank = el.rank ?? el.face?.rank;
  if (rank == null || rank === "") return null;
  return String(rank);
}

function labelOf(el) {
  if (!el || el.kind !== "token") return "";
  return el.face?.label || el.label || "";
}

function line(ctx, playerId) {
  return zoneItems(ctx.ts, { role: "personal", owner: playerId });
}

function nameOf(ctx, playerId) {
  return ctx.players[playerId]?.name || "Player";
}

function activeIds(ctx) {
  return Object.keys(ctx.players).filter((id) => !isInactive(ctx.ts, id));
}

function pendingKind(items) {
  const action = items.find((el) => ACTION_LABELS.has(labelOf(el)));
  if (action) return labelOf(action);
  if (items.filter((el) => labelOf(el) === "Second Chance").length > 1) {
    return "Second Chance";
  }
  return null;
}

function pendingHolder(ctx) {
  for (const id of Object.keys(ctx.players)) {
    if (isInactive(ctx.ts, id)) continue;
    if (pendingKind(line(ctx, id))) return id;
  }
  return null;
}

function hasSecondChance(ctx, playerId) {
  return line(ctx, playerId).some((el) => labelOf(el) === "Second Chance");
}

function uniqueNumbers(items) {
  const ranks = new Set();
  for (const el of items) {
    const rank = numberRank(el);
    if (rank) ranks.add(rank);
  }
  return ranks;
}

function duplicateNumber(items) {
  const seen = new Set();
  for (const el of items) {
    const rank = numberRank(el);
    if (!rank) continue;
    if (seen.has(rank)) return rank;
    seen.add(rank);
  }
  return null;
}

function scoreLine(items) {
  let numbers = 0;
  let plus = 0;
  let times2 = false;
  for (const el of items) {
    const rank = numberRank(el);
    if (rank != null) {
      numbers += Number(rank);
      continue;
    }
    const lab = labelOf(el);
    if (lab === "x2") times2 = true;
    else if (lab.startsWith("+")) plus += Number(lab.slice(1)) || 0;
  }
  const flip7 = uniqueNumbers(items).size >= 7;
  let total = times2 ? numbers * 2 : numbers;
  total += plus;
  if (flip7) total += 15;
  return { total, flip7 };
}

function takeFromLine(ctx, owner, el) {
  if (!el) return;
  move(ctx.ts, {
    elementIds: [el.id],
    from: { role: "personal", owner },
    to: { id: "discard" },
  });
}

function giveFromLine(ctx, fromId, toId, el) {
  if (!el) return;
  move(ctx.ts, {
    elementIds: [el.id],
    from: { role: "personal", owner: fromId },
    to: { role: "personal", owner: toId },
  });
}

function firstToken(items, label) {
  return items.find((el) => labelOf(el) === label);
}

function lastNumber(items, rank) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (numberRank(items[i]) === rank) return items[i];
  }
  return null;
}

function ensureStock(ctx) {
  const stock = resolveZone(ctx.ts, { id: "stock" });
  if (stock?.items.length) return;
  moveAll(ctx.ts, { id: "discard" }, { id: "stock" });
  if (stock) stock.items = shuffle(stock.items);
}

function drawOne(ctx, owner) {
  ensureStock(ctx);
  const { moved } = move(ctx.ts, {
    count: 1,
    from: { id: "stock" },
    to: { role: "personal", owner },
    playedBy: owner,
  });
  const el = moved[0] || null;
  if (el) {
    if (!Array.isArray(ctx.ts.lastDrawn)) ctx.ts.lastDrawn = [];
    ctx.ts.lastDrawn.push(cardLabel(el));
  }
  return el;
}

function bust(ctx, playerId) {
  setBusted(ctx.ts, playerId);
}

function useSecondChance(ctx, playerId, rank) {
  takeFromLine(ctx, playerId, firstToken(line(ctx, playerId), "Second Chance"));
  takeFromLine(ctx, playerId, lastNumber(line(ctx, playerId), rank));
}

function legalTargets(ctx, owner, kind) {
  if (kind === "Second Chance") {
    return activeIds(ctx).filter(
      (id) => id !== owner && !hasSecondChance(ctx, id)
    );
  }
  return activeIds(ctx);
}

function passIfCurrent(ctx, playerId) {
  if (currentPlayerId(ctx.ts) === playerId) skipSeats(ctx.ts, ctx.settings);
}

function passAfterFlip(ctx, actorId) {
  if (pendingHolder(ctx)) return;
  if (currentPlayerId(ctx.ts) !== actorId) return;
  if (isInactive(ctx.ts, actorId)) {
    skipSeats(ctx.ts, ctx.settings);
    return;
  }
  advanceTurn(ctx.ts);
  skipSeats(ctx.ts, ctx.settings);
}

function nextTurnName(ctx) {
  return nameOf(ctx, currentPlayerId(ctx.ts));
}

function freezePlayer(ctx, targetId) {
  setInactive(ctx.ts, targetId);
}

function resolveCard(ctx, owner, el, { deferActions } = {}) {
  if (!el) return {};
  const rank = numberRank(el);
  if (rank != null) {
    const dup = duplicateNumber(line(ctx, owner));
    if (dup) {
      if (hasSecondChance(ctx, owner)) {
        useSecondChance(ctx, owner, dup);
        return { saved: dup };
      }
      bust(ctx, owner);
      return { busted: dup };
    }
    if (uniqueNumbers(line(ctx, owner)).size >= 7) return { flip7: true };
    return {};
  }
  const lab = labelOf(el);
  if (lab === "Second Chance") {
    if (line(ctx, owner).filter((item) => labelOf(item) === "Second Chance").length > 1) {
      return { pending: "Second Chance" };
    }
    return {};
  }
  if (ACTION_LABELS.has(lab) && !deferActions) return { pending: lab };
  return {};
}

function playFlipThree(ctx, targetId) {
  const notes = [];
  for (let n = 0; n < 3; n++) {
    if (isInactive(ctx.ts, targetId)) break;
    const el = drawOne(ctx, targetId);
    if (!el) {
      notes.push("deck empty");
      break;
    }
    const result = resolveCard(ctx, targetId, el, { deferActions: true });
    notes.push(cardLabel(el));
    if (result.saved) notes.push(`(Second Chance on ${result.saved})`);
    if (result.busted) return { busted: result.busted, notes };
    if (result.flip7) return { flip7: true, notes };
  }
  return { notes };
}

function resolvePending(ctx, owner, targetId) {
  const kind = pendingKind(line(ctx, owner));
  if (!kind) return "Nothing to play on a player.";
  const targets = legalTargets(ctx, owner, kind);
  if (kind === "Second Chance") {
    const extra = line(ctx, owner).filter((el) => labelOf(el) === "Second Chance")[1];
    if (!targets.length) {
      takeFromLine(ctx, owner, extra);
      announce(ctx, owner, "discarded an extra Second Chance.");
      return;
    }
    if (!targets.includes(targetId)) return "Pick an active player without a Second Chance.";
    giveFromLine(ctx, owner, targetId, extra);
    announce(
      ctx,
      owner,
      `gave a Second Chance to ${nameOf(ctx, targetId)}.`
    );
    return;
  }
  if (!targets.includes(targetId)) return "Pick an active player.";
  if (kind === "Freeze") {
    takeFromLine(ctx, owner, firstToken(line(ctx, owner), "Freeze"));
    freezePlayer(ctx, targetId);
    announce(ctx, owner, `froze ${nameOf(ctx, targetId)}.`);
    return;
  }
  takeFromLine(ctx, owner, firstToken(line(ctx, owner), "Flip Three"));
  const result = playFlipThree(ctx, targetId);
  if (result.busted) {
    announce(
      ctx,
      owner,
      `played Flip Three on ${nameOf(ctx, targetId)}, who busted on ${result.busted}.`
    );
    return;
  }
  if (result.flip7) {
    announce(
      ctx,
      owner,
      `played Flip Three on ${nameOf(ctx, targetId)}, who flipped 7 (${result.notes.join(", ")}).`
    );
    return { flip7: true };
  }
  announce(
    ctx,
    owner,
    `played Flip Three on ${nameOf(ctx, targetId)}: ${result.notes.join(", ") || "nothing"}.`
  );
}

function tryAutoPending(ctx, owner) {
  for (let i = 0; i < 8; i++) {
    const kind = pendingKind(line(ctx, owner));
    if (!kind) return;
    const targets = legalTargets(ctx, owner, kind);
    if (kind === "Second Chance" && !targets.length) {
      resolvePending(ctx, owner, owner);
      continue;
    }
    if (targets.length !== 1) return;
    resolvePending(ctx, owner, targets[0]);
  }
}

function afterPending(ctx, owner) {
  tryAutoPending(ctx, owner);
  const other = pendingHolder(ctx);
  if (other && other !== owner) tryAutoPending(ctx, other);
}

function endRound(ctx, reason) {
  const parts = [];
  for (const id of Object.keys(ctx.players)) {
    ensurePlayerStats(ctx.players[id]);
    if (isBusted(ctx.ts, id)) {
      parts.push(`${nameOf(ctx, id)} 0`);
      moveAll(ctx.ts, { role: "personal", owner: id }, { id: "discard" });
      continue;
    }
    const items = line(ctx, id);
    if (!items.length) {
      parts.push(`${nameOf(ctx, id)} 0`);
      continue;
    }
    const { total } = scoreLine(items);
    setPlayerStatValue(ctx.players[id], "points", (ctx.players[id].stats.points || 0) + total);
    parts.push(`${nameOf(ctx, id)} +${total}`);
    moveAll(ctx.ts, { role: "personal", owner: id }, { id: "discard" });
  }
  clearInactive(ctx.ts);
  ensureStock(ctx);
  skipSeats(ctx.ts, ctx.settings);
  const over = Object.keys(ctx.players).filter(
    (id) => (Number(ctx.players[id].stats?.points) || 0) >= WIN_POINTS
  );
  let msg = `${reason} ${parts.join(", ")}.`;
  if (over.length === 1) {
    ctx.phase = "ended";
    const winner = ctx.players[over[0]];
    msg += ` ${winner.name} wins with ${winner.stats.points}.`;
  } else {
    if (over.length > 1) msg += " Tie at 200+. Another round.";
    const next = nextTurnName(ctx);
    if (next) msg += ` ${next}'s turn.`;
  }
  ctx.message = msg;
}

function applyFlipSevenAction(ctx, actorId, intent) {
  const action = intent.action === "start" ? "startGame" : intent.action;

  if (action === "startGame") {
    if (ctx.phase === "ended") {
      for (const id of Object.keys(ctx.players)) {
        setPlayerStatValue(ctx.players[id], "points", 0);
      }
      rebuildTable(ctx.ts, Object.keys(ctx.players), ctx.settings);
    }
    return applyTableAction(ctx, actorId, intent);
  }

  if (action === "targetPlayer") {
    if (ctx.phase !== "playing") return "Start the game first.";
    const holder = pendingHolder(ctx);
    if (holder !== actorId) {
      return holder
        ? `${nameOf(ctx, holder)} must choose a player first.`
        : "Nothing to play on a player.";
    }
    const to = intent.playerId;
    if (!to || !ctx.players[to]) return "Pick a player.";
    pushHistory(ctx.ts, ctx.phase, ctx.message, ctx.players);
    const result = resolvePending(ctx, actorId, to);
    if (typeof result === "string") {
      ctx.ts.history.pop();
      return result;
    }
    afterPending(ctx, actorId);
    const before = currentPlayerId(ctx.ts);
    skipSeats(ctx.ts, ctx.settings);
    if (!pendingHolder(ctx) && currentPlayerId(ctx.ts) === before && !isInactive(ctx.ts, before)) {
      advanceTurn(ctx.ts);
      skipSeats(ctx.ts, ctx.settings);
    }
    const flip7Id = Object.keys(ctx.players).find(
      (id) => uniqueNumbers(line(ctx, id)).size >= 7
    );
    if (flip7Id || result?.flip7) {
      endRound(ctx, `${nameOf(ctx, flip7Id || actorId)} flipped 7!`);
      return;
    }
    if (!activeIds(ctx).length) {
      endRound(ctx, "Round over.");
      return;
    }
    const still = pendingHolder(ctx);
    if (still) {
      ctx.message += ` ${nameOf(ctx, still)} must choose a player.`;
      return;
    }
    const next = nextTurnName(ctx);
    if (next && !ctx.message.includes("turn")) ctx.message += ` ${next}'s turn.`;
    return;
  }

  const holder = pendingHolder(ctx);
  if (holder && (action === "drawCard" || action === "endTurn" || action === "stay")) {
    return `${nameOf(ctx, holder)} must choose a player first.`;
  }

  if (action === "drawCard") {
    const err = applyTableAction(ctx, actorId, intent);
    if (typeof err === "string") return err;
    const items = line(ctx, actorId);
    const el = items[items.length - 1];
    const result = resolveCard(ctx, actorId, el, { deferActions: false });
    afterPending(ctx, actorId);
    if (result.busted) {
      passIfCurrent(ctx, actorId);
      if (!activeIds(ctx).length) {
        endRound(ctx, `${nameOf(ctx, actorId)} busted on ${result.busted}.`);
        return;
      }
      const next = nextTurnName(ctx);
      announce(
        ctx,
        actorId,
        next
          ? `busted on ${result.busted}. ${next}'s turn.`
          : `busted on ${result.busted}.`
      );
      return;
    }
    if (result.flip7 || uniqueNumbers(line(ctx, actorId)).size >= 7) {
      endRound(ctx, `${nameOf(ctx, actorId)} flipped 7!`);
      return;
    }
    const still = pendingHolder(ctx);
    if (still) {
      announce(
        ctx,
        actorId,
        `drew ${cardLabel(el)}. ${nameOf(ctx, still)} must choose a player.`
      );
      return;
    }
    if (!activeIds(ctx).length) {
      endRound(ctx, "Round over.");
      return;
    }
    passAfterFlip(ctx, actorId);
    const next = nextTurnName(ctx);
    if (result.saved) {
      announce(
        ctx,
        actorId,
        next
          ? `used Second Chance on ${result.saved}. ${next}'s turn.`
          : `used Second Chance on ${result.saved}.`
      );
      return;
    }
    announce(
      ctx,
      actorId,
      next
        ? `drew ${cardLabel(el)}. ${next}'s turn.`
        : `drew ${cardLabel(el)}.`
    );
    return;
  }

  if (action === "stay" || action === "endTurn") {
    if (!canPlayerAct(ctx, actorId)) {
      return ctx.phase !== "playing" ? "Start the game first." : "Not your turn.";
    }
    pushHistory(ctx.ts, ctx.phase, ctx.message, ctx.players);
    setInactive(ctx.ts, actorId);
    skipSeats(ctx.ts, ctx.settings);
    const preview = scoreLine(line(ctx, actorId)).total;
    if (!activeIds(ctx).length) {
      endRound(ctx, `${nameOf(ctx, actorId)} stays (${preview}).`);
      return;
    }
    const next = nextTurnName(ctx);
    announce(
      ctx,
      actorId,
      next
        ? `stays (${preview}). ${next}'s turn.`
        : `stays (${preview}).`
    );
    return;
  }

  return applyTableAction(ctx, actorId, intent);
}

export const flipSevenGame = {
  id: "flipseven",
  name: "Flip Seven",
  blurb: "Flip unique numbers; bust on a duplicate. First to 200 wins.",
  layout: "table",
  tableActions: {
    placeShared: false,
    placePersonal: false,
    placeDiscard: false,
    endTurn: false,
    sendCards: false,
    betCoins: false,
    drawCard: true,
    stay: true,
    targetPlayer: true,
  },
  needsTarget(view, playerId) {
    return Boolean(pendingKind((view?.personal && view.personal[playerId]) || []));
  },
  preset: {
    catalog: flipSevenCatalog(),
    decks: 1,
    minPlayers: 2,
    maxPlayers: 8,
    ranks: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    suits: [],
    banished: [],
    spaces: {
      deck: true,
      table: false,
      special: false,
      personal: true,
      discard: true,
      hand: false,
    },
    handSortDefault: "rank",
    handSortModes: ["rank"],
    skipEmptyHands: false,
    opponentHandView: "collapsed",
    showPoints: true,
    showLives: false,
    showCoins: false,
    dealDest: "personal",
    drawDest: "personal",
    personalRows: 2,
    sharedRows: 1,
  },
  handSort: { default: "rank", modes: ["rank"] },
  applyAction: applyFlipSevenAction,
};
