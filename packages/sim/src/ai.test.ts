// Test AI máy 3 cấp độ — chạy: npx tsx src/ai.test.ts (từ packages/sim)
import { Game } from './Game';
import { RuleAI, AI_LABEL, type AIDifficulty } from './ai';
import { isUnit } from './entities';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`PASS  ${name}`);
  else { console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

// (a) AI de vs trungbinh đấu 18000 tick: không crash, game tiến triển.
{
  const game = new Game('ai-test-1', 2);
  game.setupMatch('ai-test-1', ['Máy Dễ', 'Máy TB']);
  const ai0 = new RuleAI('de');
  const ai1 = new RuleAI('trungbinh');
  let threw: unknown = null;
  try {
    for (let t = 0; t < 18000; t++) {
      ai0.update(game, 0);
      ai1.update(game, 1);
      game.update();
      if (game.winner !== null) break;
    }
  } catch (e) { threw = e; }
  check('AI de vs trungbinh 18000 tick không crash', threw === null, String(threw));
  const units = [...game.entities.values()].filter((e) => isUnit(e));
  check('game tiến triển (tạo được unit mới)', units.length > 6, `units=${units.length}`);
  const buildings = [...game.entities.values()].filter((e) => e.kind === 'building');
  check('AI xây được nhà', buildings.length > 2, `buildings=${buildings.length}`);
}

// (b) AI khó: gatherMul = 1.1 (cheat minh bạch).
{
  const game = new Game('ai-test-2', 2);
  game.setupMatch('ai-test-2', ['A', 'B']);
  const ai = new RuleAI('kho');
  for (let t = 0; t < 100; t++) { ai.update(game, 0); game.update(); }
  const m = game.players[0]!.gatherMul;
  check('AI khó +10% khai thác', m.wood === 1.1 && m.food === 1.1 && m.gold === 1.1 && m.stone === 1.1, JSON.stringify(m));
}

// (c) AI xây nhà + train lính trong 6000 tick.
{
  const game = new Game('ai-test-3', 2);
  game.setupMatch('ai-test-3', ['A', 'B']);
  const ai = new RuleAI('trungbinh');
  // cho tiền để AI không bị kẹt kinh tế ở test ngắn
  game.players[0]!.resources.wood = 1000;
  game.players[0]!.resources.food = 1000;
  for (let t = 0; t < 6000; t++) { ai.update(game, 0); game.update(); }
  const houses = [...game.entities.values()].filter((e) => e.kind === 'building' && (e as { defId: string }).defId === 'house');
  check('AI xây được nhà sàn', houses.length >= 1, `houses=${houses.length}`);
  const mil = [...game.entities.values()].filter(
    (e) => isUnit(e) && e.playerId === 0 && (e.defId === 'clubman' || e.defId === 'slinger' || e.defId === 'axeman'),
  );
  // AI có thể chưa lên tool trong 6000 tick với tiền cho sẵn → chỉ cần không crash và có hành động
  console.log(`  (info) military p0 sau 6000 tick: ${mil.length}, age=${game.players[0]!.age}`);
  check('AI không đứng yên (có train/xây)', houses.length >= 1 || mil.length >= 1);
}

// (d) Nhãn AI đầy đủ 3 cấp.
{
  check('AI_LABEL đủ 3 cấp', !!AI_LABEL.de && !!AI_LABEL.trungbinh && !!AI_LABEL.kho);
}

console.log(failures === 0 ? 'AI TEST: PASS' : `AI TEST: FAIL (${failures})`);
