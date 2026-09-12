export const winds = ['East', 'South', 'West', 'North'];
export const windKanji = ['東', '南', '西', '北'];
const honors = ['East wind', 'South wind', 'West wind', 'North wind', 'White dragon', 'Green dragon', 'Red dragon'];
export const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function tileName(p) {
  if (!p || p === '_') return 'Concealed tile';
  return p[0] === 'z' ? honors[Number(p[1]) - 1] : `${p[1] === '0' ? 'Red 5' : p[1]} ${ {m: 'characters', p: 'circles', s: 'bamboo'}[p[0]] }`;
}
export function tileLabel(p) {
  if (p[0] === 'z') return ['E', 'S', 'W', 'N', '白', '發', '中'][+p[1] - 1];
  return `${+p[1] || 5}${p[0]}`;
}
export function tile(p, classes = '', attributes = '', button = false) {
  const tag = button ? 'button' : 'span';
  if (!p || p === '_') return `<span class="tile back ${classes}" aria-label="Concealed tile"><i>雀</i></span>`;
  const code = /^[mpsz][0-9]$/.test(p.slice(0, 2)) ? p.slice(0, 2) : 'z5';
  return `<${tag} ${button ? 'type="button"' : 'role="img"'} class="tile ${code[1] === '0' ? 'red' : ''} ${classes}" aria-label="${tileName(code)}" ${attributes}><svg viewBox="0 0 300 400" aria-hidden="true"><use href="./assets/tiles.svg#${code}"/></svg><small>${tileLabel(code)}</small></${tag}>`;
}
export function meldTiles(meld) {
  const suit = meld[0], digits = [...meld.slice(1)].filter(c => /\d/.test(c));
  const concealedKan = digits.length === 4 && !/[+=-]/.test(meld);
  return `<span class="meld">${digits.map((n, i) => tile(concealedKan && (i === 0 || i === 3) ? '_' : suit + n, 'mini')).join('')}</span>`;
}
export function stringTiles(hand) {
  return (hand.split(',')[0].match(/[mpsz]\d+/g) || []).flatMap(group => [...group.slice(1)].map(n => group[0] + n));
}
export const yakuNames = {
  '門前清自摸和': 'Menzen tsumo', '立直': 'Riichi', '一発': 'Ippatsu', '断幺九': 'Tanyao · all simples',
  '平和': 'Pinfu', '一盃口': 'Iipeikou', '二盃口': 'Ryanpeikou', '七対子': 'Chiitoitsu · seven pairs',
  '対々和': 'Toitoi · all triplets', '三暗刻': 'Sanankou', '三色同順': 'Sanshoku doujun',
  '三色同刻': 'Sanshoku doukou', '一気通貫': 'Ittsuu', '混全帯幺九': 'Chanta', '純全帯幺九': 'Junchan',
  '混一色': 'Honitsu · half flush', '清一色': 'Chinitsu · full flush', '混老頭': 'Honroutou',
  '小三元': 'Shousangen', '三槓子': 'Sankantsu', '槍槓': 'Chankan · robbing a kan',
  '嶺上開花': 'Rinshan kaihou', '海底摸月': 'Haitei · last draw', '河底撈魚': 'Houtei · last discard',
  'ダブル立直': 'Double riichi', '翻牌 白': 'Yakuhai · white dragon', '翻牌 發': 'Yakuhai · green dragon',
  '翻牌 中': 'Yakuhai · red dragon', '場風 東': 'Round wind · East', '場風 南': 'Round wind · South',
  '自風 東': 'Seat wind · East', '自風 南': 'Seat wind · South', '自風 西': 'Seat wind · West', '自風 北': 'Seat wind · North',
  'ドラ': 'Dora', '裏ドラ': 'Ura dora', '赤ドラ': 'Red dora', '国士無双': 'Kokushi musou',
  '国士無双十三面': 'Kokushi · thirteen-sided wait', '四暗刻': 'Suuankou', '四暗刻単騎': 'Suuankou tanki',
  '大三元': 'Daisangen', '字一色': 'Tsuuiisou', '小四喜': 'Shousuushii', '大四喜': 'Daisuushii',
  '緑一色': 'Ryuuiisou', '清老頭': 'Chinroutou', '九蓮宝燈': 'Chuuren poutou',
  '純正九蓮宝燈': 'Pure chuuren poutou', '四槓子': 'Suukantsu', '天和': 'Tenhou', '地和': 'Chiihou'
};
