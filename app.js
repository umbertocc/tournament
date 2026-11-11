const STORAGE_KEY = "fuoriclasse.tournaments.v1";
const FORMAT_LABELS = {
  round_robin: "Girone all'italiana",
  knockout: "Eliminazione diretta",
  groups_knockout: "Gironi + eliminazione diretta"
};
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let tournaments = loadTournaments();
let activeView = { page: "home", tournamentId: null, tab: "matches" };
let toastTimeout;

function loadTournaments() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) throw new Error("Il formato dei dati salvati non è valido.");
    return stored;
  } catch (error) {
    console.error("Impossibile leggere i tornei salvati:", error);
    window.setTimeout(() => showToast("Non riesco a leggere i tornei salvati in questo browser."), 0);
    return [];
  }
}

function saveTournaments() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
    return true;
  } catch (error) {
    console.error("Impossibile salvare i tornei:", error);
    showToast("Salvataggio non riuscito. Controlla lo spazio disponibile nel browser.");
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function createId() {
  return window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createMatch(team1Id, team2Id, round, group = null) {
  return { id: createId(), team1Id, team2Id, round, group, score1: null, score2: null, status: "pending" };
}

function buildRoundRobin(teamIds, group = null) {
  const participants = [...teamIds];
  if (participants.length % 2 !== 0) participants.push(null);
  const rounds = [];
  const rotation = [...participants];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (first && second) {
        const home = round % 2 === 0 ? first : second;
        const away = round % 2 === 0 ? second : first;
        rounds.push(createMatch(home, away, round + 1, group));
      }
    }
    rotation.splice(1, 0, rotation.pop());
  }
  return rounds;
}

function createKnockoutRounds(teamIds, stage = "knockout", startingRound = 1) {
  const size = 2 ** Math.ceil(Math.log2(teamIds.length));
  const roundsCount = Math.log2(size);
  const matches = [];
  const slots = new Array(size).fill(null);
  teamIds.forEach((teamId, index) => { slots[index] = teamId; });

  for (let round = 1; round <= roundsCount; round += 1) {
    const matchCount = size / (2 ** round);
    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const firstRound = round === 1;
      const match = createMatch(
        firstRound ? slots[matchIndex * 2] : null,
        firstRound ? slots[matchIndex * 2 + 1] : null,
        startingRound + round - 1
      );
      match.stage = stage;
      match.matchIndex = matchIndex;
      if (firstRound && match.team1Id && !match.team2Id) {
        match.status = "complete";
        match.score1 = 1;
        match.score2 = 0;
      } else if (firstRound && !match.team1Id && match.team2Id) {
        match.status = "complete";
        match.score1 = 0;
        match.score2 = 1;
      }
      matches.push(match);
    }
  }
  advanceWinners(matches, stage);
  return matches;
}

function advanceWinners(matches, stage) {
  const stageMatches = matches.filter((match) => (match.stage || "knockout") === stage);
  const roundNumbers = [...new Set(stageMatches.map((match) => match.round))].sort((a, b) => a - b);
  for (const round of roundNumbers) {
    const currentRound = stageMatches.filter((match) => match.round === round);
    const nextRound = stageMatches.filter((match) => match.round === round + 1);
    if (!nextRound.length) continue;
    for (const match of currentRound) {
      if (match.status !== "complete") continue;
      const winner = Number(match.score1) > Number(match.score2) ? match.team1Id : match.team2Id;
      const next = nextRound.find((candidate) => candidate.matchIndex === Math.floor(match.matchIndex / 2));
      if (!next) continue;
      if (match.matchIndex % 2 === 0) next.advancedTeam1Id = winner;
      else next.advancedTeam2Id = winner;
    }
    for (const next of nextRound) {
      const team1Id = next.advancedTeam1Id || null;
      const team2Id = next.advancedTeam2Id || null;
      delete next.advancedTeam1Id;
      delete next.advancedTeam2Id;
      if (next.team1Id !== team1Id || next.team2Id !== team2Id) {
        next.team1Id = team1Id;
        next.team2Id = team2Id;
        next.status = "pending";
        next.score1 = null;
        next.score2 = null;
      }
      if (next.status !== "complete" && Boolean(next.team1Id) !== Boolean(next.team2Id)) {
        next.status = "complete";
        next.score1 = next.team1Id ? 1 : 0;
        next.score2 = next.team2Id ? 1 : 0;
      }
    }
  }
}

function makeTournament(name, format, teamNames) {
  const teams = teamNames.map((teamName) => ({ id: createId(), name: teamName }));
  const tournament = {
    id: createId(),
    name,
    format,
    teams,
    matches: [],
    createdAt: new Date().toISOString(),
    stage: format === "groups_knockout" ? "groups" : format,
    groupsCreated: false
  };

  if (format === "round_robin") {
    tournament.matches = buildRoundRobin(teams.map((team) => team.id));
  } else if (format === "knockout") {
    tournament.matches = createKnockoutRounds(teams.map((team) => team.id));
  } else {
    const groupCount = teams.length >= 10 ? 4 : 2;
    const groups = Array.from({ length: groupCount }, (_, index) => ({
      id: String.fromCharCode(65 + index),
      name: `Girone ${String.fromCharCode(65 + index)}`,
      teamIds: []
    }));
    teams.forEach((team, index) => groups[index % groupCount].teamIds.push(team.id));
    tournament.groups = groups;
    tournament.matches = groups.flatMap((group) => buildRoundRobin(group.teamIds, group.id));
    tournament.groupsCreated = true;
  }
  return tournament;
}

function getTeam(tournament, teamId) {
  return tournament.teams.find((team) => team.id === teamId);
}

function teamName(tournament, teamId) {
  return teamId ? getTeam(tournament, teamId)?.name || "Squadra" : "In attesa";
}

function activeTournament() {
  return tournaments.find((tournament) => tournament.id === activeView.tournamentId);
}

function resultMatches(tournament, stage = tournament.stage) {
  return tournament.matches.filter((match) => {
    if (tournament.format === "knockout") return (match.stage || "knockout") === "knockout";
    if (tournament.format === "groups_knockout") return match.stage === stage || (!match.stage && stage === "groups");
    return true;
  });
}

function standingsFor(tournament, teamIds, matches) {
  const rows = teamIds.map((teamId) => ({
    teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0
  }));
  const byId = new Map(rows.map((row) => [row.teamId, row]));
  for (const match of matches) {
    if (match.status !== "complete" || !byId.has(match.team1Id) || !byId.has(match.team2Id)) continue;
    const one = byId.get(match.team1Id);
    const two = byId.get(match.team2Id);
    const score1 = Number(match.score1);
    const score2 = Number(match.score2);
    one.played += 1;
    two.played += 1;
    one.goalsFor += score1;
    one.goalsAgainst += score2;
    two.goalsFor += score2;
    two.goalsAgainst += score1;
    if (score1 > score2) { one.wins += 1; one.points += 3; two.losses += 1; }
    else if (score2 > score1) { two.wins += 1; two.points += 3; one.losses += 1; }
    else { one.draws += 1; two.draws += 1; one.points += 1; two.points += 1; }
  }
  return rows.sort((a, b) => b.points - a.points
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || b.goalsFor - a.goalsFor
    || teamName(tournament, a.teamId).localeCompare(teamName(tournament, b.teamId), "it"));
}

function renderHome() {
  const totalMatches = tournaments.reduce((sum, tournament) => sum + tournament.matches.length, 0);
  app.innerHTML = `
    <div class="heading-row">
      <div class="heading-copy">
        <div class="eyebrow">Benvenuto nel tuo club</div>
        <h1>La sfida inizia<br>qui.</h1>
        <p class="subheading">Crea il tuo torneo, metti in campo le squadre e lascia a noi il tabellone. Il prossimo campione del biliardino è tutto da decidere.</p>
      </div>
      <div class="badge">${tournaments.length} ${tournaments.length === 1 ? "torneo" : "tornei"} · ${totalMatches} partite</div>
    </div>
    <div class="dashboard-grid">
      <section class="card create-card">
        <div class="card-heading">
          <div><h2>Nuovo torneo</h2><p>Bastano un nome e le squadre per partire.</p></div>
          <span aria-hidden="true">✦</span>
        </div>
        <form id="create-form">
          <div class="form-field">
            <label for="tournament-name">Nome del torneo</label>
            <input id="tournament-name" name="name" maxlength="60" placeholder="Es. Coppa del Giovedì" required>
          </div>
          <div class="form-field">
            <label for="tournament-format">Formato</label>
            <select id="tournament-format" name="format">
              <option value="round_robin">Girone all'italiana</option>
              <option value="knockout">Eliminazione diretta</option>
              <option value="groups_knockout">Gironi + eliminazione diretta</option>
            </select>
          </div>
          <div class="form-field">
            <label for="team-names">Squadre</label>
            <textarea id="team-names" name="teams" placeholder="Una squadra per riga&#10;Es.&#10;I Fulmini&#10;Gli Invincibili&#10;Palla al Centro" required></textarea>
            <p class="form-hint">Inserisci almeno 2 squadre, una per riga. Per il formato a gironi ne servono almeno 4.</p>
          </div>
          <p id="create-error" class="form-error" aria-live="polite"></p>
          <button class="button full-width" type="submit">Crea torneo <span aria-hidden="true">→</span></button>
        </form>
      </section>
      <section class="card">
        <div class="card-heading">
          <div><h2>I tuoi tornei</h2><p>Riprendi da dove avevi lasciato.</p></div>
        </div>
        ${tournaments.length ? `<div class="tournament-list">${[...tournaments].reverse().map((tournament) => `
          <button class="tournament-item" type="button" data-open="${escapeHtml(tournament.id)}">
            <span class="tournament-icon" aria-hidden="true">⚽</span>
            <span class="tournament-info"><strong>${escapeHtml(tournament.name)}</strong><span>${FORMAT_LABELS[tournament.format]} · ${tournament.teams.length} squadre · ${new Date(tournament.createdAt).toLocaleDateString("it-IT")}</span></span>
            <span class="item-arrow" aria-hidden="true">›</span>
          </button>`).join("")}</div>` : `<div class="empty-list"><div class="empty-icon" aria-hidden="true">⚽</div>Non c'è ancora nessun torneo.<br>Il primo fischio d'inizio aspetta te.</div>`}
      </section>
    </div>`;

  app.querySelector("#create-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const teamNames = String(formData.get("teams") || "").split(/\r?\n/).map((team) => team.trim()).filter(Boolean);
    const uniqueNames = new Set(teamNames.map((team) => team.toLocaleLowerCase("it-IT")));
    const format = String(formData.get("format"));
    let error = "";
    if (!name) error = "Dai un nome al torneo.";
    else if (teamNames.length < 2) error = "Inserisci almeno 2 squadre.";
    else if (uniqueNames.size !== teamNames.length) error = "Ci sono nomi di squadra duplicati.";
    else if (format === "groups_knockout" && teamNames.length < 4) error = "Per il formato a gironi servono almeno 4 squadre.";
    if (error) {
      app.querySelector("#create-error").textContent = error;
      return;
    }
    const tournament = makeTournament(name, format, teamNames);
    tournaments.push(tournament);
    if (saveTournaments()) openTournament(tournament.id);
    else {
      tournaments.pop();
      renderHome();
    }
  });

  app.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openTournament(button.dataset.open));
  });
}

function matchCard(tournament, match, showGroup) {
  const oneName = escapeHtml(teamName(tournament, match.team1Id));
  const twoName = escapeHtml(teamName(tournament, match.team2Id));
  const playable = Boolean(match.team1Id && match.team2Id && match.status !== "complete" || match.team1Id && match.team2Id && match.status === "complete");
  const wonByBye = match.status === "complete" && (!match.team1Id || !match.team2Id);
  const details = [
    showGroup && match.group ? `Girone ${match.group}` : null,
    match.matchIndex === undefined ? `Turno ${match.round}` : `Partita ${match.matchIndex + 1}`
  ]
    .filter(Boolean).join(" · ");
  return `<div class="match-card" data-match="${escapeHtml(match.id)}">
    <div class="match-side"><span class="match-team">${oneName}</span><span class="match-meta">${details}</span></div>
    <div class="match-score">
      <label class="sr-only" for="score-${escapeHtml(match.id)}-1">Gol ${oneName}</label>
      <input class="score-input" type="number" min="0" max="99" inputmode="numeric" id="score-${escapeHtml(match.id)}-1" data-score="1" value="${match.score1 ?? ""}" ${playable ? "" : "disabled"}>
      <span class="score-divider">–</span>
      <label class="sr-only" for="score-${escapeHtml(match.id)}-2">Gol ${twoName}</label>
      <input class="score-input" type="number" min="0" max="99" inputmode="numeric" id="score-${escapeHtml(match.id)}-2" data-score="2" value="${match.score2 ?? ""}" ${playable ? "" : "disabled"}>
    </div>
    <div class="match-side right"><span class="match-team right">${twoName}</span><span class="match-status ${match.status === "complete" ? "complete" : ""}">${wonByBye ? "Passa il turno" : match.status === "complete" ? "Risultato salvato" : playable ? "Da giocare" : "In attesa della partita precedente"}</span></div>
  </div>`;
}

function standingsTable(tournament, rows) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Pos.</th><th>Squadra</th><th>PG</th><th>V</th><th>N</th><th>P</th><th>DR</th><th>Pt</th></tr></thead>
    <tbody>${rows.map((row, index) => `<tr>
      <td><span class="rank">${index + 1}</span></td>
      <td class="team-cell">${escapeHtml(teamName(tournament, row.teamId))}</td>
      <td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td>
      <td>${row.goalsFor - row.goalsAgainst > 0 ? "+" : ""}${row.goalsFor - row.goalsAgainst}</td><td class="points">${row.points}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function roundName(round, total) {
  if (total === 1) return "Finale";
  if (round === total) return "Finale";
  if (round === total - 1) return "Semifinali";
  if (round === total - 2) return "Quarti di finale";
  return `Turno ${round}`;
}

function renderMatches(tournament) {
  if (tournament.format === "knockout") {
    const rounds = [...new Set(tournament.matches.filter((match) => (match.stage || "knockout") === "knockout").map((match) => match.round))].sort((a, b) => a - b);
    const total = rounds.length;
    return rounds.map((round, index) => {
      const matches = tournament.matches.filter((match) => (match.stage || "knockout") === "knockout" && match.round === round);
      return `<div class="round-label">${roundName(index + 1, total)}</div><div class="match-list">${matches.map((match) => matchCard(tournament, match, false)).join("")}</div>`;
    }).join("");
  }
  if (tournament.format === "groups_knockout") {
    if (tournament.stage === "groups") {
      return tournament.groups.map((group) => {
        const matches = tournament.matches.filter((match) => match.group === group.id && !match.stage);
        return `<div class="round-label">${escapeHtml(group.name)}</div><div class="match-list">${matches.map((match) => matchCard(tournament, match, true)).join("")}</div>`;
      }).join("") + `<div class="section-title"><h2>Passaggio alla fase finale</h2></div><p class="stage-note">Quando tutte le partite dei gironi avranno un risultato, le prime due squadre di ogni girone si qualificheranno automaticamente per l'eliminazione diretta.</p>`;
    }
    const rounds = [...new Set(tournament.matches.filter((match) => match.stage === "finals").map((match) => match.round))].sort((a, b) => a - b);
    return rounds.map((round, index) => {
      const matches = tournament.matches.filter((match) => match.stage === "finals" && match.round === round);
      return `<div class="round-label">${roundName(index + 1, rounds.length)}</div><div class="match-list">${matches.map((match) => matchCard(tournament, match, false)).join("")}</div>`;
    }).join("");
  }
  return `<div class="match-list">${tournament.matches.map((match) => matchCard(tournament, match, false)).join("")}</div>`;
}

function renderStandings(tournament) {
  if (tournament.format === "groups_knockout") {
    const groupsHtml = tournament.groups.map((group) => {
      const matches = tournament.matches.filter((match) => match.group === group.id && !match.stage);
      return `<div class="group-heading">${escapeHtml(group.name)}</div>${standingsTable(tournament, standingsFor(tournament, group.teamIds, matches))}`;
    }).join("");
    const note = tournament.stage === "groups"
      ? `<p class="form-hint">Le prime due squadre di ogni girone accedono alla fase finale.</p>`
      : `<div class="group-heading">Fase finale</div>${standingsTable(tournament, standingsFor(tournament, tournament.teams.map((team) => team.id), tournament.matches.filter((match) => match.stage === "finals")))}`;
    return groupsHtml + note;
  }
  const matchSet = tournament.format === "knockout" ? tournament.matches.filter((match) => (match.stage || "knockout") === "knockout") : tournament.matches;
  return standingsTable(tournament, standingsFor(tournament, tournament.teams.map((team) => team.id), matchSet));
}

function renderTournament(tournament) {
  const matches = tournament.matches.filter((match) => tournament.format === "groups_knockout" ? match.stage === "finals" || (!match.stage && tournament.stage === "groups") : true);
  const completed = matches.filter((match) => match.status === "complete").length;
  const isComplete = tournament.format === "groups_knockout" ? tournament.stage === "finals" && tournament.matches.filter((match) => match.stage === "finals").every((match) => match.status === "complete") : matches.every((match) => match.status === "complete");
  app.innerHTML = `
    <div class="detail-top"><a class="back-link" href="#" id="back-home">← Tutti i tornei</a></div>
    <div class="detail-header">
      <div><div class="eyebrow">Il tuo campo da gioco</div><h1>${escapeHtml(tournament.name)}</h1>
        <div class="meta-line"><span class="badge">${FORMAT_LABELS[tournament.format]}</span><span class="meta-separator">·</span><span>${tournament.teams.length} squadre</span><span class="meta-separator">·</span><span>Creato il ${new Date(tournament.createdAt).toLocaleDateString("it-IT")}</span></div>
      </div>
      <button class="danger-link" type="button" id="delete-tournament">Elimina torneo</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-label">Squadre in campo</span><span class="stat-value">${tournament.teams.length}</span></div>
      <div class="stat-card"><span class="stat-label">Partite completate</span><span class="stat-value">${completed}<small> / ${matches.length}</small></span></div>
      <div class="stat-card"><span class="stat-label">Stato</span><span class="stat-value">${isComplete ? "Finito!" : "In corso"}</span></div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist" aria-label="Dettagli del torneo">
        <button class="tab-button" role="tab" id="tab-matches" aria-selected="${activeView.tab === "matches"}" aria-controls="panel-matches" type="button">Partite</button>
        <button class="tab-button" role="tab" id="tab-standings" aria-selected="${activeView.tab === "standings"}" aria-controls="panel-standings" type="button">Classifica</button>
        <button class="tab-button" role="tab" id="tab-teams" aria-selected="${activeView.tab === "teams"}" aria-controls="panel-teams" type="button">Squadre</button>
      </div>
      ${activeView.tab === "matches" ? `<div class="tab-panel" id="panel-matches" role="tabpanel" aria-labelledby="tab-matches">
        <div class="section-title"><h2>Calendario e risultati</h2><span class="form-hint">Inserisci i gol e salva con Invio</span></div>
        ${renderMatches(tournament)}
      </div>` : activeView.tab === "standings" ? `<div class="tab-panel" id="panel-standings" role="tabpanel" aria-labelledby="tab-standings">
        <div class="section-title"><h2>Classifica</h2><span class="form-hint">Ordinata per punti, differenza reti e gol fatti</span></div>${renderStandings(tournament)}
      </div>` : `<div class="tab-panel" id="panel-teams" role="tabpanel" aria-labelledby="tab-teams">
        <div class="section-title"><h2>Squadre partecipanti</h2><span class="form-hint">${tournament.teams.length} partecipanti</span></div>
        <div class="tournament-list">${tournament.teams.map((team, index) => `<div class="tournament-item"><span class="tournament-icon" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span class="tournament-info"><strong>${escapeHtml(team.name)}</strong><span>Squadra partecipante</span></span></div>`).join("")}</div>
      </div>`}
    </section>`;

  app.querySelector("#back-home").addEventListener("click", (event) => {
    event.preventDefault();
    activeView = { page: "home", tournamentId: null, tab: "matches" };
    render();
  });
  app.querySelector("#delete-tournament").addEventListener("click", () => {
    if (!window.confirm(`Eliminare "${tournament.name}" e tutti i suoi risultati?`)) return;
    const previousTournaments = tournaments;
    tournaments = tournaments.filter((entry) => entry.id !== tournament.id);
    if (saveTournaments()) {
      activeView = { page: "home", tournamentId: null, tab: "matches" };
      render();
      showToast("Torneo eliminato.");
    } else {
      tournaments = previousTournaments;
      render();
    }
  });
  for (const tab of ["matches", "standings", "teams"]) {
    app.querySelector(`#tab-${tab}`).addEventListener("click", () => {
      activeView.tab = tab;
      render();
    });
  }
  app.querySelectorAll(".match-card").forEach((card) => {
    card.querySelectorAll(".score-input").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveScore(tournament, card);
        }
      });
      input.addEventListener("change", () => saveScore(tournament, card));
    });
  });
}

function saveScore(tournament, card) {
  const match = tournament.matches.find((entry) => entry.id === card.dataset.match);
  if (!match || !match.team1Id || !match.team2Id) return;
  const previousMatches = tournament.matches.map((entry) => ({ ...entry }));
  const previousStage = tournament.stage;
  const firstInput = card.querySelector('[data-score="1"]');
  const secondInput = card.querySelector('[data-score="2"]');
  if (firstInput.value === "" && secondInput.value === "") {
    if (match.status === "complete") {
      match.status = "pending";
      match.score1 = null;
      match.score2 = null;
      if (tournament.format === "knockout" || match.stage === "finals") advanceWinners(tournament.matches, match.stage || "knockout");
      if (saveTournaments()) render();
      else {
        tournament.matches = previousMatches;
        tournament.stage = previousStage;
        render();
      }
    }
    return;
  }
  if (firstInput.value === "" || secondInput.value === "") {
    return;
  }
  const score1 = Number(firstInput.value);
  const score2 = Number(secondInput.value);
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > 99 || score2 > 99) {
    showToast("Inserisci gol interi compresi tra 0 e 99.");
    render();
    return;
  }
  if ((tournament.format === "knockout" || match.stage === "finals") && score1 === score2) {
    showToast("In eliminazione diretta non può esserci un pareggio.");
    render();
    return;
  }
  match.score1 = score1;
  match.score2 = score2;
  match.status = "complete";
  if (tournament.format === "knockout" || match.stage === "finals") advanceWinners(tournament.matches, match.stage || "knockout");
  if (tournament.format === "groups_knockout" && tournament.stage === "groups") {
    const groupMatches = tournament.matches.filter((entry) => entry.group && !entry.stage);
    if (groupMatches.every((entry) => entry.status === "complete")) {
      const qualifiers = tournament.groups.flatMap((group) => standingsFor(
        tournament,
        group.teamIds,
        groupMatches.filter((entry) => entry.group === group.id)
      ).slice(0, 2).map((row) => row.teamId));
      const finals = createKnockoutRounds(qualifiers, "finals", 1);
      tournament.matches.push(...finals);
      tournament.stage = "finals";
      if (!saveTournaments()) {
        tournament.matches = previousMatches;
        tournament.stage = previousStage;
        render();
        return;
      }
      render();
      showToast("Gironi completati! La fase finale è pronta.");
      return;
    }
  }
  if (saveTournaments()) render();
  else {
    tournament.matches = previousMatches;
    tournament.stage = previousStage;
    render();
  }
}

function openTournament(id) {
  activeView = { page: "tournament", tournamentId: id, tab: "matches" };
  render();
}

function render() {
  const tournament = activeView.page === "tournament" ? activeTournament() : null;
  if (tournament) renderTournament(tournament);
  else {
    activeView = { page: "home", tournamentId: null, tab: "matches" };
    renderHome();
  }
}

render();
