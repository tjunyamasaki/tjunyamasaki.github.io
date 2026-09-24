# Hollowstead: HUD, inventory, interaction, and night overhaul

**Status: implementation handoff only. No features below are implemented by this document.**

- Requested by Jun on 2026-09-24; this plan covers all 14 requested changes.
- Repository: tjunyamasaki/tjunyamasaki.github.io.
- Working and deployment branch: feat/hollowstead-coop.
- Inspected implementation baseline: 395baac7a332f1ed94b5c73e0ec4b4882ee47afe.
- Game: https://tjunyamasaki.github.io/hollowstead/
- Published handoff: https://tjunyamasaki.github.io/hollowstead/IMPLEMENTATION_PLAN.md
- Scope of the planning commit: add this file only. Runtime, player documentation, assets, and workflow behavior remain at the inspected baseline.
- Implementation agents: read this entire document, inspect the current branch for subsequent changes, then claim one work package in section 16. Record evidence and unresolved issues in section 19.

## 1. Goal and interpretation

Make the game feel like a mobile survival RPG: a quiet HUD, deliberate equipment choices, a spatial inventory, exclusive chest access, direct contextual actions, continuous timed gathering, physical harvest drops, and meaningful darkness.

The user supplied an inventory reference showing a framed panel, character portrait and equipment sockets on the left, a regular grid of square item slots on the right, item icons with small quantity badges, and clearly visible empty slots. Use that spatial organization. Keep Hollowstead's replaceable Halloween skin; the reference does not require copying its artwork, character, frame, font, decorative sockets, or extra quickbar. This description is sufficient to implement without access to the attachment.

### 1.1 Resolving the action-removal request

The user explicitly wants eating inside inventory and crafting at stations. Therefore:

- Remove the old global Ping, Eat, Craft, and Light shortcuts, their dedicated hotbar buttons, and their old shortcut dispatch paths.
- Remove the gameplay ping feature completely, including map calls and world announcements.
- Remove automatic food selection, including the old eat command and Q shortcut.
- Preserve explicit consumption of a selected inventory item.
- Preserve recipe execution, accessed through the contextual catalog at a station.
- Preserve lantern simulation and introduce its own conditional circular action button.
- Preserve the network ping/pong heartbeat. It measures connectivity and is unrelated to the removed gameplay ping.

Do not interpret “remove Craft” as removing the game's crafting system, or “remove Eat” as making food unusable.

### 1.2 Defaults chosen for this implementation

These are concrete implementation decisions where the request did not provide numbers or exact interaction details. They are defaults to implement, not questions blocking progress.

| Topic | Decision |
| --- | --- |
| Persistent hotbar | Inventory and Build only |
| Game menu | Gear button in the inventory header; Escape on keyboard |
| Basic crafting | Tools, weapons, armor, portable lanterns, and bandages are made at a workbench |
| Starting progression | Gather by hand, place workbench, make and equip tools |
| Build away from workbench | Only recipes without a station requirement |
| Recipe learning | No permanent unlock; advanced construction continues to require a nearby workbench at placement |
| Backpack | 24 actual slots, stack limit 20 for existing stackable items, existing 120-supply limit retained |
| Equipment | Five functional sockets: chopping tool, mining tool, weapon, armor, lantern |
| Chest | Same item representation as backpack; paged, growing storage so existing unlimited chest storage is not silently capped |
| Chest lease | One opener; 12 simulation seconds, renewed every 3 seconds while actively open |
| Day / dusk / night | 180 / 30 / 100 seconds; 310 seconds per cycle |
| Night waves | Three opportunities at 0%, 40%, and 80% of the night, retaining existing wave size and enemy cap |
| Harvest progress | Host-owned elapsed work; shared by active contributors; reset when all contributors stop |
| Tree / mining outputs | World drops; separate pickup action required |
| Other harvest outputs | Backpack insertion with overflow dropped, preserving their existing behavior |
| Inventory and stations | Do not pause the world; only the existing solo menu pauses |
| Chest crafting supplies | Unlocked chests and the actor's own locked chest may supply recipes; another player's locked chest may not |

Retain the original wider goals: mobile first, 1–4 player co-op, 2D sprites in the 3D world, replaceable themes, five-night campaign, endless continuation, and host-owned saves.

## 2. Request coverage

| User # | Required result | Design sections | Primary package |
| --- | --- | --- | --- |
| 1 | Remove objective helpers, effort text, H button, and unnecessary permanent hints | 4, 8, 13 | P4 |
| 2 | Remove Ping/Eat/Craft/Light shortcut logic; add conditional lantern circle | 4, 6, 8, 12 | P1, P3, P4 |
| 3 | RPG inventory grid; equip, eat, and drop any owned item | 5–6 | P1, P4 |
| 4 | Chest and inventory together; all item types; one opener | 7, 12 | P2, P4 |
| 5 | Place/cancel through action controls, no floating placement window | 8–9 | P3, P4 |
| 6 | Shared crafting/building panel; direct station lists; relocate dismantling | 9 | P3, P4 |
| 7 | Field Build excludes workbench-only entries; no Craft hotbar shortcut | 9 | P3, P4 |
| 8 | Multi-option buildings expose direct action buttons | 8–9 | P3, P4 |
| 9 | Timed gathering/chopping/mining; no effort/progress text or bar | 10 | P3 |
| 10 | Chopping/mining put yields on the floor | 5, 10 | P1, P3 |
| 11 | Unlit night world is barely visible | 11 | P5 |
| 12 | Modestly longer days and nights | 11, 13 | P1, P5 |
| 13 | Vertical icon-and-bar health/hunger/courage display | 4 | P4 |
| 14 | Minimap moved upward | 4 | P4 |

## 3. Current implementation map and constraints

Read .cursor/rules/project.mdc before editing. It requires vanilla ES modules, host authority, Firebase for signaling only, and WebRTC for gameplay. Do not introduce a bundler, a game engine, a Node game server, or Firebase game-state storage. Keep js/config.js and service accounts out of commits.

The repository rule normally keeps handoff documents under the ignored docs/ directory. The user explicitly requested this plan be committed and deployed, so this file deliberately lives under hollowstead/ instead. Do not change the repository rule or force-add the ignored docs/ directory. The rule references local docs/ files that were absent at inspection; read them if they exist in your checkout. Keep README.md player-facing.

| File | Current implementation relevant to this work |
| --- | --- |
| [src/content.mjs](src/content.mjs) | RULES version 1; 150/30/80 timing; 120 capacity; ITEMS, EQUIPMENT, NODES.hits, station-gated RECIPES; phase helpers |
| [src/engine.mjs](src/engine.mjs) | World owns inventory dictionaries, separate equipment durability dictionaries, gathering hits, building interactions, recipe payment, light safety, drops, snapshots, restore |
| [src/main.mjs](src/main.mjs) | UI and input in one module; renderSheet pack/craft/build/camp branches; objective(); currentTarget(); placement; keyboard/hotbar listeners; save wrapper |
| [src/network.mjs](src/network.mjs) | PROTOCOL hollowstead-1; validated actor identity from connection; input/action dispatch; 12,000-character snapshot chunks; heartbeat and disconnect cleanup |
| [src/renderer.mjs](src/renderer.mjs) | Three.js SpriteMaterial and MeshBasicMaterial; warm floor glows; hardcoded dusk/night boundaries 150 and 180; pick(); world floaters |
| [src/canvas-renderer.mjs](src/canvas-renderer.mjs) | Compatibility projection; same hardcoded phase times; floor tint and per-sprite brightness; pick(); labels and effects |
| [index.html](index.html) | H menu, objective, target-card, six hotbar actions, placement banner, sheet shell, vitals and minimap |
| [style.css](style.css) | Compressed CSS; desktop, portrait, short-screen, landscape, reduced-motion rules |
| [themes/FORMAT.md](themes/FORMAT.md) | Replaceable sprites, animations, motion, colors, sounds |
| [tests/survival.test.mjs](tests/survival.test.mjs) | 13 existing simulation tests, several asserting the behaviors being replaced |
| [tests/network.test.mjs](tests/network.test.mjs) | Four tests with fake paired data channels; real internet connectivity not covered |
| [devices.html](devices.html) | Phone, landscape, and two-frame developer preview |
| [.github/workflows/deploy-pages.yml](../.github/workflows/deploy-pages.yml) | Deploys this branch, runs Hollowstead and ball-game tests, copies all of hollowstead except tests |

### 3.1 Behaviors that must actually change

- p.inventory currently stores counts by item key. p.equipment stores one durability value per equipment kind. Two identical tools cannot exist independently.
- Tool crafting replaces that kind's old durability and auto-enables a newly made lantern. Attacking automatically chooses the strongest owned weapon.
- A chest's store is another count dictionary. Deposit excludes food/healing items; withdrawal takes up to 10; equipment is unsupported; there is no chest session.
- Nearby recipes consume chest supplies automatically with no lock awareness.
- World.target falls back to a nearby entity even when an explicit ID is invalid. This is unsafe for transactional targeting and held contextual actions.
- interact() in main opens a generic camp submenu for chest, bench, pot, hearth, and fire.
- Repeated World.interact calls subtract node hits. The “effort left” text is directly derived from hits.
- Harvests call give(), adding material immediately and dropping only overflow.
- The global p.cooldown gate can silently reject unrelated inventory actions. It is not an adequate inventory transaction protocol.
- snapshots are reused for both saves and multiplayer; restore reconstructs the World on every guest frame.
- Restoring only accepts RULES.version and saved() hides other versions. Merely increasing the version would hide existing campaigns.
- The renderers use mostly unlit materials. Adding a Three.js ambient/point light alone will not make these materials react to darkness.

### 3.2 Module boundaries to establish

Extract only the areas needed for these changes; do not rewrite the entire engine as a preliminary task.

| New module | Responsibility | Must not do |
| --- | --- | --- |
| src/inventory.mjs | Stack/container/equipment primitives, validation, insertion plans, moves, consumption | Touch DOM, network, or rendering |
| src/interactions.mjs | Pure action/recipe capability descriptions for a given actor, target, station context, and mode | Mutate the world or grant authority to the UI |
| src/lighting.mjs | Phase darkness, active light-source collection, shared light/safety calculations | Import Three.js or Canvas |
| src/serialization.mjs | Save v1→v2 migration and validated serialization helpers | Access localStorage itself |
| src/ui/inventory.mjs | Grid, equipment sockets, item selection and quantity controls | Directly change simulation inventory |
| src/ui/catalog.mjs | Unified recipe/build catalog and station contexts | Decide that a recipe is legal without host verification |
| src/ui/actions.mjs | Contextual circles, mode transitions, pointer/keyboard action dispatch | Infer the acting player from guest-supplied IDs |

Engine remains the authority. UI modules emit intents. Pure helper modules may import content, but must not import World and create a circular dependency. Inject queries/state where needed.

## 4. HUD and mobile layout

### 4.1 Delete clutter at its source

Remove the objective aside, objective-kicker/text/sub, objective(), and its update calls. Remove the entire target-card and the target-name/target-detail update path, including “effort left,” generic walking/gathering hints, and persistent “requires tool” prose.

Remove the H brand button and its listeners/styles. Move camp code, network latency, save status, invite copy, camera controls, sound, guide, and return-to-title access into the existing game menu, reachable from an inventory-header gear button. Remove the old camp-button from the compact HUD as well; do not let its previous copy-invite behavior make the menu inaccessible to guests.

Keep brief event feedback for consequential failures: item no longer available, chest in use, inventory full, disconnected, station out of range. Rate-limit repeated identical notices; holding a button must not produce a toast every tick. Retain downed state, boss health, damage feedback, phase announcements, connection pause/loss, and victory/defeat feedback.

Do not put replacement tutorial paragraphs elsewhere in the HUD. Longer instructions belong in the optional field guide. Short action names on the circles are allowed; the request removes helper prose, not the ability to identify an action.

### 4.2 Top layout

- Left: three horizontal bars in a vertical stack, ordered health, hunger, courage.
- Each row contains its icon and fill bar only. Remove permanent text labels and numeric values.
- Keep semantic labels and values through aria-label or progressbar attributes; do not rely on color alone.
- Baseline portrait sizing: icon 18–20 px, bar 76–96 px wide, row at least 20 px high, 4–6 px between rows.
- Center: compact day/phase clock. Its day-track boundaries come from durations, not the current fixed 58%/69% CSS stops.
- Right: minimap anchored directly to the top safe area, approximately 12 px below it. Target 72–80 px diameter on phones, 96 px on larger layouts.
- Hide the permanent biome caption under the small minimap; retain biome information on the full map.
- Compact party rows sit below the left vitals stack. Ensure four players do not overlap the boss bar or menus.
- Boss bar occupies a reserved row below the top elements. Connection banners may temporarily overlay this region, but must remain readable and dismiss/resolve normally.

Use env(safe-area-inset-*) and dynamic viewport units. In 360 px portrait the three top groups must fit without wrapping into each other. In 320 px width, shrink the clock before shrinking controls below readable sizes.

### 4.3 Bottom layout

- Hotbar contains Inventory and Build; remove the six-column assumptions in CSS.
- Keep the movement joystick on the left and the contextual action cluster on the right.
- Remove the joystick's permanent MOVE helper.
- Touch targets: 44 CSS px minimum for small circles, 60–72 px for the primary interaction, attack at least 56 px.
- Reserve room for up to four building-specific actions without a submenu: a compact two-column context group beside stable Attack/Dodge positions is acceptable.
- Lantern is a distinct small circle, never an entry in the bottom hotbar.
- On narrow phones keep the action cluster at or below about 184 px wide and avoid the joystick's active area.
- Place/cancel mode uses this action region. There is no replacement floating placement dialog.
- Inventory/station panels own their hit area; touch scrolling or dragging inside them cannot reach the world.

### 4.4 Input and accessibility

- I toggles Inventory; B opens field Build; M opens map.
- Remove C, Q, and G global shortcuts and all documentation advertising them.
- F may operate the new lantern circle's exact intent when a usable lantern is owned.
- E activates/holds the primary context action. Additional building actions may use 1–4 in their displayed order.
- Space attacks and Shift dodges in normal mode; neither performs a hidden combat action during placement or inventory manipulation.
- In placement, E/Enter places and Escape cancels. In maintenance, E performs the selected safe action; dismantling requires its confirmation hold.
- Escape priority: cancel an in-progress drag, close item details, close the panel, cancel placement/maintenance, then open the game menu.
- Buttons retain stable accessible names. Slot labels include item, quantity, condition, and equipped status.
- Preserve focus when counts change. Do not replace a focused grid or held button every 180 ms.
- Do not speak changing stat values every simulation tick. Announce meaningful inventory errors and session loss politely.

## 5. Unified item and container model

### 5.1 Data contract

Use a common representation for every item in backpack, chest, equipment socket, and world drop.

    ItemStack = {
      uid: string,            // host-issued identity
      itemId: string,         // stable ITEMS/EQUIPMENT key, never an asset filename
      quantity: integer,     // positive; equipment always 1
      durability?: number    // equipment only; finite, 0..definition maximum
    }

    Container = {
      id: string,            // derived from host player/building ID
      revision: integer,
      slots: (ItemStack | null)[]
    }

    Player inventory state = {
      inventory: Container,  // 24 slots
      equipment: {
        chop: ItemStack | null,
        mine: ItemStack | null,
        weapon: ItemStack | null,
        body: ItemStack | null,
        light: ItemStack | null
      },
      equipmentRevision: integer
    }

    Drop = {
      id: string,
      stack: ItemStack,
      x: number, z: number,
      until: number
    }

Use null for empty slots so ordering survives serialization. Never use item kind as instance identity. Keep definitions separate from live stacks. Equipment maximum durability and allowed socket come from content, not a guest packet.

Extend item metadata with stackLimit, supplyUnits, equipmentSlot, and consume/use capability as appropriate. Existing materials, foods, and bandages: stackLimit 20, supplyUnits 1. Equipment: stackLimit 1, supplyUnits 0, preserving the existing distinction between carried supplies and tools.

Zero quantity means remove the stack; zero durability handling is specified in section 6. Reject unknown/prototype item names, non-finite values, fractional quantities, excessive quantities, duplicate UIDs, and out-of-range slot indexes at authoritative boundaries.

### 5.2 Capacity and insertion

- The backpack has 24 physical slots and at most 120 supply units across its stacks.
- Equipment in sockets occupies no backpack slot and no supply units.
- Equipment in the backpack occupies one physical slot.
- A fresh chest displays 36 cells. When its last empty cell would be used, grow by another row of six; present additional cells in pages of 36. No new small total chest cap.
- Chest storage contains all current item types, including food, bandages, partly worn gear, and depleted lanterns.
- Merge stackables up to stackLimit; equipment never merges.
- Merge destination stacks in slot order, then fill empty slots in slot order.
- Splitting creates a new UID for the new stack. A whole-stack move keeps its UID.
- Merging consumes the incoming UID only after its contents have been applied. The surviving stack keeps its UID.
- Slot reordering does not change total supply load.
- Explicit transfers/crafting/equipping are all-or-nothing unless the player explicitly chose a smaller quantity.
- Pickup may take only what fits, leaving the remainder on the floor; never silently destroy or relocate the remainder.
- Gathering food by hand may insert what fits and emit overflow drops, matching its existing policy.
- If a requested explicit transfer cannot fit, fail without changing either container.

Separate pure planning from committing: calculate all resulting slots, counts, revisions, and durability first, validate them, then commit once. Do not subtract the source and try to repair it if the destination rejects insertion.

### 5.3 Ownership invariant

At all times each live UID belongs to exactly one location: a player's backpack, an equipment socket, a chest, a world drop, or migration recovery storage. It cannot exist in two locations.

Conserve quantities across transfers, swaps, splits, drops, and pickups. Exceptions are explicit recipes, consumption, durability breakage, enemy/harvest creation, dismantle yields, and drop expiry.

Inventory helpers should support:

    validateStack / validateContainer
    countItem / supplyLoad / findStack
    planInsert / planMove / planEquip / planConsume
    applyTransaction
    serializeContainer / migrateLegacyContainer

These names are suggested APIs; preserve the documented contracts even if names change. All engine callers must use the same primitives, including recipes, repairs, fuel, upgrades, death drops, and chest destruction.

### 5.4 Ground items

Render world drops from stack.itemId and the existing theme icon key. Use EQUIPMENT icons as well as ITEMS icons; torch uses the lantern icon, ember uses soul. Do not fall back to a character sprite for equipment drops.

Use the same pickup transaction for harvest yields, manual drops, death supplies, destroyed chest contents, and enemy loot. A dropped tool keeps its durability; two identical tools remain distinguishable.

Place harvest drops around the resource in a small deterministic fan, beyond solid collision where possible. Do not use an uncontrolled random offset differently on each client. Drops are shared world objects and may be collected by another player.

Retain the existing 600-second lifetime for normal drops. Migration recovery contents must not expire.

## 6. RPG inventory and explicit equipment

### 6.1 Panel composition

Landscape/desktop: portrait with five equipment sockets on the left, backpack grid on the right, selected-item details along the bottom. Portrait: compact portrait/socket area first, then the grid and pinned selected-item actions. Use the reference's clear cell boundaries and visible empty cells.

- Six columns in larger layouts; four columns on a narrow phone. These are alternate views of the same ordered 24 slots.
- Slots contain icon, quantity if above one, and a small durability treatment for equipment.
- Selection is a strong outline; equipped sockets use a separate indication.
- No always-visible per-cell action buttons or item-name paragraphs.
- Selected-item details show name, quantity, food/healing effects, durability, and applicable operations.
- Inventory actions: Equip/Unequip, Eat, Heal, Drop; Transfer appears when a chest is open.
- Show a compact supply count and occupied-slot count in the panel, not the world HUD.
- Charm status remains an inventory detail; the last-chance charm is a player ability, not a droppable inventory item.
- The inventory header contains Close and the menu gear; both remain reachable in short landscape layouts.

### 6.2 Touch and keyboard operations

The primary interaction is tap a slot, then tap an operation or destination. Dragging is optional convenience, never the only way to transfer or equip.

- Tap empty destination to move a selected stack; tap a compatible occupied stack to merge; incompatible occupied slots may swap if both destinations permit it.
- For stacks above one, quantity controls offer 1, Half rounded up, All, and +/- adjustment within the actual available count.
- Default selected quantity is All for a transfer/drop; consumption always uses one.
- A Drop action has an explicit quantity confirmation in the selected-item area so one accidental tap does not discard the whole pack.
- Desktop drag and Shift-click transfer may be supported after tap controls work.
- Use pointer capture and a movement threshold so scrolling does not accidentally drag.
- Cancel drag on pointercancel, lost capture, resize/orientation change, panel close, death, and session loss.
- Keep slot selection by UID through updates, then clear it if that UID no longer exists.
- Arrow-key grid navigation, Enter to select/activate, and Escape cancellation must work without a mouse.

### 6.3 Equipment semantics

| Socket | Allowed item | Effect when equipped |
| --- | --- | --- |
| Chop | axe | Faster tree gathering; durability wear while working |
| Mine | pick | Faster flint gathering; enables ore/grave gathering |
| Weapon | spear or sword | The chosen weapon's attack damage and reach |
| Body | armor | Existing damage reduction and wear |
| Light | torch | Existing portable light radius and fuel, when switched on |

- Newly crafted equipment enters backpack storage; it is not automatically equipped.
- Equipping from a slot into an occupied socket swaps the old gear into the source slot atomically.
- Unequipping into a full backpack fails without dropping or deleting the item.
- Manually dropping or transferring equipped gear first removes its effect in the same transaction.
- Attacking with no weapon socket uses unarmed attacks. Do not silently select a stronger unequipped weapon.
- Tools in the backpack do not speed or unlock gathering.
- Armor in the backpack does not absorb damage.
- A broken axe, pick, weapon, or armor is removed when durability reaches zero. Do not auto-equip a spare.
- A lantern at zero fuel remains an item so it can be transferred/dropped; it supplies no light. This change does not introduce lantern refueling.
- Crafting another tool creates another item, not a free durability refill. Remove the old “still in good condition” replacement guard.
- If legacy saves contain both spear and sword, equip sword and retain spear in the backpack during migration.

For death behavior, preserve the baseline rule: backpack contents drop when the player becomes a ghost; equipped gear stays with that player. All retained sockets remain inactive while downed/ghost/offline. Evicting a disconnected player slot must recover both backpack and equipped items to drops; otherwise equipment would be lost when their record is removed.

### 6.4 Food and healing

Eat consumes the selected food instance only. Keep the current food/heal/courage values and appropriate full-state checks. Heal consumes one selected bandage. Never choose a different food because the selected stack changed.

The authoritative command references stack UID and expected inventory revision, not only item kind. Two rapid consumes cannot use the last item twice. The details panel updates quantities and effects from acknowledged state.

### 6.5 Lantern circle

- Show the circle if the player owns a usable lantern in the light socket or backpack; chest contents do not count.
- When an equipped lantern exists, toggle that instance.
- If none is equipped and usable lanterns are in the backpack, pressing the circle atomically equips and enables the first usable lantern in slot order. This is the one deliberate convenience equip action; ordinary equipment stays manual.
- A player can select a different lantern through Inventory.
- Lit state is clearly visible through the circle and a small fuel arc; this is equipment fuel, not harvest progress.
- Moving/dropping the active lantern turns it off immediately. Transferred lanterns do not remain lit on the recipient.
- Hiding the circle or consuming its last fuel clears any captured pointer/held action state.
- F invokes the same operation. Remove listeners attached to the old toggle-lantern hotbar element.
- Host validates ownership and usable fuel. Guests cannot turn on a lantern in a chest or another player's socket.

## 7. Exclusive chest sessions

### 7.1 User flow

1. Approach a chest and activate its Open circle.
2. Send a chest-open request; do not grant access locally.
3. Host verifies that the player is alive, connected, in reach, and not already using a different chest.
4. If free, host grants a session and opens one panel containing the player's inventory/equipment and chest grid together.
5. If another player owns it, show one brief “Chest in use” notice; do not display an editable chest or force it open.
6. Tap source item, choose quantity, then Transfer or a destination cell. Any supported item type moves in either direction.
7. Close the combined panel to release access. Opening a different panel releases it too.

Portrait layout must show both container identities and at least one visible row of each, with independently scrollable grids and a pinned selection/transfer area. Do not require closing the chest to see the backpack. Landscape uses side-by-side panes.

### 7.2 Host state and lifecycle

Maintain transient chest sessions keyed by chest ID:

    {
      ownerId,
      sessionId,       // host-issued opaque value
      expiresAt,       // authoritative simulation time
      openedAt
    }

- Open grants exclusive ownership in one host operation.
- A repeated open from the same player returns the current session; it does not mint conflicting sessions.
- A player can hold only one chest session.
- Renew every 3 simulation seconds while the combined panel is open; expire after 12 without a valid renewal.
- Opening, renewal, and transfer require distance strictly less than RULES.reach (currently 2.8).
- A session ID is not an authority substitute: always verify the acting connection is the recorded owner.
- Release on close, switch to another chest/panel, movement out of reach, downed/ghost state, disconnect, room stop, chest removal, or expiry.
- On guest blur/visibility loss, attempt immediate close. If delivery fails, the lease expires.
- Host visibility pause freezes simulation-time leases with the rest of the world. Disconnect cleanup must still release ownership when World.leave runs.
- Loading a save starts with no chest sessions, regardless of who had a panel open.
- Guest snapshot reconstruction must retain the network-visible busy/owner state for UI display; do not accidentally clear it on every received frame.

Closed UI state and lock state must converge. On any rejection or session loss, close the chest pane, cancel selections/drags involving it, and keep the player's normal inventory available.

### 7.3 Mutation and interaction rules

- Only the session owner may move items into/out of the open chest.
- A different player cannot bypass the lock through the old deposit/withdraw commands; remove those handlers.
- A different player cannot consume that chest's contents via crafting, fueling, upgrades, planting, repairs, or trap rearming.
- Unlocked nearby chests remain eligible for existing shared recipe supplies. An actor's own open chest is also eligible.
- Recipe availability displays use the same eligible-chest selector as authoritative payment.
- Dismantling a chest requires it to be unlocked. An owner must close it before dismantling.
- Enemy destruction does not wait for a lease: release it, spill every stored item once, remove the chest, and notify/close the owning UI.
- Mere repair does not access chest contents; it may repair a locked chest using the repairer's legal supplies.
- Opening itself cancels movement goals and gathering. An inventory overlay must not leave the player auto-walking out of reach.

### 7.4 Transfer transaction

Validate in this order: acting player/session, world state, exact chest ID, chest existence and range, lock session, source/destination access, current revisions, stack UID/slot, quantity and item metadata, destination capacity.

Plan both resulting containers, then commit both and increment both revisions once. On failure, neither changes. A duplicate request returns the original result, not a second transfer.

For source or destination equipment sockets, apply the same socket restrictions and effect cleanup as section 6. A chest is not a way to bypass equip rules.

## 8. Contextual action controller

Replace scattered branching in main with one mode controller and shared action descriptions. Each action descriptor has a stable ID, icon, short accessible label, enabled state, optional disabled reason, activation mode (tap/hold), target ID, and command payload builder.

The host rechecks every condition. A UI descriptor is not permission to mutate the world.

### 8.1 Modes and precedence

| Mode | Movement | Action cluster | Exit |
| --- | --- | --- | --- |
| Normal | Joystick/tap movement | Context actions + Attack/Dodge + conditional lantern | Open a panel, begin placement/manage, or become downed |
| Inventory/catalog/chest | Cleared | World actions blocked | Close panel; return to Normal |
| Placement | Joystick allowed; ground taps move ghost only | Place and Cancel | Success, Cancel, death, session/end, invalidated station |
| Maintenance | Joystick allowed; tap selects structure | Repair when damaged; Dismantle when legal; Cancel | Explicit cancel, death, removal, end |
| Downed/ghost | Existing restrictions | Existing charm/help flow only | Revive/dawn/end |
| Paused/disconnected/end | Cleared | Only applicable recovery/menu controls | Resume/rejoin/new expedition |

Priority: end/disconnected → downed → panel → placement/maintenance → normal. Do not combine intents from two modes in a single input frame.

On every transition, release held states, clear stale key state where appropriate, cancel active harvesting, and clear target-specific pointer capture. A pointer pressed on Feed cannot become a Place or Attack activation when the target/mode changes.

### 8.2 Direct building actions

| Target | Direct context controls | Opens panel? |
| --- | --- | --- |
| Heartfire | Feed wood; Cook; Awaken when below max level; Repair if damaged | Cook opens fire recipe list directly; others execute |
| Campfire | Feed wood; Cook; Repair if damaged | Cook only |
| Workbench | Craft; Build; Repair if damaged | First two open respective tabs directly |
| Cauldron | Cook; Repair if damaged | Cook opens cauldron recipe list directly |
| Chest | Open; Repair if damaged | Open requests exclusive combined inventory |
| Wall | Repair when damaged | No |
| Gate | Open/Close; Repair if damaged | No |
| Trap | Rearm when charges missing; Repair if appropriate | No |
| Farm | Plant or Harvest when ready; no fake action while growing | No |
| Bed | Rest/Wake when allowed; Repair if damaged | No |
| Soul lantern / ward | Repair when damaged | No generic submenu |
| Downed teammate | Hold Revive | No |
| Harvest node | Hold Chop/Mine/Gather | No |
| Ground drop | Pick up | No |

Do not add a generic Open → camp submenu for multi-option buildings. Stable button order matters: Feed/Cook/Awaken/Repair for Heartfire; Craft/Build/Repair for bench.

The primary E action is the first legal meaningful action. Disabled controls can show a concise reason after a deliberate tap, not as permanent world helper text. Awaken must target the selected Heartfire explicitly rather than “whichever hearth nearby.”

World.target may still find the nearest candidate when there is no explicit selection. If an explicit selected ID disappears or goes out of range, stop/cancel; never silently retarget a destructive, transactional, or held action.

### 8.3 Maintenance instead of station dismantle

Put a wrench toggle in the Build catalog header labelled Maintain camp. It closes the catalog and enters maintenance mode. Select a structure in the world; the action cluster offers Repair, Dismantle, and Cancel as applicable.

Dismantle requires a continuous 0.8-second confirmation hold with a ring on that button; this is a destructive confirmation, not harvest progress. Release early cancels. Heartfire never exposes or accepts dismantle. Another player's locked chest cannot be dismantled.

Retain half-material refunds and spill stored contents through the unified drop path. Keep world play active. Remove dismantle from all station recipe/list screens.

## 9. Unified crafting and building catalog

### 9.1 One panel, explicit context

Replace sheet='craft', sheet='build', and the generic sheet='camp' branch with one catalog component and separate chest inventory.

    CatalogContext = {
      source: 'field' | 'station',
      stationId: string | null,
      tab: 'craft' | 'build',
      category: string
    }

Allowed categories are derived from context. Never carry a stale bench context into a field Build opening.

| Entry point | Initial view | Recipes shown |
| --- | --- | --- |
| Build hotbar / B | Field Build | Only station-free build recipes |
| Workbench Craft circle | Craft tab | Workbench tools, weapons, armor, lantern, care |
| Workbench Build circle | Build tab | All basic and workbench construction recipes |
| Heartfire/Campfire Cook circle | Craft tab labelled Cooking | Fire cooking recipes only |
| Cauldron Cook circle | Craft tab labelled Cooking | Cauldron cooking recipes only |

At a workbench, show Craft and Build tabs. Away from it, hide Craft entirely. At cooking-only stations, show the relevant recipe list directly without unrelated construction tabs or a second intermediate menu.

Being near a workbench does not make field Build show advanced recipes automatically. Opening through the workbench is an explicit interaction. Host requires a valid station ID for station-dependent actions.

### 9.2 Recipe policy and exact lists

Update the existing station-free portable recipes to require bench: axe, pick, spear, torch, bandage. Armor and sword already require bench and remain there.

Field Build list: fire, bench, chest, wall, gate, trap, farm, bed.

Workbench Build list: the field list plus pot, lantern, ward.

Fire cooking list: roast, roastMeat, roastCaps. Use their existing resulting roast item while retaining distinct costs.

Cauldron cooking list: stew.

Keep no hearth construction recipe. Do not hide recipes merely because materials are missing; show costs/disabled state. Hide recipes that are unavailable in this interaction context. Do not show locked advanced entries in field Build.

Station restrictions must be enforced by the host, not only filtered in the UI:

- Exact existing structure, correct type, alive, player in range (<5 world units for crafting).
- Fire recipes additionally require current positive fuel.
- No grandfathered “unlocked once” access after walking away or station destruction.
- A cauldron retains its current cooking behavior; do not add a new fire/fuel requirement for it.
- A recipe can spend actor supplies and eligible nearby chest supplies atomically.
- Equipment recipes must have output space after costs are removed. Failure must not consume materials.
- No duplicate recipe execution caused by double tap, stale receipt, or reconnect.

### 9.3 Early-game progression must remain possible

Current start supplies are wood 3, stone 2, fiber 3, berry 3. Bench requires wood 6 and stone 4. Tree and flint remain harvestable barehanded. One tree and one flint outcrop provide enough extra supplies to build the first workbench.

Required first-session path:

1. Gather a tree and flint by hand.
2. Pick up their floor drops.
3. Open Build, select workbench, and place it through the action cluster.
4. Interact with Workbench Craft, make axe/pick, and equip through Inventory.
5. Continue faster resource collection; cook and eat through their new entry points.

Update field guide and player README when implementation lands. Do not retain “craft an axe first” instructions before a workbench is possible.

### 9.4 Placement

- Choosing a construction recipe closes the catalog and creates the existing translucent world ghost.
- Keep ground snapping, overlap checks, structure limit, actor distance, and movement behavior.
- Ghost follows the player's facing until anchored by a ground tap; tapping adjusts position without moving the actor.
- Replace the primary action with Place and secondary action with Cancel. Hide/suspend Attack/Dodge while placing.
- No #placement window, placement name banner, or continuous reason paragraph.
- Valid/invalid ghost tint and the Place button's enabled state communicate validity.
- If the player deliberately tries an invalid placement, one short reason may appear.
- Check all conditions again at confirmation, including another player occupying the spot, recipe cost, chest lock changes, and station range/existence.
- Do not spend or reserve materials merely by choosing a recipe.
- A guest keeps the preview pending until host acknowledgement. On rejection, keep the ghost if it is still meaningful, explain once, and allow adjustment.
- Successful placement places exactly one structure, clears preview, and returns to normal mode.
- Cancel spends nothing and clears all held action state.
- A vanished/destroyed station cancels an advanced preview. Temporarily out-of-range placement is invalid until the player returns or cancels.
- Opening inventory/menu while placing cancels placement first. Downing, room loss, returning to title, and end state also cancel.
- Do not add a rotate control unless rotation has actual supported world behavior; the current stored rotation value alone is not sufficient.

## 10. Timed gathering and physical harvest

### 10.1 Authoritative continuous work

Replace NODES.hits and repeated hit decrement with seconds of work. The user can hold the contextual circle/E or tap a node to walk over and automatically perform one complete harvest.

Use runtime host work records:

    HarvestWork = {
      nodeId,
      workSeconds,
      contributors: Map<playerId, contributionState>
    }

Players expose their current gathering action/target for animation, but guests never report elapsed time or completion. World.tick advances work using its bounded dt. Repeated packets, fast tapping, render frame rate, and keyboard repeat must not accelerate progress.

Resource baseline work and rates:

| Node | Work seconds | Valid hand rate | Equipped-tool rate | Output destination |
| --- | --- | --- | --- | --- |
| tree | 4.0 | 1.0 | axe: 2.0 | Floor |
| rock | 4.5 | 1.0 | pick: 1.8 | Floor |
| grass | 0.9 | 1.0 | None | Backpack, overflow floor |
| bush | 1.6 | 1.0 | None | Backpack, overflow floor |
| pumpkin | 1.8 | 1.0 | None | Backpack, overflow floor |
| mushroom | 1.0 | 1.0 | None | Backpack, overflow floor |
| ore | 3.5 | Forbidden | pick: 1.0 | Floor |
| grave | 3.0 | Forbidden | pick: 1.0 | Floor |

Duration for one actor equals workSeconds / their valid rate. Two valid actors contribute the sum of their rates, enabling actual cooperative gathering without double rewards. Keep contributor ordering deterministic.

- A valid worker is alive, online, not resting, in reach, targeting that exact live node, with an active hold or auto-harvest goal and required equipment.
- Moving deliberately, attacking, dashing, opening a panel, changing target, taking damage, losing required gear, going down, input expiry, or disconnect removes that contributor.
- If another valid contributor remains, work continues. When the last contributor stops, reset unfinished work to zero.
- Manual hold releases stop work; click/tap auto-harvest remains active until completion/cancellation.
- Input freshness remains bounded: the current 0.6-second expiry applies to held input. An explicit auto-harvest goal is separate and must be cancelled on disconnect/visibility/menu.
- Spend tool durability at 1 unit per real working second while that equipped tool contributes. Fractional durability is valid.
- Recompute rate if a tool breaks: optional tree/rock work can continue by hand; required ore/grave work stops until a pick is equipped.
- Preserve existing stamina regeneration; charge gathering effort continuously at 2 stamina per working second without introducing a new exhaustion gate in this change.
- Do not allow a completed/depleted node to finish twice within the same tick.

### 10.2 Completion and cancellation

On completion, atomically mark the node depleted, set its existing regrow deadline, clear all contributors/goals for it, and create its yield once. Count world.stats.gathered once per generated unit, not per worker.

Preserve the grave's wraith spawn chance, executed once per completed grave. Preserve all existing resource quantities and regrowth intervals unless a later balancing task changes them explicitly.

For backpack-output nodes with multiple contributors, choose the earliest still-active contributor as recipient, breaking ties by player ID. Other contributors help completion; their inventories are not given duplicate yields.

Chopping/mining succeeds even with a full backpack because yields go to the floor. For backpack-output nodes, permit completion and drop overflow; avoid wasting a finished harvest solely because capacity changed.

After tree/rock/ore/grave completion, release the interact hold/auto target for that harvest and require a new pickup activation. Otherwise the next tick would immediately collect the new drop and defeat the requested floor-drop behavior.

Track the activation that began work, not merely a Boolean button-down value. Completing a harvest consumes that activation. The host must observe a release/new activation before interpreting the same input as pickup; changing UI labels alone is insufficient.

Picking up one stack is a discrete action. Picking multiple nearby stacks may be repeated through fresh activations; there is no invisible auto-vacuum.

### 10.3 Feedback without a progress HUD

- No effort number, percentage, timer label, circular harvest meter, or progress bar.
- Show the actor's gather animation continuously during valid work.
- Use periodic swing/contact sounds and resource shake as presentation, driven by host action state or deterministic animation time, not by extra loot transactions.
- Completion produces a distinct fall/break/harvest effect and visible drops.
- Stop animation promptly when interrupted.
- Emit pickup quantity feedback only when an item actually enters inventory; a tree falling is not “+5 wood” in the player's pack.
- Repeated missing-tool activation produces at most one short failure notice, with a cooldown before repetition.
- Hold-to-revive must also become a real 3-second channel rather than six discrete interaction calls. Preserve revival results/charm/dawn behavior; no harvest-style helper bar.

Revival advances at at most one second per simulation second even if multiple helpers hold it. A valid helper must remain alive, in range, and actively helping. Reset an interrupted revival when its last valid helper stops; do not keep the old per-call increment or decay mechanism alongside the new channel.

## 11. Day/night pacing and visibility

### 11.1 Durations and scheduling

Set day=180, dusk=30, night=100 and derive cycle as their sum. Store one source of truth. Update phaseAt, dayAt, phaseRemaining, clock track boundaries, demo time, both renderers, and tests that currently hardcode 179.98/190.

Retain three night wave opportunities, at elapsed night seconds 0, 40, and 80. Express these as fractions of RULES.night so future length changes do not accidentally add a fourth wave. Preserve the existing enemy-count gate and one-time fifth-night boss spawn.

Expected five-night duration through the next dawn: 1,550 seconds, about 25 minutes 50 seconds, versus the baseline 1,300 seconds. Victory still happens at dawn after the boss is killed, not at an arbitrary wall-clock duration.

Keep food drain, courage rates, light radii, fire fuel burn rates, fuel gained per wood, crop growth, regrowth, and durability per second unchanged except for the specified timed-harvest wear. Longer phases intentionally consume more fuel/food but give more gathering time. Verify a first-night survival route rather than compensating with unrelated silent balance changes.

### 11.2 Shared illumination model

Introduce renderer-independent functions to collect active light sources and calculate light at a world point. Reuse source rules for World.lit so visuals and safety do not diverge.

Active sources:

- Fueled Heartfire: radius 8 plus 1.5 per upgrade level above one.
- Fueled campfire: radius 6.
- Soul lantern structure: radius 6.
- Online, living, non-ghost player with equipped lit lantern and positive fuel: radius 4.

No lantern light from a chest, backpack-only item, downed/ghost/offline player, or exhausted item.

Use theme parameters for ambient darkness, tint, source tint, transition duration, and feathering. Keep gameplay safety radii in content/simulation. A reskin must not alter courage rules through a color or image size.

Suggested starting presentation values: unlit ambient brightness around 0.03 at full night, normally lit interiors around 0.85–1.0, smooth transition across dusk and the first 7 seconds of night, and a short dawn fade. These are perceptual targets to tune on an actual phone, not a claim that shader multiplier equals display luminance.

Light is readable inside about 0.8 of its safety radius, feathers at the edge, and falls to ambient by about 1.2 of the radius. A faint halo outside the safe radius does not grant courage safety. Combine overlapping lights with a clamped maximum or similarly bounded blend; many lamps must not wash out the whole map.

### 11.3 Rendering requirements

Three.js uses unlit materials today. Implement actual illumination of the ground and each sprite, rather than adding scene lights that do not affect them.

Recommended bounded approach:

1. Collect light sources once per frame/tick group.
2. Produce a small world-space illumination texture or equivalent sampled field for terrain and scatter; update moving lights at an appropriate mobile budget.
3. Sample shared illumination at sprite positions to tint their full billboard, so heads do not remain bright above a floor-only mask.
4. Apply the same field and theme settings in CanvasRenderer, using cached tints/offscreen compositing where repeated filters are expensive.
5. Retain decorative flame/glow effects, but they must not undo ambient darkness.

Do not introduce an entire postprocessing framework or change rendering engines for this task. Dispose of any new textures, canvases, materials, and listeners correctly.

At full night outside every light:

- Terrain, plants, structures, dropped items, and remote enemies must be barely distinguishable.
- Health bars, names, selection rings, floating reward text, and particles must not reveal distant dark entities.
- Render a very faint local-player silhouette for orientation, without a hidden safe light radius.
- A distant actual light may show a small emissive source; it must not illuminate the intervening world.
- Attack warning indicators may remain minimally visible where their danger area intersects the local player/nearby visible area. Do not reveal a distant enemy through a bright global warning ring.
- Picking/auto-targeting cannot inspect a dark resource several screens away. Filter point picking by local visibility or immediate physical reach.
- Preserve the explored minimap as navigation memory; it does not reveal new enemies or drops at night.

HUD, dialogs, and inventory must remain fully legible. Do not apply a darkness filter to the entire document.

### 11.4 Parity and performance

Validate the same seeded scene and light positions in WebGL and Canvas. Each must show the same safe locations and broadly equivalent visibility.

Avoid recomputing all lights for every item independently through repeated World.lit scans; collect once and share the result. Cap backing texture resolution and device pixel ratio appropriately. Check frame time on a real midrange phone with multiple lights, four players, and a wave active.

The earlier cloud browser could only use Canvas and its live WebRTC join timed out. Do not claim this proves WebGL performance or cross-device co-op. Those are explicit manual release checks.

## 12. Multiplayer command and snapshot contracts

### 12.1 Protocol version

Bump gameplay protocol to hollowstead-2 when incompatible state/commands land. Reject mismatched peers with a clear refresh/update message. Do not join two incompatible clients and hope restore accepts their data.

Keep the existing star topology and actor identity derived from the connection. No command may supply a trusted player ID, inventory owner, durability, recipe output, item price, light radius, or elapsed harvest time.

### 12.2 Commands and results

Names below define intent boundaries; existing move/attack/dash commands may stay where compatible.

| Intent | Required data | Authority checks |
| --- | --- | --- |
| inventoryMove | Source/destination owned containers/slots, UID, quantity, revisions | Ownership, quantities, capacity, compatible sockets |
| consumeItem | UID, inventory revision | Actor ownership, item use capability, current state |
| equipItem / unequipItem | UID/socket, relevant revisions | Socket compatibility, space, effect cleanup |
| dropItem | UID, quantity, location/revision reference | Actor ownership, valid count, legal drop position |
| chestOpen | Exact chest ID | Alive, range, exclusivity |
| chestRenew / chestClose | Chest ID, session ID | Actor owns that session |
| chestTransfer | Session, source/destination, UID, count, revisions | Lease, range, ownership, atomic capacity |
| craftRecipe | Recipe ID, station ID, request ID | Correct live station, range, cost, output capacity |
| placeBuilding | Recipe, station context if required, x/z | World bounds, overlap, distance, eligibility, cost |
| buildingAction | Exact target ID and explicit action ID | Correct structure capability, range, cost/state |
| lanternToggle | Request ID, optional selected lantern UID | Owned usable instance; lawful equip/toggle |
| setHarvestTarget | Exact node ID, hold/auto mode or cancel | Live node, valid goal/tool; no client time |

Held input can carry the currently intended gather target instead of a repeated discrete command. Keep input messages for motion/holds separate from transactional mutations.

Remove gameplay action 'eat', gameplay action 'ping', deposit-all, withdraw-up-to-10, and old per-kind drop behavior. Retain the transport message types 'ping'/'pong' and the timer calling network.ping().

Every transactional action has a bounded requestId. Host records a small recent-result cache per connection/session (for example 64 results), binds it to actor identity, and returns a result:

    {
      type: 'actionResult',
      requestId,
      ok,
      code,                   // stable reason identifier
      affectedRevisions,
      sessionId?              // successful chest open
    }

Limit pending transactions client-side and total command rate host-side. Replay of a recent requestId returns its cached result without applying twice. For requests older than the dedupe window, use a per-session monotonic sequence/high-water mark or equivalent to reject old requests; do not reapply an evicted mutation.

On stale revisions, reject and provide/schedule fresh authoritative state. UI waits for acknowledgement before finalizing a drag, removing a stack, closing a successful placement, or showing an acquired chest lock. Pending visuals are allowed; optimistic inventory ownership is not.

### 12.3 Cooldowns and partial failure

Keep combat/use/fuel timing gates where needed, but separate inventory/chest operations from p.cooldown. A drag shortly after attacking must receive a predictable result, not disappear silently.

For equipment changes during combat/gathering, apply the transaction and stop/invalidate the previous relevant action as needed. Do not let equip spam skip attack cooldowns or refill durability.

Handle out-of-order UI state: an action result may arrive before a snapshot. Either send enough revision/state data to reconcile or keep pending state until a snapshot reaches all acknowledged revisions.

WebRTC channels are reliable and ordered in the current setup; still make application operations idempotent because UI repeats, retries, and reconnect edges are separate concerns.

### 12.4 Snapshots, saves, and bounds

Network snapshots include containers, socket items, revisions, visible busy chest ownership, and actor animation/target state. Save files exclude live chest sessions, request caches, inputs, partial harvests, pointer/UI state, and movement goals.

Provide explicit paths such as snapshot({ purpose: 'network' | 'save' }), fromSnapshot(), and fromSave(), or equally clear separate serializers. Keep restore compatibility until all callers are migrated; do not let each caller guess which transients to clear.

Retain chunking and backpressure. Current limits are <100 chunks of 12,000 characters and a 180,000-byte send-buffer guard. Growing chest inventories can exceed a small frame; measure serialized sizes with large saves, avoid half-sent frames being mistaken for complete state, and fail/surface oversized transfers explicitly rather than silently hiding a chest's contents.

Prefer transmitting occupied storage data plus an explicit slot count if sparse chest pages become large. Do not solve this by silently truncating saved or network inventory.

## 13. Save migration and lifecycle

### 13.1 Version handling

Introduce save schema version 2 and a new hollowstead.expedition.v2 key. Keep profile/identity keys unchanged. Read v2 first; if absent, discover v1 and migrate.

Migration must be pure and non-destructive:

1. Parse and validate enough of v1 to determine it is a supported campaign.
2. Clone data and migrate in memory.
3. Validate resulting v2 ownership, quantities, timers, and structure references.
4. Write v2 only after success; leave v1 untouched as a backup.
5. Do not make Continue disappear because the only available save is v1.
6. If migration fails, show a recoverable message and preserve the original; do not silently start a new world.

Use a fixed v1 fixture committed under tests/fixtures. Do not use the player's actual localStorage or any private campaign as a test fixture.

### 13.2 Inventory conversion

- Convert each positive v1 count dictionary entry into stacks of at most 20, in stable item order.
- Convert each positive p.equipment kind into a unique equipment stack with its exact remaining durability/fuel, clamped only to valid definition bounds.
- Equip axe, pick, armor, and lantern into their sockets.
- If both sword and spear exist, equip sword and put spear in backpack.
- Preserve the active lantern flag only if the equipped lantern has usable fuel and the player is in a valid active state.
- Migrate each chest.store into paged chest slots without loss.
- Migrate legacy drops from type/count to stack representation; split oversized quantities while preserving lifetime and position.
- Validate and repair next ID allocation so migration-created UIDs cannot collide with future IDs.
- Legacy normal supply inventories fit within the new arrangement in ordinary cases; never assume every save is ordinary.
- Preserve valid overflow in a migration recovery container attached to the player and shown as a withdrawal-only inventory page. It cannot receive new items and disappears when empty.
- Do not delete, expire, scatter into danger, or silently discard overflow during migration.
- Unknown item kinds are a migration error requiring a recoverable message, not a reason to erase those entries.

Recovery storage is not a shared recipe source and does not grant passive equipment effects. Withdraw through the same capacity-checked primitives before using its items. Keep it visible until emptied, including on subsequent v2 saves.

Replace the old nodeChanges tuples that carry hit counts with named v2 depleted-node records containing node ID and ready timestamp. Live partial harvest work is transient. Generate unchanged nodes from the seed as today; do not serialize the entire map just to remove hits.

### 13.3 Phase-preserving time conversion

Changing cycle length can move a saved player to a different day/night if time is copied directly. Preserve completed cycle count, current phase, and fraction through that phase.

    oldCycle = 260
    newCycle = 310
    cycleIndex = floor(oldTime / oldCycle)
    phase = phase in old 150/30/80 schedule
    fraction = elapsed within old phase / old phase duration
    newTime = cycleIndex * newCycle
              + new phase start
              + fraction * new phase duration

At exact boundaries select the phase beginning at that boundary. Normalize floating-point edge cases without incrementing the day twice.

Let delta = newTime - oldTime. For absolute deadlines that remain applicable, add delta so remaining seconds are preserved: node ready time (>0), drop expiry, and other saved absolute deadlines. Preserve elapsed event age if events are retained, or discard presentation-only event history.

Recompute nextSpawn from the new night's remaining untriggered 0/40/80 schedule, based on mapped phase progress. Do not replay a night-start wave or spawn the boss twice. A v1 save after its last night wave must not acquire an extra wave merely because the new night is longer.

Keep remaining cooldown/downed timers, fuel quantities, durability, crop growth, hunger, health, courage, charm, upgrades, kills, and campaign/boss flags as values, not scaled time stamps. p.noticeAt and eventId are counters, never timestamps.

Discard unfinished hit progress on active legacy nodes and start their new harvest work at zero. Preserve depleted nodes' regrow deadlines. Clear actionUntil/goal/inputs/rest as needed for a safe load and set the host online and other saved players offline, matching existing resume behavior.

### 13.4 Lifecycle cleanup inventory

Check all of these callers, not only the new UI:

- World.leave and network closePeer.
- Rejoining with the same identity.
- Replacing an offline player record when at four historical players.
- Player downing, charm revival, ghost transition, and dawn revival.
- Returning to title, opening a different campaign, and restarting after defeat.
- Host hidden-tab pause and pagehide.
- Building destruction, dismantle, and node regeneration.
- Failed save write due to browser storage limits.

No saved lock or stale held input may resurrect after a load. Guest reconnection restores that player's items but requires a new chest session.

## 14. Feedback, art replacement, and documentation

Keep mechanics keyed by item/node/structure identifiers. New inventory icons, socket icons, action symbols, lighting colors, and selection treatments must be replaceable through theme or UI skin data rather than scattered theme-specific conditions.

Reuse existing gather/attack/walk/down animation clips. Timed gathering changes how long a clip plays; animation FPS must never determine simulation completion time. A replacement animation can have different frame counts without changing yield, wear, or duration.

Update themes/FORMAT.md with any lighting fields and item/socket icon entries; provide fallback values so an older theme still loads. Keep alpha transparency and sprite anchors correct in both renderers.

Update player README and field guide only when features land. Remove references to:

- Automatic best equipment selection.
- Global quick Eat/Craft/Light/Ping buttons and C/Q/G shortcuts.
- H monogram menu.
- Immediate material pickup from trees/rocks.
- Store-all-materials and fixed ten-item withdrawals.
- Building through a floating confirmation banner.

Keep the public player guide concise; agent implementation details stay in this handoff.

## 15. Acceptance and verification

Write tests for authoritative rules and actual regressions. Avoid snapshots of every CSS class or tests that merely repeat lookup tables. Keep the existing ball-game suite passing; changes to Hollowstead must not alter unrelated games.

### 15.1 Simulation and serialization tests

| ID | Required assertion |
| --- | --- |
| T01 | Two same-kind tools retain independent UIDs and different durability through craft, move, equip, drop, pickup, save/load |
| T02 | Stack merge/split/swap conserves quantities and keeps exactly one owner for each UID |
| T03 | Full destination, invalid quantity/index, unknown/prototype key, and stale revision change neither source nor destination |
| T04 | Supply count limit and slot count both apply; equipped gear does not consume backpack slots |
| T05 | Equip swap succeeds using source slot; unequip to full backpack fails safely |
| T06 | Only equipped weapon/tool/armor changes behavior; backpack gear has no passive effect |
| T07 | Explicit food selection consumes one correct stack; quick-eat command is rejected; no fallback food |
| T08 | Dropping/transfer of active lantern turns it off and preserves remaining fuel |
| T09 | Two simultaneous chest opens grant one session; owner re-open is idempotent |
| T10 | Transfers of every current item kind work in both directions; worn equipment never repairs itself |
| T11 | Non-owner/expired/wrong-session/out-of-range chest operations fail without mutation |
| T12 | Close, disconnect, downing, range loss, expiry, load, and chest destruction release sessions |
| T13 | Locked chest is excluded from other actors' payments, included for owner, and eligible again after release |
| T14 | Transfer versus craft/repair/fuel race cannot spend the same supplies twice |
| T15 | Chest destruction/dismantle spills all contents exactly once; dismantle respects locks and excludes hearth |
| T16 | Field build list and host enforcement reject pot/lantern/ward without a valid bench context |
| T17 | All portable equipment/care crafting needs bench; fire cooking requires positive fuel; pot list only makes stew |
| T18 | Craft output-space failure consumes no inputs; successful craft creates a new item |
| T19 | Placement rechecks overlap, actor range, current cost, station existence and lock eligibility at confirmation |
| T20 | Constant simulated harvest time produces identical completion across varying tick subdivision and input message rates |
| T21 | Hold release/movement/damage/attack/panel/tool loss cancels appropriately; work resets after final contributor stops |
| T22 | Two contributors speed one harvest and produce exactly one yield; disconnect does not leave a ghost contributor |
| T23 | Tool wear is time-based; breaking required pick cancels ore/grave; optional hand gathering continues correctly |
| T24 | Tree/rock/ore/grave yield appears only on floor even with empty backpack; held harvest does not auto-pick it up |
| T25 | Full pack still permits chopping; partial pickup leaves the exact remainder on floor |
| T26 | Grave enemy roll and gathered stats are applied once per completed node |
| T27 | Revive requires 3 actual valid seconds; packet spam does not accelerate it |
| T28 | phaseAt/dayAt/remaining agree at every 180/210/310 boundary and over multiple days |
| T29 | Exactly three wave opportunities per night; boss only once; victory at correct later dawn |
| T30 | Active-source eligibility matches courage safety, including downed/offline players and depleted lanterns |
| T31 | V1 migration preserves items, durability, storage, campaign flags, current phase fraction, and remaining regrow/expiry timers |
| T32 | Unsupported/corrupt migration does not overwrite v1 or hide recovery; overflow remains retrievable |
| T33 | Save serialization omits locks/channels/caches; network snapshot retains necessary busy/animation state |
| T34 | Long/chunked snapshots with populated chest pages reconstruct without truncation |

### 15.2 Network tests

Extend the existing fake-channel harness instead of replacing it with assertions around a mock UI.

| ID | Required assertion |
| --- | --- |
| N01 | Actor cannot spoof player/container ownership or equip another player's gear |
| N02 | Duplicate transaction request returns cached result; an older evicted request cannot execute again |
| N03 | Concurrent chest opens/transfers yield identical host/guest ownership and counts |
| N04 | Late join receives socket instances, busy chest status, drops, and the current phase |
| N05 | Rejoin retains items, releases old chest ownership, and requires a new session |
| N06 | Action result arriving before refreshed snapshot does not clear pending UI into a false state |
| N07 | Old gameplay ping/eat/deposit/withdraw paths have no effect; transport heartbeat still operates |
| N08 | Mixed v1/v2 clients fail clearly; normal v2 lobby/start/pause/cleanup remain functional |
| N09 | Malformed/oversized/rate-excessive messages are rejected without crashing the room |

### 15.3 Browser/device scenarios

| ID | Scenario and pass condition |
| --- | --- |
| M01 | 360×780 and 390×844 portrait: clean top layout, no H/objective/target-card/old shortcuts, minimap at top |
| M02 | 320 px narrow width and 852×393 landscape: no clipped Close/gear/quantity/action controls, no horizontal page scroll |
| M03 | Rotate device with inventory/chest open and during a drag: no lost item or stuck pointer |
| M04 | Start fresh, harvest barehanded, pick up, build bench, craft/equip tools, cook/eat, survive first night |
| M05 | Every inventory operation works by taps alone; drag/scroll do not leak movement into world |
| M06 | Two devices open same chest: one wins, one sees busy; all categories transfer correctly and match both views |
| M07 | Owner closes tab/disconnects/goes out of range/gets downed: second player can regain chest; no duplicated contents |
| M08 | Player B crafts near Player A's open chest: A's contents stay unchanged; unlocked shared crafting still works |
| M09 | Workbench and cauldron open correct lists on first activation; Heartfire Feed/Cook/Awaken/Repair are direct controls |
| M10 | Advanced preview loses station/cost/range before Place: no illegal structure; cancel has zero cost |
| M11 | Harvest interruption and held-button retargeting never eat, pick up, attack, fuel, or build accidentally |
| M12 | Midnight away from light is barely visible; approach lamp and regain visibility; drain lantern and lose light smoothly |
| M13 | Same darkness scene in native WebGL and Canvas; no bright trees/nameplates/health bars leaking through darkness |
| M14 | Four-player light/harvest/wave scene on real phone: usable controls and acceptable frame time; record observed device/results |
| M15 | Keyboard-only inventory and context controls; icon-only stats have correct accessible names/values |
| M16 | Resume a v1 fixture at each phase and a v2 save with worn gear/full chest; no unwanted fresh campaign or stale lock |
| M17 | Host background/foreground pause and guest reconnect preserve campaign and inventory without stuck actions |
| M18 | Five-night victory, charm, teammate revive, defeat/restart, save-and-title, and endless mode remain reachable |

Automation of M tests is optional where real browser/device access is unavailable. Report unverified scenarios accurately; do not substitute fake channels for a real two-device join.

### 15.4 Commands and review gates

Run from repository root:

    node --test hollowstead/tests/*.test.mjs
    node --test ball-game/tests/*.test.mjs
    git diff --check

Use node --check on changed .mjs files where useful. Search for old UI references/handlers to confirm removal, while keeping intentional v1 migration fixtures and transport heartbeat:

    rg -n "quick-eat|toggle-lantern|ping-home|effort left|objective-text|menu-button|confirm-build|cancel-build" hollowstead
    rg -n "150|180|260|179\.98|190" hollowstead/src hollowstead/tests

These searches are review aids, not blanket delete commands: 180 is now a valid day duration and lantern durability; old values belong in migration fixtures. The plan itself deliberately documents old names.

## 16. Implementation packages for other agents

P0 is complete. P1–P6 are NOT STARTED. The planning commit does not satisfy any later package's acceptance criterion.

Work on feat/hollowstead-coop or a narrowly scoped integration branch based on its current head. Only an integrator pushes the deployable branch after a coherent slice is working. Do not independently force-push shared history or merge to master.

No agents should edit the same ownership area concurrently. If agents work in parallel, the integrator owns cross-cutting edits to engine.mjs, main.mjs, content.mjs, index.html, style.css, and network.mjs until file responsibility is explicitly handed over.

### P0 — Contract and baseline checkpoint

Dependencies: none.

- [x] Record actual starting commit; compare with the baseline in this document.
- [x] Read repository rules and current affected files.
- [x] Run the two existing test suites once; record baseline failures if any.
- [x] Agree/export shared schema, equipment-slot names, command fields, recipe contexts, and authoritative range helpers.
- [x] Commit fixed v1 migration fixtures for normal, full-storage, and phase-boundary saves.
- [x] Create a short ownership/status entry in section 19.

Deliverable: contracts and fixtures, no unfinished gameplay exposed.

### P1 — Item foundation and save migration

Dependencies: P0.

Owns: inventory.mjs, serialization.mjs, item metadata; coordinated engine integration.

- [ ] Implement item UIDs, slot containers, five sockets, validation, atomic planning/commit helpers.
- [ ] Adapt all item creation/consumption callers, including recipes, resource grants, drops, fuel, repairs, upgrades, farms, deaths, offline eviction, chest destruction.
- [ ] Introduce explicit equipment behavior and lantern ownership/effect cleanup.
- [ ] Remove count-dictionary and per-kind equipment assumptions from renderer icon lookup and queries.
- [ ] Implement v1→v2 migration, recovery storage, separate network/save serialization, and Continue discovery.
- [ ] Include phase-preserving migration logic using agreed 180/30/100 timings; do not enable new cycle timings without that logic.
- [ ] Add T01–T08, T18, T25, T31–T34 as applicable.

Done when: no caller can create a second owner for an item; old saves load without loss; worn gear survives all move paths.

Integration note: schema change, protocol version, serializers, adapted client, and the 180/30/100 clock/wave change must be activated together. Build/test the migration in P1, but do not write a phase-remapped v2 campaign while the runtime still uses the old clock. Coordinate the small timing core with P5 before any schema cutover; P5's visual work can follow separately within the integration branch.

### P2 — Chest transactions and network results

Dependencies: P1 contract and functioning containers; can develop harness cases after P0.

Owns: chest session lifecycle in engine, network action results/dedupe, network tests.

- [ ] Implement exclusive open/renew/close, range checks, lease expiry, lifecycle release.
- [ ] Implement transfers including sockets and all items.
- [ ] Make all shared-cost selectors lock-aware and atomic.
- [ ] Remove deposit/withdraw bypasses and dismantle loopholes.
- [ ] Add request IDs, revisions, result caching/high-water logic and snapshot/result reconciliation.
- [ ] Add network protocol v2 mismatch handling and bounded serialization checks.
- [ ] Keep transport heartbeat intact.
- [ ] Add T09–T15 and N01–N09.

Done when: race tests conserve all items; disconnection and rejoin cannot strand ownership.

### P3 — Context rules, recipes, timed interactions

Dependencies: P1; lock-aware costs from P2 before integration.

Owns: interactions.mjs, recipe eligibility, harvest/revive channels, build/maintenance intents.

- [ ] Define direct context capabilities for every structure type and exact-target validation.
- [ ] Apply station policies/lists and verify first-workbench progression.
- [ ] Implement placement context validation and maintenance/dismantle rules.
- [ ] Replace hit-based harvesting with dt-based shared work; interrupt/cancel correctly.
- [ ] Route tree/mining yield to world drops and require fresh pickup activation.
- [ ] Convert teammate revive to elapsed channel while preserving outcome.
- [ ] Remove gameplay ping and automatic-eat authoritative cases.
- [ ] Add T16–T27 and updated behavior assertions in existing tests.

Done when: no shortcut/event frequency can bypass duration, station eligibility, or item ownership.

### P4 — Mobile inventory, catalog, actions, HUD

Dependencies: P1/P2/P3 contracts; can construct inert views earlier, integrate after authoritative rules.

Owns: UI modules, main wiring, HTML and CSS.

- [ ] Build actual RPG slots/sockets and selected-item operations with stable keyed updates.
- [ ] Build combined chest/inventory panel and pending/lock-loss states.
- [ ] Build one context-filtered catalog; direct station entry; separate maintenance mode.
- [ ] Implement contextual circles, lantern circle, placement Place/Cancel, and mode state machine.
- [ ] Remove old hotbar actions, H/camp HUD controls, objective/target text and placement banner with all stale DOM references.
- [ ] Stack icon-only vitals and move minimap to safe-area top.
- [ ] Rework input cancellation, keyboard behavior, focus, drag/scroll, pointer capture, and orientation handling.
- [ ] Update field guide and player README to match the new progression/controls.
- [ ] Verify M01–M11 and M15, with screenshots for portrait/landscape and chest state.

Done when: every requested operation is reachable by touch, and no invisible old keyboard/hold path survives.

### P5 — Night visuals and pacing

Dependencies: P1 lantern/source representation and migration contracts; may develop renderer work alongside P2–P4.

Owns: lighting.mjs, both renderers, timing configuration/wave schedule, theme lighting documentation.

- [ ] Implement shared light collection/safety, phase interpolation, and replaceable theme values.
- [ ] Darken terrain, sprites, effects, and labels consistently; limit dark picking information.
- [ ] Enable 180/30/100 cycle only with migrated phase handling.
- [ ] Change wave opportunities to 0/40/80 and derive clock gradient from durations.
- [ ] Remove hardcoded old phase times, including demo scene/test assumptions.
- [ ] Verify actual WebGL and Canvas parity and phone performance.
- [ ] Add T28–T30 and verify M12–M14.

Done when: unlit midnight is meaningfully dark in both renderers, safe light boundaries match gameplay, and the longer night does not unintentionally add waves.

### P6 — Integration and release

Dependencies: P1–P5 complete.

Owns: integration fixes, release verification, workflow/deployment evidence.

- [ ] Review every row of request coverage against actual gameplay.
- [ ] Run all relevant suites and current CI gates.
- [ ] Complete actual two-device co-op scenarios and save migration checks.
- [ ] Audit removed controls/logic, unused listeners, stale CSS and player instructions.
- [ ] Confirm no debug state, secrets, uploaded reference art, or unrelated site files were added.
- [ ] Update version/cache identifiers consistently so browsers do not mix old entrypoints and new modules.
- [ ] Commit/push the completed coherent implementation to feat/hollowstead-coop.
- [ ] Verify the exact commit's GitHub Pages workflow succeeds and the site serves that revision.
- [ ] Record evidence, known limitations, and unverified device cases in section 19.

Done when: all 14 requests are fulfilled and release evidence names the actual tested/deployed commit.

## 17. Suggested integration order and safeguards

Sequence: P0 → P1 → P2/P3 → P4; P5 may overlap after the item/light contracts settle; P6 follows all.

Do not publish partial feature scaffolding on every task checkpoint. This branch deploys on push, so local commits or an integration branch can hold incomplete work until there is a playable vertical slice.

Recommended first locally playable slice: migrated inventory/equipment, updated protocol and clock/wave core, usable basic workbench progression, and the new grid. Next: exclusive chest and complete contextual/build controls. Then: timed harvesting/floor yields and final night presentation. Keep these intermediate slices on the integration branch until P6; the requested overhaul should deploy as a coherent release. If temporary adapters are used between slices, mark their deletion explicitly before P6.

Cross-cutting review risks:

| Risk | Required safeguard |
| --- | --- |
| Schema change destroys existing progress | Fixture migration and untouched v1 backup before enabling v2 |
| Chest lock only implemented in UI | Host-owned lease plus payment/dismantle bypass tests |
| “Remove actions” removes necessary mechanics | Remove global shortcut paths; preserve explicit inventory/station capabilities |
| Missing basic tool route | Barehand → bench → tool integration scenario |
| DOM rebuilding drops a user's touch | Stable action/grid elements; keyed updates; pointercancel handling |
| Darkness is only a colored floor overlay | Apply illumination to billboards, effects, labels, and selection |
| Night length increases enemy waves accidentally | Fractional three-wave schedule |
| Harvest outputs auto-collect on the next held tick | Finish consumes/releases the previous harvest activation |
| UI freezes while a request is ignored by cooldown | Explicit results and separate mutation timing |
| Shared code changes break another game | Scoped modules plus ball-game CI unchanged |

## 18. Deployment and definition of complete

The existing workflow already copies this plan and future Hollowstead files into GitHub Pages on push to feat/hollowstead-coop. No new hosting system or workflow trigger is required for the plan.

Implementation complete means all of the following:

- [ ] All 14 user-request rows have passing evidence or an explicitly reported blocker.
- [ ] No old Ping/Eat/Craft/Light hotbar controls or global C/Q/G dispatch remain.
- [ ] Network heartbeat still works.
- [ ] Inventory supports every item and explicit equipment, consumption, quantities, dropping, and touch use.
- [ ] Chests display both inventories, transfer every item kind, and enforce one opener under races/disconnects.
- [ ] Crafting/building share a component and stations open directly to correct lists.
- [ ] Field building cannot reveal or execute workbench-only construction.
- [ ] Multi-option structures expose direct contextual circles.
- [ ] Build placement and maintenance use action controls and have no old floating confirmation window.
- [ ] Harvest/revive use host elapsed time; no effort/progress HUD; chopped/mined items stay on floor until pickup.
- [ ] Night visibility, longer cycle, and all related timers are correct in both renderers.
- [ ] Icon-only vertical vitals and top minimap fit real phone safe areas.
- [ ] Existing saves migrate without item loss; new saves/rejoins round-trip accurately.
- [ ] Automated rules and transport tests pass, real device checks are recorded, and exact deployment succeeds.

No merge into master is part of this request unless Jun subsequently asks.

## 19. Continuation log

Maintain this section as implementation proceeds. Do not mark a package complete merely because code exists.

| Package | Status | Owner | Commit / evidence | Remaining issue |
| --- | --- | --- | --- | --- |
| Planning | Complete | Orchestrator | Plan only; baseline 395baac7a332f1ed94b5c73e0ec4b4882ee47afe | Gameplay implementation not started |
| P0 | Complete | P0 agent | bc220e92a19eb4665e0346ce025a124e4e283035 | No gameplay change. P1–P6 not started |
| P1 | Not started | Unassigned | — | — |
| P2 | Not started | Unassigned | — | — |
| P3 | Not started | Unassigned | — | — |
| P4 | Not started | Unassigned | — | — |
| P5 | Not started | Unassigned | — | — |
| P6 | Not started | Unassigned | — | — |

For each handoff, append:

    Date:
    Package / agent:
    Starting commit:
    Ending commit:
    Files changed:
    Implemented behavior:
    Tests and device checks actually run:
    Evidence / screenshots / deployment run:
    Remaining failures or unverified cases:
    Compatibility/migration notes:
    Exact next task:

The next agent should start with P1. The original game's previous 17 Hollowstead tests and 17 ball-game tests passed at the inspected baseline; those counts are historical context, not evidence that this planned overhaul has been tested.

Date: 2026-09-24
Package / agent: P0 / P0 agent
Starting commit: d94450e2b40b31eb5bf8ea22b5a95dad05b54e5b
Ending commit: bc220e92a19eb4665e0346ce025a124e4e283035. The branch tip that records this hash changes only this log. Start P1 from that tip.
Files changed:
- hollowstead/src/contracts.mjs
- hollowstead/tests/contracts.test.mjs
- hollowstead/tests/fixtures/generate-v1-fixtures.mjs
- hollowstead/tests/fixtures/v1-normal.json
- hollowstead/tests/fixtures/v1-full-storage.json
- hollowstead/tests/fixtures/v1-phase-boundaries.json
- hollowstead/IMPLEMENTATION_PLAN.md
Implemented behavior:
- Recorded the starting commit d94450e2b40b31eb5bf8ea22b5a95dad05b54e5b. Its only change from the inspected baseline 395baac7a332f1ed94b5c73e0ec4b4882ee47afe is this plan. Repository rules were read; local docs/ was absent and was not created.
- Exported the shared overhaul contract from hollowstead/src/contracts.mjs: equipment sockets, item/container fields, intent payloads, recipe contexts, action order, range helpers, and the 260→310 phase-preserving time helpers. Nothing in the live game imports it. Protocol stays hollowstead-1 and the clock stays 150/30/80.
- Committed synthetic v1 saves generated with World: an ordinary camp, a full pack plus paged/overflow storage, and eight exact old cycle boundaries (0, 150, 180, 260, 410, 440, 1220, 1300). Each world round-trips through World.restore. No v1→v2 migration, inventory gameplay, HUD, chests, harvesting, or night visuals were added.
Tests and device checks actually run:
- Before the change, at d94450e: `node --test hollowstead/tests/*.test.mjs` (17 pass) and `node --test ball-game/tests/*.test.mjs` (17 pass).
- After the change: the same Hollowstead command (21 pass, including 4 new contract/fixture tests) and the same ball-game command (17 pass). `node --check` on the new modules. `git diff --check` clean.
- No browser gameplay pass. This package does not change the running game.
Evidence / screenshots / deployment run:
- Baseline comparison: `git diff 395baac7a332f1ed94b5c73e0ec4b4882ee47afe..d94450e2b40b31eb5bf8ea22b5a95dad05b54e5b --stat` is IMPLEMENTATION_PLAN.md only.
- Contracts and fixtures are commit bc220e92a19eb4665e0346ce025a124e4e283035. This log line is the only later P0 edit. Visible gameplay is unchanged. The published plan text is the only player-visible file in this package.
Remaining failures or unverified cases:
- None in the existing suites. M01–M18 were not run. v1→v2 migration is not implemented, so the fixtures are not yet migrated.
Compatibility/migration notes:
- Saves remain hollowstead.expedition.v1, RULES.version 1. Fixtures use the live snapshot wrapper `{world, savedAt}` (phase boundaries add name/time/phase labels around that world).
- The guest pack in v1-full-storage.json is an over-capacity count dictionary. World.restore accepts it. A normal 120-supply pack always fits in 24 stacks of 20 because only 13 supply ids exist; that guest pack is the overflow case section 13 must not discard. The host pack is a legal 120, and the chest was filled through deposit plus the real store shape, including food.
- Phase helpers snap exact old boundaries onto the phase that begins there (150→180, 180→210, 260→310) and do not replay the night-start wave. They are not called by the simulation.
Exact next task: P1 — Item foundation and save migration. Do not enable the 180/30/100 clock until phase-preserving migration is in place and coordinated with P5.
