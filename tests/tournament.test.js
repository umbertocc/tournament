const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadApp() {
  let nextId = 0;
  const element = {
    addEventListener() {},
    querySelectorAll() { return []; }
  };
  const app = {
    innerHTML: "",
    querySelector() { return element; },
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({
    document: { querySelector(selector) { return selector === "#app" ? app : element; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    window: { crypto: { randomUUID() { return String(++nextId); } }, setTimeout() {}, clearTimeout() {} },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(source, context);
  return vm.runInContext("({ makeTournament, createKnockoutRounds, advanceWinners, groupLabel })", context);
}

test("distribuisce le squadre nei gironi scelti e genera le partite", () => {
  const { makeTournament, groupLabel } = loadApp();
  const tournament = makeTournament("Coppa", "groups_knockout",
    ["A", "B", "C", "D", "E", "F", "G", "H"], 3);
  assert.deepEqual(Array.from(tournament.groups, (group) => group.teamIds.length), [3, 3, 2]);
  assert.deepEqual(Array.from(tournament.groups, (group) => group.name), ["Girone A", "Girone B", "Girone C"]);
  assert.equal(tournament.matches.length, 7);
  assert.equal(groupLabel(25), "Z");
  assert.equal(groupLabel(26), "AA");
});

test("sei qualificate avanzano attraverso i riposi senza saltare partite non giocate", () => {
  const { createKnockoutRounds, advanceWinners } = loadApp();
  const matches = createKnockoutRounds(["A", "B", "C", "D", "E", "F"], "finals");
  const round = (number) => matches.filter((match) => match.round === number);
  assert.equal(round(1).length, 4);
  assert.equal(round(1).filter((match) => match.status === "complete").length, 2);
  assert.equal(round(2).filter((match) => match.status === "complete").length, 0);
  assert.equal(round(3)[0].status, "pending");
  assert.equal(round(3)[0].team1Id, null);
  assert.equal(round(3)[0].team2Id, null);

  for (const match of round(1).filter((entry) => entry.team1Id && entry.team2Id)) {
    match.score1 = 2;
    match.score2 = 1;
    match.status = "complete";
    advanceWinners(matches, "finals");
  }
  assert.equal(round(2).filter((match) => match.team1Id && match.team2Id).length, 2);
  for (const match of round(2)) {
    match.score1 = 2;
    match.score2 = 1;
    match.status = "complete";
    advanceWinners(matches, "finals");
  }
  assert.ok(round(3)[0].team1Id && round(3)[0].team2Id);
  assert.equal(round(3)[0].status, "pending");

  const semifinal = round(2)[0];
  semifinal.score1 = 0;
  semifinal.score2 = 1;
  advanceWinners(matches, "finals");
  assert.equal(round(3)[0].team1Id, semifinal.team2Id);
  assert.equal(round(3)[0].status, "pending");
});

test("i tabelloni salvati con uno slot vuoto attendono i risultati mancanti", () => {
  const { createKnockoutRounds, advanceWinners } = loadApp();
  const matches = createKnockoutRounds(["A", "B", "C", "D"], "knockout");
  const first = matches[0];
  first.score1 = 2;
  first.score2 = 1;
  first.status = "complete";
  const final = matches.find((match) => match.round === 2);
  final.team1Id = "A";
  final.status = "complete";
  final.score1 = 1;
  final.score2 = 0;
  advanceWinners(matches, "knockout");
  assert.equal(final.team1Id, "A");
  assert.equal(final.team2Id, null);
  assert.equal(final.status, "pending");
  assert.equal(final.score1, null);
});
