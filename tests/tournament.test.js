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
  return vm.runInContext("({ makeTournament, createKnockoutRounds, advanceWinners, groupLabel, qualificationPlan, finishGroupStage, finishPlayoff, selectRequalified })", context);
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

test("valida i posti diretti e quelli disponibili per il ripescaggio", () => {
  const { qualificationPlan } = loadApp();
  assert.equal(qualificationPlan(9, 3, 2).total, 8);
  assert.equal(qualificationPlan(9, 3, 2).extra, 2);
  assert.ok(qualificationPlan(6, 3, 2).error.includes("solo 0"));
  assert.ok(qualificationPlan(12, 3, 3).error.includes("solo 3"));
  assert.ok(qualificationPlan(8, 3, 3).error.includes("Ogni girone"));
  assert.ok(qualificationPlan(12, 4, 3).error);
  assert.equal(qualificationPlan(8, 2, 3).total, 8);
  assert.equal(qualificationPlan(8, 2, 3).extra, 2);
});

test("il ripescaggio confronta punti e differenza reti totali", () => {
  const { makeTournament, selectRequalified } = loadApp();
  const tournament = makeTournament("Coppa", "groups_knockout",
    ["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, 2);
  const ids = tournament.teams.map((team) => team.id);
  const rows = [
    { teamId: ids[6], points: 2, goalsFor: 4, goalsAgainst: 5 },
    { teamId: ids[7], points: 1, goalsFor: 9, goalsAgainst: 2 },
    { teamId: ids[8], points: 2, goalsFor: 1, goalsAgainst: 1 }
  ];
  selectRequalified(tournament, ids.slice(0, 6), rows, 2);
  const firstRound = tournament.matches.filter((match) => match.stage === "finals" && match.round === 1);
  const finalists = firstRound.flatMap((match) => [match.team1Id, match.team2Id]);
  assert.equal(tournament.stage, "finals");
  assert.equal(firstRound.length, 4);
  assert.ok(finalists.includes(ids[6]));
  assert.ok(finalists.includes(ids[8]));
  assert.ok(!finalists.includes(ids[7]));
  assert.ok(firstRound.every((match) => match.team1Id && match.team2Id && match.status === "pending"));
});

test("la parità decisiva avvia e ripete lo spareggio fino a scegliere le ripescate", () => {
  const { makeTournament, finishGroupStage, finishPlayoff } = loadApp();
  const tournament = makeTournament("Coppa", "groups_knockout",
    ["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, 2);
  for (const match of tournament.matches) {
    match.score1 = 1;
    match.score2 = 0;
    match.status = "complete";
  }
  finishGroupStage(tournament);
  assert.equal(tournament.stage, "playoff");
  assert.equal(tournament.qualificationPlayoff.candidates.length, 3);
  assert.equal(tournament.qualificationPlayoff.spots, 2);
  let matches = tournament.matches.filter((match) => match.stage === "playoff" && match.playoffRound === 1);
  assert.equal(matches.length, 3);

  const candidates = tournament.qualificationPlayoff.candidates;
  for (const match of matches) {
    const first = candidates.indexOf(match.team1Id);
    const second = candidates.indexOf(match.team2Id);
    const firstWins = (first + 1) % 3 === second;
    match.score1 = firstWins ? 1 : 0;
    match.score2 = firstWins ? 0 : 1;
    match.status = "complete";
  }
  finishPlayoff(tournament);
  assert.equal(tournament.stage, "playoff");
  assert.equal(tournament.qualificationPlayoff.round, 2);
  matches = tournament.matches.filter((match) => match.stage === "playoff" && match.playoffRound === 2);
  for (const match of matches) {
    const firstWins = candidates.indexOf(match.team1Id) < candidates.indexOf(match.team2Id);
    match.score1 = firstWins ? 2 : 0;
    match.score2 = firstWins ? 0 : 2;
    match.status = "complete";
  }
  finishPlayoff(tournament);
  const finals = tournament.matches.filter((match) => match.stage === "finals" && match.round === 1);
  assert.equal(tournament.stage, "finals");
  assert.equal(finals.length, 4);
  assert.ok(finals.every((match) => match.team1Id && match.team2Id));
  assert.equal(tournament.qualificationPlayoff, undefined);
});

test("i tornei esistenti conservano la regola precedente", () => {
  const { makeTournament, finishGroupStage } = loadApp();
  const tournament = makeTournament("Storico", "groups_knockout",
    ["A", "B", "C", "D", "E", "F"], 3);
  delete tournament.qualifiersPerGroup;
  for (const match of tournament.matches) {
    match.score1 = 1;
    match.score2 = 0;
    match.status = "complete";
  }
  finishGroupStage(tournament);
  assert.equal(tournament.stage, "finals");
  assert.equal(tournament.matches.filter((match) => match.stage === "finals" && match.round === 1 && match.status === "complete").length, 2);
});
