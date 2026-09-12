import {tile} from './tiles.mjs';

const $ = id => document.getElementById(id);
const sets = groups => `<div class="guide-example">${groups.map(group =>
  `<span class="guide-set">${group.map(p => tile(p, 'mini')).join('')}</span>`
).join('')}</div>`;
const yaku = ({jp, en, han, open, text, groups, note}) => `<article class="yaku-card">
  <header><div><strong>${en}</strong><small>${jp}</small></div><span class="yaku-han">${han}</span></header>
  <p>${text}</p>
  ${groups ? sets(groups) : ''}
  <p class="yaku-meta">${open === false ? 'Closed hand only.' : open === 'less' ? 'One han less if any meld is called.' : 'Valid open or closed.'}</p>
  ${note ? `<p class="yaku-note">${note}</p>` : ''}
</article>`;

function pages() {
  return [
    {
      nav: 'The table',
      title: 'The art of riichi.',
      html: `
        <p class="muted">Japanese four-player mahjong. Four seats share a 136-tile wall. The aim is to complete a legal hand with at least one yaku, then score it in han and fu.</p>
        ${sets([['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['z7', 'z7', 'z7'], ['z1', 'z1']])}
        <p>That shape is four groups and a pair: three sequences or triplets, plus two identical tiles. The gold of a result screen is not the pretty pattern — it is the yaku that make the pattern legal to win.</p>
        <h3>How a night is built</h3>
        <ol class="guide-list">
          <li>East sits at the dealer's seat. Play proceeds counter-clockwise: East, South, West, North.</li>
          <li>Each player is dealt 13 tiles. The dealer draws first to 14, then discards.</li>
          <li>On your turn you draw from the wall, may declare a win or kan, then discard one tile.</li>
          <li>You may claim another player's discard with chi, pon, kan, or ron when the rules allow it.</li>
          <li>The first legal win ends the hand. If the wall runs out, the hand is drawn and tenpai is paid.</li>
        </ol>
        <h3>Words you will see</h3>
        <dl class="guide-glossary">
          <div><dt>Tenpai</dt><dd>One tile from a complete shape. The table will list your waits.</dd></div>
          <div><dt>Yaku</dt><dd>A named scoring pattern. You need at least one to ron or tsumo. Dora are not a yaku.</dd></div>
          <div><dt>Han / fu</dt><dd>Han is the size of the pattern. Fu is the small structural points. Together they become the payment.</dd></div>
          <div><dt>Menzen</dt><dd>A closed hand: you have not called chi, pon, or an open kan.</dd></div>
          <div><dt>Furiten</dt><dd>Ron is blocked because a wait is already in your river, or you passed a winning discard.</dd></div>
        </dl>
        <p>Use the page list above to jump. Every combination this parlor scores is illustrated later, with han values and example tiles.</p>`
    },
    {
      nav: 'Tiles',
      title: 'The 136 tiles.',
      html: `
        <p>Three numbered suits run 1–9, four copies of each. Honors are the four winds and three dragons, also four copies. Three of the fives are red; they count as 5s and as extra dora.</p>
        <div class="tile-reference">${[['m3', 'Characters · 萬子'], ['p3', 'Circles · 筒子'], ['s3', 'Bamboo · 索子'], ['z7', 'Honors · 字牌']].map(([p, label]) => `<span>${tile(p)}${label}</span>`).join('')}</div>
        <h3>Numbered suits</h3>
        <p class="guide-row">${[1, 2, 3, 4, 5, 0, 6, 7, 8, 9].map(n => tile('m' + n, 'mini')).join('')}</p>
        <p>1 and 9 are <b>terminals</b> (幺九). 2–8 are <b>simples</b>. Sequences can only be built in one suit, in order, for example 4-5-6 of bamboo. Honors cannot form sequences.</p>
        <h3>Winds and dragons</h3>
        <p class="guide-row">${['z1', 'z2', 'z3', 'z4'].map(p => tile(p)).join('')}<span class="guide-caption">East · South · West · North</span></p>
        <p class="guide-row">${['z5', 'z6', 'z7'].map(p => tile(p)).join('')}<span class="guide-caption">White · Green · Red</span></p>
        <p>Your <b>seat wind</b> is the wind of your chair this hand. The <b>round wind</b> is East during the East round, South during the South round. A triplet of your seat wind, the round wind, or any dragon is yakuhai — a one-han yaku by itself.</p>
        <h3>The wall</h3>
        <p>136 tiles are stacked into a wall. After the deal, 70 tiles remain to be drawn in a normal starting position (the live wall). Fourteen tiles at the end are the dead wall: kan replacement tiles, dora indicators, and ura dora. The counter in the center of the table is the live wall, not including the dead wall.</p>
        <p>Red fives: one in characters, one in circles, one in bamboo. They behave as ordinary 5s in sequences and triplets, and each is always worth one extra dora when you win.</p>`
    },
    {
      nav: 'Hand shape',
      title: 'Four groups and a pair.',
      html: `
        <p>A standard winning hand is 14 tiles: four <b>mentsu</b> (groups) plus a <b>jantou</b> (pair). A group is either a sequence of three consecutive tiles in one suit, or three identical tiles.</p>
        <h3>Sequence · shuntsu</h3>
        ${sets([['s2', 's3', 's4']])}
        <p>Order in the suit matters; 3-4-5 of circles is a sequence, 3-4-5 mixed across suits is not. 7-8-9 is legal. 8-9-1 is not. Honors cannot sequence.</p>
        <h3>Triplet · koutsu</h3>
        ${sets([['p8', 'p8', 'p8'], ['z6', 'z6', 'z6']])}
        <p>Three of the same tile. Four of a kind is a <b>kan</b> — it still counts as one group, and you draw a replacement tile so the hand stays 14 tiles after the next discard.</p>
        <h3>The pair</h3>
        ${sets([['z5', 'z5']])}
        <p>Any two identical tiles. A pair of dragons or of a scoring wind is worth fu, and can also help yakuhai if you later have a triplet of that tile instead.</p>
        <h3>Two special shapes</h3>
        <p><b>Seven pairs</b> (chiitoitsu) is seven different pairs. No four-of-a-kind may be used as two pairs.</p>
        ${sets([['m2', 'm2'], ['m8', 'm8'], ['p4', 'p4'], ['p6', 'p6'], ['s3', 's3'], ['s9', 's9'], ['z3', 'z3']])}
        <p><b>Thirteen orphans</b> (kokushi musou) is one of each terminal and honor, plus a fourteenth tile that matches any of them.</p>
        ${sets([['m1'], ['m9'], ['p1'], ['p9'], ['s1'], ['s9'], ['z1'], ['z2'], ['z3'], ['z4'], ['z5'], ['z6'], ['z7', 'z7']])}
        <h3>Ready, complete, winning</h3>
        <p><b>Tenpai</b> means 13 tiles that become a complete shape with one more tile. <b>Complete shape</b> is 14 tiles that form a legal structure. <b>A win</b> also requires at least one yaku. A beautiful all-sequence hand with no yaku cannot ron or tsumo — dora do not rescue it.</p>`
    },
    {
      nav: 'Your turn',
      title: 'Draw, choose, discard.',
      html: `
        <p>Turns move counter-clockwise. When the player on your left discards, the next draw is yours unless someone calls that tile.</p>
        <ol class="guide-list">
          <li>You draw automatically. The newest tile is marked with a gold edge.</li>
          <li>If the drawn tile completes a yaku hand, <b>Tsumo</b> appears. You may take it or play on.</li>
          <li>If you have four identical tiles, <b>Kan</b> may appear. A kan draws a replacement from the dead wall.</li>
          <li>If you are closed and one tile from winning, <b>Riichi</b> may appear.</li>
          <li>Otherwise select a tile and press <b>Discard</b>, or tap the same tile twice. Arrow keys also move the selection.</li>
        </ol>
        <p>After riichi your discards are chosen for you until a real decision appears — tsumo, a legal kan, or a win on someone else.</p>
        <h3>What to throw</h3>
        <p>Early discards are often terminals and honors you cannot use. Later, every discard is a message: it can deal into an opponent, or it can be the tile that proves you are not waiting on it. The optional suggestion looks at your concealed tiles and the public table; it is advice, not a guarantee.</p>
        <h3>Reading rivers</h3>
        <p>Tap any seat to enlarge their discards and open melds. Dim tiles were claimed. A red dot marks the riichi declaration discard. A player who has already thrown the tile you need is safer to deal into for ron — unless they can still tsumo.</p>`
    },
    {
      nav: 'Calls',
      title: 'Chi, pon, and kan.',
      html: `
        <p>Calls appear only when they are legal. You can always pass. Calling chi, pon, or an open kan <b>opens</b> the hand: several yaku vanish, and some others drop one han.</p>
        <h3>Chi · 吃</h3>
        <p>Claim a sequence from the player on your left only. The claimed tile plus two in your hand must form 3-4-5 in one suit, or any other legal sequence.</p>
        ${sets([['m3', 'm4', 'm5']])}
        <p>After chi you must discard immediately. You generally cannot immediately discard a tile that would complete the same sequence you just called (kuikae).</p>
        <h3>Pon · 碰</h3>
        <p>Claim a triplet from anyone's discard when you already hold two of that tile. Pon can interrupt a chi and steals the turn. After pon you discard immediately.</p>
        ${sets([['z7', 'z7', 'z7']])}
        <h3>Kan · 槓</h3>
        <p>Four of a kind. You draw a replacement tile from the dead wall, a new dora indicator is revealed, and play continues from you (except a claimed open kan, after which you still discard once you have the replacement).</p>
        <ul class="guide-list">
          <li><b>Closed kan (ankan)</b> — four in your concealed hand. The hand stays closed. Other players may still chankan only on a kokushi wait in some tables; this parlor uses the Majiang core's kan-rob rules (added kans can be robbed).</li>
          <li><b>Open kan (daiminkan)</b> — three in hand, claim the fourth from a discard. Opens the hand.</li>
          <li><b>Added kan (kakan)</b> — you already pon'd, and you draw or already hold the fourth tile. This kan can be robbed with ron (chankan).</li>
        </ul>
        ${sets([['s8', 's8', 's8', 's8']])}
        <p>Four kans in one hand by one player can be suukantsu (yakuman). Four kans split among the table abort the hand. A fifth kan is never allowed.</p>
        <h3>Useful open-hand yaku</h3>
        <p>If you open, look for all simples (tanyao), a dragon triplet, your seat or round wind, all triplets (toitoi), half flush (honitsu), or full flush (chinitsu). Closed-only jewels such as riichi, pinfu, and iipeikou are gone.</p>`
    },
    {
      nav: 'Winning',
      title: 'Riichi, tsumo, ron, furiten.',
      html: `
        <h3>Tsumo · 自摸</h3>
        <p>You win on your own draw. Everyone else pays you. A closed tsumo is itself a one-han yaku (menzen tsumo). Open hands can still tsumo if they have another yaku.</p>
        <h3>Ron · 栄和</h3>
        <p>You win on another player's discard. Only that player pays you (plus honba and riichi sticks). Two players may ron the same discard (double ron). Three simultaneous rons abort the hand.</p>
        <h3>Riichi · 立直</h3>
        <p>When your hand is closed, in tenpai, and you still have tiles to draw, you may stake 1,000 points and discard from the highlighted legal tiles. The stick goes to the center. Your hand is then locked: you can only win or, in limited cases, kan.</p>
        <ul class="guide-list">
          <li>Riichi is one han. It also unlocks ura dora if you win, and ippatsu if nobody calls before your next draw and you win immediately.</li>
          <li><b>Double riichi</b> is riichi declared on your very first discard, with no calls on the table before it. Two han.</li>
          <li>If you win, you recover your stick plus any other riichi sticks on the table. If someone else wins, they take them. Drawn hands leave the sticks for the next winner.</li>
        </ul>
        <h3>Furiten · 振聴</h3>
        <p>Ron is forbidden; tsumo is still allowed.</p>
        <ul class="guide-list">
          <li><b>Permanent furiten</b> — any of your current waits is already in your own discard river (including the riichi declaration tile).</li>
          <li><b>Temporary furiten</b> — you passed a tile that would have completed your hand. It lasts until your next draw. After riichi, passing a winning discard makes furiten last for the rest of the hand.</li>
        </ul>
        <p>The status line will say <b>Furiten · tsumo only</b> when this applies to you. Do not rely on ron from a furiten seat.</p>
        <h3>Ippatsu, haitei, houtei, rinshan, chankan</h3>
        <p>These are one-han extras: winning in the riichi window before any call (ippatsu), winning on the last live-wall draw (haitei) or last discard (houtei), winning on a kan replacement (rinshan), or robbing an added kan (chankan). They stack with whatever else the hand already scores.</p>`
    },
    {
      nav: 'Dora',
      title: 'Dora, ura, and red fives.',
      html: `
        <p>Dora add han to a winning hand. They are never a yaku by themselves. A complete hand with four dora and no yaku still cannot win.</p>
        <h3>The indicator</h3>
        <p>The dead wall shows one dora indicator at the start. The dora is the <b>next</b> tile in sequence:</p>
        <ul class="guide-list">
          <li>Numbers wrap: an indicated 9 makes 1 of that suit the dora. An indicated 4 makes 5 the dora.</li>
          <li>Winds cycle East → South → West → North → East.</li>
          <li>Dragons cycle white → green → red → white.</li>
        </ul>
        <p class="guide-row">${tile('s4')}<span class="guide-caption">Indicator 4 bamboo → dora is 5 bamboo</span>${tile('s5')}${tile('s0')}</p>
        <p>Each copy of a dora tile in your winning hand, including in melds and the pair, is one han. A red five that is also the suit's dora counts twice (red dora + dora).</p>
        <h3>Kan dora</h3>
        <p>Each kan reveals another indicator. Those dora apply to every winner of the hand, not only the player who kanned.</p>
        <h3>Ura dora</h3>
        <p>If a riichi hand wins, the ura indicators underneath the dora indicators are flipped. Only that winning riichi hand scores them. Non-riichi wins do not see ura.</p>
        <h3>Red dora</h3>
        <p>This parlor uses one red five per suit. Each red five in the winning hand is one han, on top of any ordinary dora it may also be.</p>`
    },
    {
      nav: '1-han yaku',
      title: 'One-han combinations.',
      html: `
        <p>Any one of these is enough to win. They stack with each other when the hand qualifies for more than one.</p>
        ${yaku({jp: '立直', en: 'Riichi', han: '1', open: false, text: 'Declare riichi on a closed tenpai hand and win before the hand ends. Ura dora become available.', groups: [['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['m7', 'm8', 'm9'], ['p8', 'p8']]})}
        ${yaku({jp: '一発', en: 'Ippatsu', han: '1', open: false, text: 'Win in the short window after riichi: before your next discard is claimed, and before anyone calls chi, pon, or kan.', groups: [['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['m7', 'm8', 'm9'], ['p8', 'p8']], note: 'Requires riichi. A call anywhere on the table cancels ippatsu.'})}
        ${yaku({jp: '門前清自摸和', en: 'Menzen tsumo', han: '1', open: false, text: 'Win by drawing the tile yourself with a closed hand. Open hands do not get this han, but they may still tsumo with other yaku.', groups: [['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['z6', 'z6', 'z6'], ['p9', 'p9']]})}
        ${yaku({jp: '断幺九', en: 'Tanyao · all simples', han: '1', open: true, text: 'Every tile is 2–8. No 1s, 9s, winds, or dragons. This parlor allows open tanyao (kuitan).', groups: [['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['p2', 'p2', 'p2'], ['s5', 's5']]})}
        ${yaku({jp: '平和', en: 'Pinfu', han: '1', open: false, text: 'Closed, all sequences, a pair that is not a scoring wind or dragon, and a two-sided sequence wait (ryanmen). Tsumo pinfu is 20 fu; ron pinfu is 30 fu.', groups: [['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['m6', 'm7', 'm8'], ['p8', 'p8']], note: 'Waiting on both sides of a sequence, for example holding 6-7 and waiting 5 or 8. Edge, closed, and pair waits are not pinfu.'})}
        ${yaku({jp: '一盃口', en: 'Iipeikou', han: '1', open: false, text: 'Two identical sequences in the same suit, closed. Open, this shape scores nothing extra (it is just two sequences).', groups: [['m2', 'm3', 'm4'], ['m2', 'm3', 'm4'], ['p6', 'p7', 'p8'], ['s5', 's6', 's7'], ['z5', 'z5']]})}
        ${yaku({jp: '翻牌', en: 'Yakuhai · value honor', han: '1 each', open: true, text: 'A triplet (or kan) of white, green, or red dragon, of the round wind, or of your seat wind. Each such triplet is one han. A triplet that is both seat and round wind is two han (daburu kaze).', groups: [['m2', 'm3', 'm4'], ['p6', 'p7', 'p8'], ['s2', 's3', 's4'], ['z7', 'z7', 'z7'], ['p9', 'p9']], note: 'The pair of a value honor is not yakuhai; it only adds fu. You need the triplet.'})}
        ${yaku({jp: '海底摸月 / 河底撈魚', en: 'Haitei / Houtei', han: '1', open: true, text: 'Haitei: tsumo on the last tile of the live wall. Houtei: ron on the last discard of the hand. They do not combine with each other.', groups: [['m3', 'm4', 'm5'], ['p2', 'p3', 'p4'], ['s6', 's7', 's8'], ['z5', 'z5', 'z5'], ['m9', 'm9']]})}
        ${yaku({jp: '嶺上開花', en: 'Rinshan kaihou', han: '1', open: true, text: 'Win on the replacement tile drawn after a kan.', groups: [['m2', 'm3', 'm4'], ['p5', 'p6', 'p7'], ['s2', 's3', 's4'], ['z6', 'z6', 'z6', 'z6'], ['p1', 'p1']]})}
        ${yaku({jp: '槍槓', en: 'Chankan', han: '1', open: true, text: 'Ron when another player adds a fourth tile to their pon (added kan). The hand is treated as winning on that tile.', groups: [['m1', 'm2', 'm3'], ['p7', 'p8', 'p9'], ['s3', 's4', 's5'], ['z1', 'z1', 'z1'], ['s9', 's9']]})}
        ${yaku({jp: 'ダブル立直', en: 'Double riichi', han: '2', open: false, text: 'Riichi on your very first discard, with no intervening calls on the table. It replaces ordinary riichi; you do not score both.', groups: [['m2', 'm3', 'm4'], ['p3', 'p4', 'p5'], ['s6', 's7', 's8'], ['m7', 'm8', 'm9'], ['z2', 'z2']]})}
      `
    },
    {
      nav: '2-han yaku',
      title: 'Two-han combinations.',
      html: `
        ${yaku({jp: '七対子', en: 'Chiitoitsu · seven pairs', han: '2', open: false, text: 'Seven distinct pairs. Always 25 fu. Cannot include a four-of-a-kind treated as two pairs. Has its own waits: any tile that completes a pair.', groups: [['m3', 'm3'], ['m6', 'm6'], ['p2', 'p2'], ['p8', 'p8'], ['s4', 's4'], ['s9', 's9'], ['z7', 'z7']]})}
        ${yaku({jp: '対々和', en: 'Toitoi · all triplets', han: '2', open: true, text: 'Four triplets (or kans) and a pair. Open or closed. Closed toitoi with three concealed triplets is also sanankou.', groups: [['m4', 'm4', 'm4'], ['p8', 'p8', 'p8'], ['s2', 's2', 's2'], ['z6', 'z6', 'z6'], ['p3', 'p3']]})}
        ${yaku({jp: '三暗刻', en: 'Sanankou', han: '2', open: true, text: 'Three concealed triplets. The fourth group may be open. Winning by ron on a triplet wait does not count that triplet as concealed.', groups: [['m8', 'm8', 'm8'], ['p3', 'p3', 'p3'], ['s5', 's5', 's5'], ['m2', 'm3', 'm4'], ['z5', 'z5']]})}
        ${yaku({jp: '三色同順', en: 'Sanshoku doujun', han: '2 / 1', open: 'less', text: 'The same numerical sequence in all three suits, for example 4-5-6 in characters, circles, and bamboo.', groups: [['m4', 'm5', 'm6'], ['p4', 'p5', 'p6'], ['s4', 's5', 's6'], ['z7', 'z7', 'z7'], ['m9', 'm9']]})}
        ${yaku({jp: '一気通貫', en: 'Ittsuu · straight', han: '2 / 1', open: 'less', text: '123, 456, and 789 in the same suit. The remaining group and pair can be anything legal.', groups: [['s1', 's2', 's3'], ['s4', 's5', 's6'], ['s7', 's8', 's9'], ['p3', 'p3', 'p3'], ['z1', 'z1']]})}
        ${yaku({jp: '混全帯幺九', en: 'Chanta', han: '2 / 1', open: 'less', text: 'Every group and the pair contains a terminal or an honor. The hand must contain at least one sequence (otherwise it is honroutou) and at least one honor (otherwise it is junchan).', groups: [['m1', 'm2', 'm3'], ['p7', 'p8', 'p9'], ['s1', 's1', 's1'], ['z2', 'z2', 'z2'], ['z5', 'z5']]})}
        ${yaku({jp: '三色同刻', en: 'Sanshoku doukou', han: '2', open: true, text: 'The same number as a triplet in all three suits, for example three 8s of each suit.', groups: [['m8', 'm8', 'm8'], ['p8', 'p8', 'p8'], ['s8', 's8', 's8'], ['m2', 'm3', 'm4'], ['z3', 'z3']]})}
        ${yaku({jp: '混老頭', en: 'Honroutou', han: '2', open: true, text: 'Every tile is a terminal or honor. No sequences are possible, so the hand is all triplets or seven pairs. Often stacks with toitoi or chiitoitsu.', groups: [['m1', 'm1', 'm1'], ['p9', 'p9', 'p9'], ['s1', 's1', 's1'], ['z4', 'z4', 'z4'], ['z7', 'z7']]})}
        ${yaku({jp: '小三元', en: 'Shousangen', han: '2', open: true, text: 'Two dragon triplets and a dragon pair. The two triplets are also yakuhai, so the hand is at least four han before dora.', groups: [['z5', 'z5', 'z5'], ['z6', 'z6', 'z6'], ['z7', 'z7'], ['m3', 'm4', 'm5'], ['p2', 'p3', 'p4']]})}
        ${yaku({jp: '三槓子', en: 'Sankantsu', han: '2', open: true, text: 'Three kans in one hand, any mix of closed and open. Rare. Four kans is the yakuman suukantsu.', groups: [['m4', 'm4', 'm4', 'm4'], ['p9', 'p9', 'p9', 'p9'], ['s2', 's2', 's2', 's2'], ['z1', 'z1', 'z1'], ['p6', 'p6']]})}
      `
    },
    {
      nav: '3–6 han',
      title: 'High ordinary yaku.',
      html: `
        ${yaku({jp: '混一色', en: 'Honitsu · half flush', han: '3 / 2', open: 'less', text: 'Tiles from only one numbered suit, plus honors. A very common large hand once you commit to a suit.', groups: [['s2', 's3', 's4'], ['s5', 's6', 's7'], ['s8', 's8', 's8'], ['z6', 'z6', 'z6'], ['z2', 'z2']]})}
        ${yaku({jp: '純全帯幺九', en: 'Junchan', han: '3 / 2', open: 'less', text: 'Every group and the pair contains a terminal. No honors. Must include at least one sequence, or the hand would be chinroutou (yakuman).', groups: [['m1', 'm2', 'm3'], ['p7', 'p8', 'p9'], ['s1', 's2', 's3'], ['m9', 'm9', 'm9'], ['p1', 'p1']]})}
        ${yaku({jp: '二盃口', en: 'Ryanpeikou', han: '3', open: false, text: 'Two separate iipeikou: two pairs of identical sequences. Closed only. It includes chiitoitsu-like texture but is scored as four sequences plus a pair, not as seven pairs.', groups: [['m2', 'm3', 'm4'], ['m2', 'm3', 'm4'], ['p6', 'p7', 'p8'], ['p6', 'p7', 'p8'], ['s5', 's5']]})}
        ${yaku({jp: '清一色', en: 'Chinitsu · full flush', han: '6 / 5', open: 'less', text: 'Every tile from a single numbered suit. No honors. Often enormous once dora land in the same suit.', groups: [['p1', 'p2', 'p3'], ['p3', 'p4', 'p5'], ['p5', 'p6', 'p7'], ['p8', 'p8', 'p8'], ['p9', 'p9']]})}
        <h3>How han adds</h3>
        <p>Independent yaku stack. A closed riichi pinfu tanyao tsumo with one dora is 1+1+1+1+1 = 5 han if all apply. Open tanyao plus a red dragon triplet is 2 han even with a plain hand. Chinitsu already 6 closed; add riichi and dora on top.</p>
        <p>At 5 han the fu table still matters. At 6–7 han the hand is haneman regardless of fu. 8–10 is baiman, 11–12 sanbaiman, 13+ kazoe yakuman on this table.</p>
        <h3>Nagashi mangan</h3>
        <p>If the wall empties and every tile in your river is a terminal or honor, and none of your discards were called, you may score nagashi mangan. It is settled as a special draw-win at mangan, not as an ordinary yaku list on a 14-tile hand.</p>`
    },
    {
      nav: 'Yakuman',
      title: 'Limit hands.',
      html: `
        <p>A yakuman does not use the fu table. It pays the limit: 32,000 to a non-dealer, 48,000 to the dealer, before honba. Some are double yakuman on this table when the wait or composition is the rarer form.</p>
        ${yaku({jp: '国士無双', en: 'Kokushi musou', han: 'Yakuman', open: false, text: 'One of each terminal and honor, plus a fourteenth tile matching any of them. Thirteen-sided wait (you already have all thirteen singles) is a double yakuman.', groups: [['m1'], ['m9'], ['p1'], ['p9'], ['s1'], ['s9'], ['z1'], ['z2'], ['z3'], ['z4'], ['z5'], ['z6'], ['z7', 'z7']]})}
        ${yaku({jp: '四暗刻', en: 'Suuankou', han: 'Yakuman', open: false, text: 'Four concealed triplets and a pair. Winning on the pair wait (tanki) is a double yakuman. Ron on a triplet wait does not count that triplet as concealed, so it would not be suuankou.', groups: [['m3', 'm3', 'm3'], ['p5', 'p5', 'p5'], ['s8', 's8', 's8'], ['z6', 'z6', 'z6'], ['p2', 'p2']]})}
        ${yaku({jp: '大三元', en: 'Daisangen', han: 'Yakuman', open: true, text: 'Triplets of all three dragons. Open or closed.', groups: [['z5', 'z5', 'z5'], ['z6', 'z6', 'z6'], ['z7', 'z7', 'z7'], ['m4', 'm5', 'm6'], ['p8', 'p8']]})}
        ${yaku({jp: '小四喜 / 大四喜', en: 'Shousuushii / Daisuushii', han: 'Yakuman / 2×', open: true, text: 'Little four winds: three wind triplets and a wind pair. Big four winds: four wind triplets — double yakuman.', groups: [['z1', 'z1', 'z1'], ['z2', 'z2', 'z2'], ['z3', 'z3', 'z3'], ['z4', 'z4'], ['m8', 'm8', 'm8']]})}
        ${yaku({jp: '字一色', en: 'Tsuuiisou', han: 'Yakuman', open: true, text: 'Every tile is an honor. All winds and dragons; no numbered tiles. Often overlaps daisangen or the four winds.', groups: [['z1', 'z1', 'z1'], ['z2', 'z2', 'z2'], ['z5', 'z5', 'z5'], ['z6', 'z6', 'z6'], ['z7', 'z7']]})}
        ${yaku({jp: '緑一色', en: 'Ryuuiisou', han: 'Yakuman', open: true, text: 'Every tile is green: bamboo 2, 3, 4, 6, 8, and the green dragon. No other bamboo, and no other honors.', groups: [['s2', 's3', 's4'], ['s2', 's3', 's4'], ['s6', 's6', 's6'], ['s8', 's8', 's8'], ['z6', 'z6']]})}
        ${yaku({jp: '清老頭', en: 'Chinroutou', han: 'Yakuman', open: true, text: 'Every tile is a 1 or a 9. No honors and no simples. All triplets (or kans) plus a pair.', groups: [['m1', 'm1', 'm1'], ['m9', 'm9', 'm9'], ['p1', 'p1', 'p1'], ['s9', 's9', 's9'], ['p9', 'p9']]})}
        ${yaku({jp: '九蓮宝燈', en: 'Chuuren poutou', han: 'Yakuman', open: false, text: 'Closed, one suit, in the shape 1112345678999 plus one extra tile of that suit. The nine-sided wait (pure chuuren, already holding 1112345678999) is a double yakuman.', groups: [['s1', 's1', 's1'], ['s2', 's3', 's4'], ['s5', 's6', 's7'], ['s8', 's9', 's9'], ['s9', 's5']]})}
        ${yaku({jp: '四槓子', en: 'Suukantsu', han: 'Yakuman', open: true, text: 'Four kans in one hand. The pair is the remaining two tiles. Extremely rare; the table also aborts if four kans are declared by different players.', groups: [['m2', 'm2', 'm2', 'm2'], ['p5', 'p5', 'p5', 'p5'], ['s8', 's8', 's8', 's8'], ['z7', 'z7', 'z7', 'z7'], ['p1', 'p1']]})}
        ${yaku({jp: '天和 / 地和', en: 'Tenhou / Chiihou', han: 'Yakuman', open: false, text: 'Tenhou: dealer wins on the initial 14-tile deal, before discarding. Chiihou: a non-dealer wins on their first draw, with no calls before it. This parlor includes these first-draw yakuman.', groups: [['m1', 'm2', 'm3'], ['p4', 'p5', 'p6'], ['s7', 's8', 's9'], ['z5', 'z5', 'z5'], ['z1', 'z1']]})}
        <p>Kazoe yakuman: 13 or more han from ordinary yaku and dora is paid as a yakuman. Combinations such as closed chinitsu plus riichi plus several dora can reach it without a named limit hand.</p>`
    },
    {
      nav: 'Scoring',
      title: 'Fu, han, and payments.',
      html: `
        <p>The result screen shows han, fu, the yaku list, dora, and every seat's point transfer. The short version: find han from yaku and dora, find fu from the structure, look up the payment, then add honba and riichi sticks.</p>
        <h3>Fu · the small points</h3>
        <ul class="guide-list">
          <li>Base 20 fu.</li>
          <li>Closed ron: +10. Tsumo: +2, except pinfu tsumo which stays 20.</li>
          <li>Seven pairs: always 25 fu (not rounded from 20).</li>
          <li>Pair of a dragon, seat wind, or round wind: +2 (a pair that is both seat and round: +4).</li>
          <li>Wait: pair wait, closed wait (kanchan), or edge wait (penchan) +2. Two-sided sequence wait: +0.</li>
          <li>Open triplet of simples +2; terminals or honors +4. Concealed triplet of simples +4; terminals or honors +8.</li>
          <li>Open kan of simples +8; terminals or honors +16. Concealed kan of simples +16; terminals or honors +32.</li>
        </ul>
        <p>Round fu up to the next 10, except 25 fu seven pairs. Pinfu ron is exactly 30. A typical closed riichi tsumo with a two-sided wait and a dummy pair is 30 fu (20 + 2 tsumo, rounded).</p>
        <h3>From fu and han to points</h3>
        <p>Basic points = fu × 2<sup>(2 + han)</sup>, then round up to 100. Caps:</p>
        <div class="score-table-wrap"><table class="score-table">
          <thead><tr><th>Han</th><th>Name</th><th>Non-dealer ron</th><th>Dealer ron</th></tr></thead>
          <tbody>
            <tr><td>3–4 (high fu) / 5</td><td>Mangan</td><td>8,000</td><td>12,000</td></tr>
            <tr><td>6–7</td><td>Haneman</td><td>12,000</td><td>18,000</td></tr>
            <tr><td>8–10</td><td>Baiman</td><td>16,000</td><td>24,000</td></tr>
            <tr><td>11–12</td><td>Sanbaiman</td><td>24,000</td><td>36,000</td></tr>
            <tr><td>13+ / yakuman</td><td>Yakuman</td><td>32,000</td><td>48,000</td></tr>
          </tbody>
        </table></div>
        <h3>Below mangan · non-dealer ron</h3>
        <div class="score-table-wrap"><table class="score-table">
          <thead><tr><th>Han \\ fu</th><th>20</th><th>25</th><th>30</th><th>40</th><th>50</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>—</td><td>—</td><td>1,000</td><td>1,300</td><td>1,600</td></tr>
            <tr><td>2</td><td>1,300</td><td>1,600</td><td>2,000</td><td>2,600</td><td>3,200</td></tr>
            <tr><td>3</td><td>2,600</td><td>3,200</td><td>3,900</td><td>5,200</td><td>6,400</td></tr>
            <tr><td>4</td><td>5,200</td><td>6,400</td><td>7,700</td><td>8,000</td><td>8,000</td></tr>
          </tbody>
        </table></div>
        <p>Dealer ron is 1.5× those numbers (1 han 30 fu = 1,500, and so on), already rounded.</p>
        <h3>Tsumo splits</h3>
        <p>On tsumo the total is the same as a ron of that size, split among the other three. Non-dealer tsumo: each non-dealer pays 1× basic, the dealer pays 2×. Dealer tsumo: each of the three others pays 2× basic (equal shares of the dealer ron total).</p>
        <p>Examples at 30 fu 1 han: non-dealer tsumo is 300 from each ko and 500 from the dealer (1,100 written as 300/500). Dealer tsumo is 500 all. At mangan, non-dealer tsumo is 2,000/4,000; dealer tsumo is 4,000 all.</p>
        <h3>Honba and riichi sticks</h3>
        <ul class="guide-list">
          <li>Each honba (repeat counter) adds 300 points to the winner: +100 from each player on tsumo, or +300 from the discarder on ron.</li>
          <li>Each riichi stick is 1,000. All sticks on the table go to the winner. Drawn hands leave them in place.</li>
        </ul>
        <p>If two players ron, each is scored against the discarder in turn. Sticks and honba go to the player closer to the discarder in seating order (the first winner in that resolution).</p>`
    },
    {
      nav: 'The match',
      title: 'Hands, draws, and the end.',
      html: `
        <h3>Seats and rounds</h3>
        <p>The dealer is East for that hand. After a non-dealer win, seats rotate: the next player becomes dealer, and the hand number advances. After East 4, an East-only match is over (unless the end conditions say otherwise). A hanchan then plays South 1–4.</p>
        <p>This parlor does not use extra wind extensions (renchan forever, sudden-death West round, and similar). Choose one hand, East, or East + South at the door.</p>
        <h3>Dealer repeat · renchan</h3>
        <p>If the dealer wins, or the hand is drawn while the dealer is tenpai, the dealer stays. Honba increases. The round name does not advance. A dealer who is noten on a drawn wall does not repeat (the deal still passes, and honba still increases on a draw).</p>
        <h3>Exhaustive draw · 荒牌平局</h3>
        <p>No live tiles left, nobody won. Players in tenpai reveal. Noten players pay tenpai players a total of 3,000: 3,000 / 1,500 / 1,000 depending on how many are tenpai (one tenpai takes 3,000 from the three noten; two split 1,500 each from the two noten; three take 1,000 each from the one noten; four or zero: no payment). Riichi sticks stay. Honba increases.</p>
        <h3>Abortive draws</h3>
        <ul class="guide-list">
          <li><b>Nine terminals</b> — on your first draw, if you have nine or more different terminals and honors, you may declare a draw. Honba increases; no tenpai payment.</li>
          <li><b>Four winds</b> — the first four discards of the hand are all the same wind, and nobody called.</li>
          <li><b>Four riichi</b> — all four players have declared riichi.</li>
          <li><b>Four kans</b> — kans by more than one player reach four. (Four kans by one player can instead be suukantsu.)</li>
          <li><b>Three ron</b> — three players declare ron on the same discard.</li>
        </ul>
        <h3>Ending the match</h3>
        <ul class="guide-list">
          <li>After the scheduled last hand, the match ends. No West round is added.</li>
          <li>If someone reaches 0 or below, the match ends immediately (tobi / bankruptcy).</li>
          <li>On the scheduled last hand, if the dealer is first and repeats, the leading-dealer stop still applies: a first-place dealer can end it instead of playing another repeat, according to the core's オーラス止め rule.</li>
          <li>One-hand matches deal a single hand. A draw can be followed by another deal in that mode so the night is not empty.</li>
        </ul>
        <p>Uma is the end-of-match rank bonus baked into the result's ranking points: +20 / +10 / −10 / −20 from the 30,000 baseline, on top of your raw score. Starting score is 25,000, so everyone is already 5,000 below that baseline until they win it back.</p>`
    },
    {
      nav: 'This parlor',
      title: 'Yoru house rules.',
      html: `
        <p>The engine is Majiang core Japanese rules. Anything not listed here keeps the library default.</p>
        <ul class="guide-list">
          <li>25,000 start. Red five in each suit. Open tanyao. Ippatsu. Ura dora and kan dora. Yakuman and kazoe yakuman. Double ron. Furiten as above.</li>
          <li>Abortive draws and exhaustive draws with noten payments. Dealer repeats on a win or tenpai draw.</li>
          <li>No extra wind extension. East, East + South, or a single hand.</li>
          <li>Bankruptcy ends the match. The scheduled last hand can stop when the first-place dealer would otherwise repeat.</li>
          <li>Tenhou and chiihou (first-draw yakuman) are included.</li>
        </ul>
        <h3>How this table talks to you</h3>
        <p>Legal chi, pon, kan, ron, tsumo, riichi, and nine-terminals always surface as buttons. There is no hidden local rule that forbids a button you can see. Pass is always safe.</p>
        <p>Bots see only their own concealed tiles and what is public: rivers, melds, dora indicators, scores, riichi sticks. They do not look at your hand.</p>
        <h3>Tempo</h3>
        <p>Solo play has no clock and pauses while this guide or settings is open, or when the tab is hidden. Online decisions last 60 seconds: a timeout passes a call or discards a legal tile, and never takes a win for you. Disconnected guests become bots. The host must keep the page open.</p>
        <p class="credits">Rules &amp; AI: <a href="https://github.com/kobalab/majiang-core" target="_blank" rel="noopener">Majiang by Satoshi Kobayashi</a> (MIT). Tile art: <a href="https://github.com/FluffyStuff/riichi-mahjong-tiles" target="_blank" rel="noopener">FluffyStuff</a> (CC0).</p>`
    }
  ];
}

export function mountGuide() {
  const list = pages();
  const title = $('guide-title');
  const body = $('guide-page');
  const select = $('guide-page-select');
  const prev = $('guide-prev');
  const next = $('guide-next');
  let index = 0;
  select.innerHTML = list.map((page, i) => `<option value="${i}">${i + 1} · ${page.nav}</option>`).join('');
  const show = nextIndex => {
    index = Math.max(0, Math.min(list.length - 1, nextIndex));
    const page = list[index];
    title.textContent = page.title;
    body.innerHTML = page.html;
    select.value = String(index);
    prev.disabled = index === 0;
    next.disabled = index === list.length - 1;
    $('guide-page-label').textContent = `${index + 1} / ${list.length}`;
    body.scrollTop = 0;
    $('guide-dialog').scrollTop = 0;
  };
  prev.onclick = () => show(index - 1);
  next.onclick = () => show(index + 1);
  select.onchange = () => show(+select.value);
  $('guide-dialog').addEventListener('keydown', event => {
    if (!$('guide-dialog').open || event.target.closest('select')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
  });
  show(0);
}
