/**
 * Sanidade das regras de permissão por item (src/lib/sheets/permissions.ts).
 *   node scripts/test-permissions.mjs
 */
import assert from "node:assert/strict";
import { parseIdList, buildIdList, canRead, canWrite, ensureInEditList } from "../src/lib/sheets/permissions.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("parseIdList quebra por ; tolerando espaço e célula vazia", () => {
  assert.deepEqual(parseIdList("12;7; 33"), ["12", "7", "33"]);
  assert.deepEqual(parseIdList(""), []);
  assert.deepEqual(parseIdList(undefined), []);
  assert.deepEqual(parseIdList(" ; ; "), []);
});

check("buildIdList remove duplicata e entrada vazia", () => {
  assert.equal(buildIdList(["7", "12", "7", " ", "12"]), "7;12");
  assert.equal(buildIdList([]), "");
});

check("canRead: dono sempre lê", () => {
  assert.equal(canRead({ id: "1", user_owner: "7" }, "7"), true);
});

check("canRead: user_access dá leitura", () => {
  assert.equal(canRead({ id: "1", user_owner: "7", user_access: "12;33" }, "12"), true);
  assert.equal(canRead({ id: "1", user_owner: "7", user_access: "12;33" }, "99"), false);
});

check("canRead: user_edit também dá leitura (quem edita também vê)", () => {
  assert.equal(canRead({ id: "1", user_owner: "7", user_edit: "12" }, "12"), true);
});

check("canWrite: dono e user_edit escrevem, user_access nunca", () => {
  assert.equal(canWrite({ id: "1", user_owner: "7" }, "7"), true);
  assert.equal(canWrite({ id: "1", user_owner: "7", user_edit: "12" }, "12"), true);
  assert.equal(canWrite({ id: "1", user_owner: "7", user_access: "12" }, "12"), false);
});

check("ensureInEditList soma o criador sem duplicar e sem mexer se já é dono", () => {
  assert.equal(ensureInEditList({ user_owner: "7", user_edit: "" }, "7"), "");
  assert.equal(ensureInEditList({ user_owner: "7", user_edit: "" }, "12"), "12");
  assert.equal(ensureInEditList({ user_owner: "7", user_edit: "12" }, "12"), "12");
  assert.equal(ensureInEditList({ user_owner: "7", user_edit: "12" }, "33"), "12;33");
});

console.log(`\n${passed} testes passaram.`);
