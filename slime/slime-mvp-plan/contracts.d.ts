/** Reference contracts for the MVP. Runtime modules are .mjs with JSDoc.
 * Do not introduce a TypeScript bundler merely to consume this file.
 */
export type SlimeId = `slime-${number}`;
export type UpgradeId = 'shrub' | 'pantry' | 'bloom' | 'beds';
export type TutorialStep = 'feed' | 'berry' | 'welcome' | 'upgrade';
export type Quality = 'auto' | 'high' | 'low';
export type ArrivalStyleId = 'visitor-v1'; // Extend only after a new presenter is approved.
export type HabitatId = 'garden-prototype-v1';

export interface SlimeState {
  id: SlimeId;
  name: string; // Default names in v1; render using textContent.
  createdAtMs: number; // Logical simulation time, NOT a Unix date.
  boostUntilMs: number;
  feedCount: number;
  homeSlot: number; // 0..5, unique and stable; initial resident uses 0.
}

export interface GameState {
  simTimeMs: number; // Nonnegative safe integer, logical time since fresh game.
  glowMicro: number;
  lifetimeGlowMicro: number;
  incomeRemainder: number; // Integer 0..999 from division by 1000.
  berries: number;
  nextBerryAtMs: number | null; // Null iff inventory is full.
  nextFeedAllowedAtMs: number;
  totalFeeds: number;
  upgrades: Record<UpgradeId, number>;
  slimes: SlimeState[];
  tutorialCompleted: TutorialStep[];
  habitatId: HabitatId;
  arrivalStyleId: ArrivalStyleId;
}

export interface Settings {
  soundEnabled: boolean;
  reducedMotion: boolean | null; // Null means follow OS preference.
  animationsPaused: boolean;
  quality: Quality;
}

export type Command =
  | { type: 'FEED'; slimeId: SlimeId }
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId; expectedLevel: number }
  | { type: 'WELCOME_COMPANION'; expectedPopulation: number };

export type RejectReason =
  | 'UNKNOWN_SLIME' | 'NO_BERRIES' | 'FEED_COOLDOWN'
  | 'UNKNOWN_UPGRADE' | 'MAX_LEVEL' | 'INSUFFICIENT_GLOW'
  | 'STALE_REQUEST' | 'NOT_READY' | 'POPULATION_CAP' | 'INVALID_COMMAND';

export type GameEvent =
  | { type: 'FED'; slimeId: SlimeId; atMs: number; boostUntilMs: number }
  | { type: 'UPGRADE_BOUGHT'; upgradeId: UpgradeId; level: number; atMs: number }
  | { type: 'COMPANION_ADDED'; slimeId: SlimeId; homeSlot: number; atMs: number }
  | { type: 'TUTORIAL_COMPLETED'; step: TutorialStep; atMs: number };

export interface Transition {
  state: GameState;
  events: GameEvent[]; // Ephemeral: never saved or replayed after load.
}
export type CommandResult = Transition &
  ({ ok: true } | { ok: false; reason: RejectReason });

export interface AdvanceSummary {
  elapsedMs: number;
  glowEarnedMicro: number; // Wallet increase, respecting cap.
  berriesGained: number;
}
export interface AdvanceResult extends Transition { summary: AdvanceSummary }

export interface CompanionEligibility {
  nextPopulation: number | null; // Null at cap.
  requiredFeeds: number;
  requiredLifetimeGlowMicro: number;
  requiredCapacity: number;
  feedsMet: boolean;
  glowMet: boolean;
  capacityMet: boolean;
  ready: boolean;
}

export interface SaveEnvelope {
  gameId: 'cozy-slime-mvp';
  schemaVersion: 1;
  balanceVersion: 1;
  revision: number;
  savedWallMs: number; // Date.now checkpoint, matching the saved state.
  state: GameState;
  settings: Settings;
}
export type ParseSaveResult =
  | { ok: true; save: SaveEnvelope }
  | { ok: false; reason: 'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION' };

// Pure core. No DOM, Three.js, performance.now(), Date.now(), or Math.random().
export declare function createInitialState(): GameState;
export declare function advance(state: GameState, elapsedMs: number): AdvanceResult;
// advance accepts 0..28_800_000 ms. Controller divides longer visible work into chunks.
export declare function applyCommand(state: GameState, command: Command): CommandResult;
export declare function getRateMicroPerSecond(state: GameState): number;
export declare function getBerryCapacity(state: GameState): number;
export declare function getBerryIntervalMs(state: GameState): number;
export declare function getResidentCapacity(state: GameState): number;
export declare function getNextUpgradeCostMicro(state: GameState, id: UpgradeId): number | null;
export declare function getCompanionEligibility(state: GameState): CompanionEligibility;
export declare function validateSave(text: string): ParseSaveResult;

export interface ReconcileResult {
  save: SaveEnvelope;
  summary: AdvanceSummary & { awayMs: number; creditedMs: number; capped: boolean; clockWentBackward: boolean };
}
export declare function reconcileAway(save: SaveEnvelope, nowWallMs: number): ReconcileResult;

// Renderer API owns Three objects internally. No Three types leak into the core.
export interface SceneOptions {
  reducedMotion: boolean;
  animationsPaused: boolean;
  quality: Quality;
  inspectionMode?: boolean;
}
export interface SceneController {
  sync(state: GameState): void; // Reconcile resident IDs, levels, bonus state; no economics.
  play(events: readonly GameEvent[]): void;
  select(slimeId: SlimeId | null): void;
  setOptions(options: SceneOptions): void;
  setVisible(visible: boolean): void;
  resize(widthCssPx: number, heightCssPx: number): void;
  update(renderNowMs: number, frameDeltaMs: number): void;
  render(): void;
  dispose(): void;
}
export declare function createScene(
  container: HTMLElement,
  options: SceneOptions,
  callbacks: { onSelect(id: SlimeId): void; onError(message: string): void },
): SceneController;

export interface PointXZ { x: number; z: number }
export interface HabitatLayout {
  id: HabitatId;
  walkRadius: number;
  slimeFootprintRadius: number;
  homeSlots: readonly PointXZ[]; // Exactly 6 slots for v1.
  wanderSlots: readonly PointXZ[];
  entryPoint: PointXZ;
  foodPoint: PointXZ;
  cameraTarget: { x: number; y: number; z: number };
}

export interface ViewModel {
  selectedSlimeId: SlimeId | null;
  state: Readonly<GameState>;
  rateMicroPerSecond: number;
  companion: CompanionEligibility;
  storageStatus: 'saved' | 'unsaved' | 'session-only' | 'secondary-tab';
  notice: string | null;
}
