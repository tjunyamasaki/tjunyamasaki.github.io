/** Phase 2 reference contracts. Specification only, not runtime code.
 * Production remains vanilla .mjs with JSDoc. Retain v1 types not replaced here.
 * No Three/DOM types are allowed in persistent state or pure modules.
 */
export type SlimeId = `slime-${number}`;
export type FoodId = `food-${number}`;
export type UpgradeId = 'shrub' | 'pantry' | 'bloom' | 'beds';
export type TutorialStep = 'feed' | 'berry' | 'welcome' | 'upgrade' | 'throw' | 'pet' | 'camera';
export type Quality = 'auto' | 'high' | 'low';
export type PointXZ = { x: number; z: number }; // Finite bounded world-unit floats.
export type Activity = 'idle' | 'wandering' | 'seekingFood' | 'eating' | 'arriving' | 'yielding';
export type FoodStage = 'flying' | 'landed' | 'claimed' | 'eating';

export interface SlimeState {
  id: SlimeId;
  name: string;
  createdAtMs: number; // Logical economic time.
  boostUntilMs: number;
  feedCount: number;
  homeSlot: number; // 0..9; slime-n uses n-1.
}
export interface RouteState {
  points: PointXZ[]; // Includes exact start/end; 2..128, full swept clearance.
  length: number; // Finite >0; validated against sum of segment lengths.
  startedWorldMs: number;
  cycleCount: number; // ceil(length / 1.0), >=1; 1250ms cycles.
  distanceAlong: number; // 0..length; coherent with gait clock at latest world tick.
}
export interface WorldResident {
  id: SlimeId;
  position: PointXZ;
  yaw: number; // Normalized [-pi,pi]; face points local +Z.
  activity: Activity;
  route: RouteState | null;
  targetFoodId: FoodId | null;
  nextDecisionWorldMs: number;
  restUntilWorldMs: number;
  blockedSinceWorldMs: number | null;
  nextReplanWorldMs: number;
  behaviorCounter: number; // Stable keyed choices; no render-frame RNG.
}
export interface FoodState {
  id: FoodId;
  target: PointXZ;
  createdWorldMs: number; // timeMs+carryMs at throw; may lie between ticks.
  landAtWorldMs: number; // createdWorldMs+600.
  stage: FoodStage;
  claimedBy: SlimeId | null;
  eatUntilWorldMs: number | null; // Set to timeMs+800 when meal starts.
}
export interface WorldState {
  timeMs: number; // Completed active ms, integer multiple of 50.
  carryMs: number; // Integer 0..49, preserved in checkpoints.
  nextFoodSequence: number; // Positive safe integer; cannot wrap.
  foods: FoodState[]; // Maximum 12, unique IDs in sequence order.
  residents: WorldResident[]; // Same membership as GameState.slimes.
}
export interface GameState {
  simTimeMs: number;
  glowMicro: number;
  lifetimeGlowMicro: number;
  incomeRemainder: number;
  berries: number;
  nextBerryAtMs: number | null;
  nextThrowAllowedAtMs: number;
  totalFeeds: number;
  upgrades: Record<UpgradeId, number>;
  slimes: SlimeState[];
  tutorialCompleted: TutorialStep[];
  habitatId: 'farm-v2';
  arrivalStyleId: 'visitor-v1';
  world: WorldState;
}
export interface Settings {
  soundEnabled: boolean;
  reducedMotion: boolean | null;
  animationsPaused: boolean;
  quality: Quality;
}
export interface SaveEnvelope {
  gameId: 'cozy-slime-mvp';
  schemaVersion: 2;
  balanceVersion: 2;
  revision: number;
  savedWallMs: number;
  state: GameState;
  settings: Settings;
}
export type Command =
  | { type: 'THROW_FOOD'; target: PointXZ }
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId; expectedLevel: number };
// Pet, select, equip, camera and panel actions are transient controller intents.
// No normal FEED, WELCOME_COMPANION or externally dispatched CONSUME_FOOD remains.
export type RejectReason =
  | 'INVALID_COMMAND' | 'INVALID_TARGET' | 'NO_VALID_TARGET'
  | 'FOOD_LIMIT' | 'NO_BERRIES' | 'THROW_COOLDOWN' | 'ID_LIMIT'
  | 'UNKNOWN_UPGRADE' | 'MAX_LEVEL' | 'INSUFFICIENT_GLOW' | 'STALE_REQUEST';
export type GameEvent =
  | { type: 'FOOD_THROWN'; foodId: FoodId; target: PointXZ; atMs: number }
  | { type: 'FOOD_LANDED'; foodId: FoodId; atMs: number }
  | { type: 'FOOD_CLAIMED'; foodId: FoodId; slimeId: SlimeId; atMs: number }
  | { type: 'EATING_STARTED'; foodId: FoodId; slimeId: SlimeId; atMs: number }
  | { type: 'FED'; foodId: FoodId; slimeId: SlimeId; atMs: number; boostUntilMs: number }
  | { type: 'UPGRADE_BOUGHT'; upgradeId: UpgradeId; level: number; atMs: number }
  | { type: 'COMPANION_ADDED'; slimeId: SlimeId; homeSlot: number; atMs: number }
  | { type: 'TUTORIAL_COMPLETED'; step: TutorialStep; atMs: number };
export interface Transition { state: GameState; events: GameEvent[] }
export type CommandResult = Transition & ({ ok: true } | { ok: false; reason: RejectReason });
export interface AdvanceSummary {
  elapsedMs: number;
  glowEarnedMicro: number; // Actual wallet delta from income only.
  berriesGained: number; // Regen gained, not inventory net after throw.
  mealsCompleted: number;
  companionsAdded: SlimeId[];
}
export interface AdvanceResult extends Transition { summary: AdvanceSummary }

export declare function createInitialState(): GameState;
export declare function cloneState(state: GameState): GameState;
export declare function applyCommand(state: GameState, command: unknown): CommandResult;
export declare function resolveCompanionsNow(state: GameState): Transition;
export declare function completeHint(state: GameState, step: 'pet' | 'camera'): Transition;
export declare function advanceEconomy(state: GameState, elapsedMs: number): AdvanceResult;
export declare function advancePassive(state: GameState, elapsedMs: number): AdvanceResult;
export declare function advanceActive(state: GameState, elapsedMs: number): AdvanceResult;
// Economy/passive: integer elapsed in 0..28_800_000; active: 0..5_000.
// Active internally uses passive slices and 50ms world ticks; no browser clock reads.

export interface MealCompletion { foodId: FoodId; slimeId: SlimeId }
export interface WorldStepResult {
  world: WorldState;
  meals: MealCompletion[]; // Internal completion intents, not public commands.
  events: Extract<GameEvent, {type: 'FOOD_LANDED' | 'FOOD_CLAIMED' | 'EATING_STARTED'}>[];
}
export declare function stepWorld(state: Readonly<GameState>): WorldStepResult;
// Precondition: active wrapper has advanced world.timeMs one 50ms tick.
// The wrapper atomically finalizes meals and economic bonuses before exposing state.
export declare function createWorld(slimes: readonly SlimeState[]): WorldState;
export declare function syncWorldRoster(state: GameState): GameState;
export declare function planActiveArrival(state: GameState, id: SlimeId): GameState;
export declare function isValidFoodTarget(point: PointXZ): boolean;
export declare function resolveNearSelectedTarget(state: GameState, id: SlimeId): PointXZ | null;
export interface RouteResult { points: PointXZ[]; length: number }
// Reachability may return length 0 with one point when already in eating range;
// no RouteState is allocated for that result.
export declare function planRoute(args: {
  world: Readonly<WorldState>;
  residentId: SlimeId;
  destination: PointXZ;
  permitGate: boolean;
}): RouteResult | null;

export interface CompanionEligibility {
  nextPopulation: number | null;
  requiredFeeds: number;
  requiredLifetimeGlowMicro: number;
  requiredCapacity: number;
  feedsMet: boolean;
  glowMet: boolean;
  capacityMet: boolean;
  ready: boolean;
}
export declare function getRateMicroPerSecond(state: GameState): number;
export declare function getResidentCapacity(state: GameState): number;
export declare function getBerryCapacity(state: GameState): number;
export declare function getBerryIntervalMs(state: GameState): number;
export declare function getNextUpgradeCostMicro(state: GameState, id: UpgradeId): number | null;
export declare function getCompanionEligibility(state: GameState): CompanionEligibility;

export type ParseSaveResult =
  | { ok: true; kind: 'current'; save: SaveEnvelope }
  | { ok: true; kind: 'legacy-v1'; save: LegacyV1Envelope }
  | { ok: false; reason: 'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION' };
/** Exact old envelope validated under old rules; reference old contracts for fields. */
export interface LegacyV1Envelope {
  gameId: 'cozy-slime-mvp'; schemaVersion: 1; balanceVersion: 1;
  revision: number; savedWallMs: number;
  state: {
    simTimeMs: number; glowMicro: number; lifetimeGlowMicro: number; incomeRemainder: number;
    berries: number; nextBerryAtMs: number | null; nextFeedAllowedAtMs: number;
    totalFeeds: number; upgrades: Record<UpgradeId, number>; slimes: SlimeState[];
    tutorialCompleted: ('feed' | 'berry' | 'welcome' | 'upgrade')[];
    habitatId: 'garden-prototype-v1'; arrivalStyleId: 'visitor-v1';
  };
  settings: Settings;
}
export declare function validateSave(text: string): ParseSaveResult;
export interface ReconcileSummary extends AdvanceSummary {
  awayMs: number; creditedMs: number; capped: boolean; clockWentBackward: boolean;
}
export interface ReconcileResult { save: SaveEnvelope; summary: ReconcileSummary }
export declare function reconcileAway(save: SaveEnvelope, nowWallMs: number): ReconcileResult;
export declare function migrateV1(save: LegacyV1Envelope, nowWallMs: number): ReconcileResult;
// Migration reconciles LEGACY absence first, then converts and joins at now.

export type Tool = 'berry' | 'hand';
export type CameraMode = 'care' | 'orbit';
export interface CameraView {
  yaw: number; pitch: number; distance: number;
  target: { x: number; y: number; z: number };
  framing: 'overview' | 'custom';
}
export type Hit =
  | { kind: 'slime'; slimeId: SlimeId }
  | { kind: 'object'; upgradeId: UpgradeId }
  | { kind: 'ground'; point: PointXZ; valid: boolean }
  | { kind: 'none' };
export type InputIntent =
  | { type: 'WORLD_CLICK'; hit: Hit; tool: Tool }
  | { type: 'PET'; slimeId: SlimeId }
  | { type: 'SELECT'; slimeId: SlimeId }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_CAMERA_MODE'; mode: CameraMode }
  | { type: 'ZOOM'; factor: number }
  | { type: 'ORBIT'; dxCss: number; dyCss: number }
  | { type: 'PAN'; dxCss: number; dyCss: number }
  | { type: 'RESET_VIEW' }
  | { type: 'FOCUS_SELECTED' };
export interface SceneOptions {
  reducedMotion: boolean; animationsPaused: boolean; quality: Quality;
}
export interface SceneController {
  sync(state: Readonly<GameState>): void;
  play(events: readonly GameEvent[]): void;
  pet(id: SlimeId): void; // Purely visual; controller feedback cooldown.
  select(id: SlimeId | null): void;
  pick(clientX: number, clientY: number): Hit;
  setTool(tool: Tool): void;
  camera(intent: InputIntent): void;
  setOptions(options: SceneOptions): void;
  setVisible(visible: boolean): void;
  resize(widthCss: number, heightCss: number): void;
  update(renderNowMs: number, frameDeltaMs: number): void;
  render(): void;
  dispose(): void;
}
// Scene/camera expose methods; one pointer router owns DOM pointer/wheel listeners.
// Scene update, pet and play cannot issue economic commands or change saved world state.
