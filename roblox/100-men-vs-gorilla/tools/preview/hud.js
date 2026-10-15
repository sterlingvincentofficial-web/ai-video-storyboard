// The game's HUD (src/client/Modules/Hud.luau) as a DOM overlay for preview stills and videos:
// the same 1280x720 layout, colours and text sizes, scaled to the frame like the HUD's root UIScale.
// GothamBlack/GothamBold are approximated with local Inter Black/Bold.
export const HUD = { mint: '#60f497', rim: '#8bfaaf', ink: '#05140d', notch: '#142016', orange: '#e5ab42', gold: '#ffd640',
  red: '#ff5440', white: '#ffffff' };

for (const [name, face] of [['HudBlack', 'Inter Black'], ['HudBold', 'Inter Bold']]) {
  const f = new FontFace(name, `local('${face}'), local('${face.replace(' ', '-')}'), local('Arial Black')`);
  try { await f.load(); document.fonts.add(f); } catch (e) { /* falls back to sans-serif */ }
}

const BLACK = "font-family:HudBlack,'Arial Black',sans-serif", BOLD = "font-family:HudBold,Arial,sans-serif;font-weight:700";
const textStroke = w => `-webkit-text-stroke:${w * 2}px ${HUD.ink};paint-order:stroke fill`;

function el(parent, css, html = '') {
  const d = document.createElement('div'); d.style.cssText = 'position:absolute;box-sizing:border-box;' + css; d.innerHTML = html;
  parent.appendChild(d); return d;
}
// centred horizontal row, like Hud.luau's row()
const row = (root, top, h, gap = 0) => el(root, `left:0;width:100%;top:${top}px;height:${h}px;display:flex;justify-content:center;align-items:center;gap:${gap}px`);
// a box that grows to fit its text, like chip()
function chip(parent, text, bg, fg, size, h, minW = 0) {
  const d = document.createElement('div');
  d.style.cssText = `position:relative;box-sizing:border-box;height:${h}px;min-width:${minW}px;padding:0 14px;background:${bg};color:${fg};` +
    `font-size:${size}px;line-height:${h}px;text-align:center;white-space:nowrap;${BLACK}`;
  d.textContent = text; parent.appendChild(d); return d;
}
function bar(root, top, w, h, k, colTop, colBottom, segments, label, labelSize = 14) {
  const f = el(root, `left:${640 - w / 2}px;top:${top}px;width:${w}px;height:${h}px;background:${HUD.notch};outline:3px solid ${HUD.ink}`);
  el(f, `left:0;top:0;height:100%;width:${k * 100}%;background:linear-gradient(${colTop},${colBottom})`);
  for (let i = 1; i < segments; i++) el(f, `left:${(i / segments) * w - 1.5}px;top:0;width:3px;height:55%;background:${HUD.notch}`);
  el(f, `left:0;top:-20px;width:${w}px;height:16px;font-size:${labelSize}px;line-height:16px;color:#fff;${labelSize > 14 ? BLACK : BOLD};${textStroke(1.5)}`, label);
  return f;
}

// st: { wave, obj: [label, count], stash: 0..1, boss: {name, k}?, cash, men, cards: [{name, cost, img}], selected,
//       panel: {title, info, up, sell}?, toast: [text, colour]?, marker: {x, y}? (screen px of the tutorial marker) }
export function drawHud(W, H, st) {
  const s = Math.min(Math.max(Math.min(W / 1280, H / 720), 0.55), 1.6);
  const old = document.getElementById('hud'); if (old) old.remove();
  const frame = document.createElement('div'); frame.id = 'hud';
  frame.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none`;
  const root = el(frame, `left:0;top:0;width:${W / s}px;height:${H / s}px;transform:scale(${s});transform-origin:0 0`);
  const VW = W / s, VH = H / s;
  root.style.width = VW + 'px';

  // top: wave, objective, stash, boss
  const wave = chip(row(root, 8, 48), st.wave, HUD.mint, HUD.ink, 34, 48, 210); wave.style.outline = `2px solid ${HUD.rim}`;
  const obj = row(root, 70, 50);
  chip(obj, st.obj[0], HUD.mint, HUD.ink, 30, 50).style.outline = `2px solid ${HUD.rim}`;
  chip(obj, st.obj[1], HUD.ink, HUD.mint, 30, 50, 90);
  const centre = (VW - 1280) / 2;
  const bars = el(root, `left:${centre}px;top:0;width:1280px;height:300px`);
  bar(bars, 146, 300, 24, st.stash, '#85d875', '#21a503', 10, 'BANANA STASH');
  if (st.boss) bar(bars, 200, 460, 26, st.boss.k, '#ff846c', '#ba1812', 20, st.boss.name.toUpperCase(), 18);

  // bottom: cash + men, hotbar
  const cash = row(root, VH - 166, 46, 12);
  const money = document.createElement('div'); money.style.cssText = 'display:flex;height:46px'; cash.appendChild(money);
  const dollar = chip(money, '$', HUD.orange, HUD.ink, 34, 46, 42); dollar.style.padding = '0'; dollar.style.width = '42px';
  chip(money, String(st.cash), HUD.ink, '#fff', 32, 46, 60);
  const men = document.createElement('div'); men.style.cssText = 'display:flex;height:34px'; cash.appendChild(men);
  chip(men, 'MEN', HUD.mint, HUD.ink, 20, 34); chip(men, `${st.men}/100`, HUD.ink, HUD.mint, 20, 34);

  const hot = row(root, VH - 116, 106, 8);
  st.cards.forEach((c, i) => {
    const on = st.selected === i;
    const card = document.createElement('div');
    card.style.cssText = `position:relative;flex:none;width:84px;height:106px;background:${on ? '#96fcba' : HUD.mint};outline:${on ? 4 : 2}px solid ${on ? HUD.gold : HUD.rim}`;
    hot.appendChild(card);
    if (c.img) el(card, 'left:0;top:0;width:84px;height:86px', `<img src="${c.img}" style="width:84px;height:86px;display:block">`);
    else el(card, `left:4px;top:24px;width:76px;height:40px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:15px;color:${HUD.ink};${BLACK}`, c.name.toUpperCase());
    el(card, `left:4px;top:4px;width:22px;height:22px;background:${HUD.ink};color:#fff;font-size:16px;line-height:22px;text-align:center;${BLACK}`, String(i + 1));
    el(card, `left:5px;top:64px;width:76px;height:20px;font-size:19px;line-height:20px;color:${st.cash >= c.cost ? HUD.orange : HUD.red};${BLACK};${textStroke(1.5)}`, `$${c.cost}`);
    el(card, `left:0;top:86px;width:84px;height:20px;background:${HUD.ink};color:#fff;font-size:${c.name.length > 11 ? 10 : 12}px;line-height:20px;text-align:center;white-space:nowrap;${BOLD}`, c.name.toUpperCase());
  });

  if (st.panel) {
    const p = el(root, `left:${VW - 16 - 260}px;top:${VH / 2 - 116}px;width:260px;height:232px;background:rgba(5,20,13,0.92);outline:2px solid ${HUD.mint}`);
    el(p, `left:0;top:-20px;width:260px;height:16px;font-size:14px;line-height:16px;color:#fff;${BOLD};${textStroke(1.5)}`, 'UPGRADES');
    el(p, `left:0;top:0;width:260px;height:40px;background:${HUD.mint};color:${HUD.ink};font-size:22px;line-height:40px;text-align:center;${BLACK}`, st.panel.title);
    el(p, `left:12px;top:50px;width:236px;height:74px;color:#fff;font-size:16px;line-height:19px;${BOLD}`, st.panel.info);
    el(p, `left:12px;top:130px;width:236px;height:42px;background:${HUD.mint};outline:2px solid ${HUD.rim};color:${HUD.ink};font-size:22px;line-height:42px;text-align:center;${BLACK}`, st.panel.up);
    el(p, `left:12px;top:182px;width:236px;height:36px;background:${HUD.orange};color:${HUD.ink};font-size:20px;line-height:36px;text-align:center;${BLACK}`, st.panel.sell);
  }
  if (st.toast) el(root, `left:${VW / 2 - 260}px;top:${VH - 204}px;width:520px;height:26px;text-align:center;font-size:22px;line-height:26px;color:${st.toast[1] || HUD.red};${BOLD};${textStroke(2)}`, st.toast[0]);
  if (st.marker) {
    const m = el(frame, `left:${st.marker.x - st.marker.w / 2}px;top:${st.marker.y}px;width:${st.marker.w}px;height:${st.marker.w * 0.4}px`);
    const h = st.marker.w * 0.2;
    el(m, `left:${st.marker.w / 2 - h * 0.33}px;top:${h - h * 0.33}px;width:${h * 0.66}px;height:${h * 0.66}px;background:${HUD.mint};outline:2px solid ${HUD.rim};transform:rotate(45deg)`);
    el(m, `left:0;top:0;width:100%;height:${h}px;background:${HUD.mint};outline:2px solid ${HUD.rim};color:${HUD.ink};font-size:${Math.min(h * 0.62, st.marker.w * 0.072)}px;line-height:${h}px;text-align:center;white-space:nowrap;${BLACK}`, 'PLACE A BRAWLER HERE');
  }
  document.body.style.position = 'relative'; document.body.appendChild(frame);
  return frame;
}
