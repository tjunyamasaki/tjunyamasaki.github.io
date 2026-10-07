# Hollowstead

For weapon creation or changes, read [WEAPON_AUTHORING.md](WEAPON_AUTHORING.md) first and follow it: it names the two reference files to read, the patterns already taken, the exact files to touch and how to film the result (`tools/fx-film.mjs`). Don't explore beyond it.

Keep weapon guidance in that guide so unrelated tasks do not load it. Follow the user's requested scope for validation and delivery.

Classes (the Classes mode, `?classes`): the rules for trees, points and the skill bar are in `src/classes/registry.mjs` (its header documents a class definition); each class is one module like `src/classes/ronin.mjs`, its looks in `src/fx/<class>.mjs`, its tests in `tests/classes.test.mjs`.
