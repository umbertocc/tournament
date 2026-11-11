# Fuoriclasse

Web app in italiano per organizzare tornei di calcio balilla. Non richiede installazione o server: apri `index.html` in un browser moderno.

## Funzionalità

- Creazione e salvataggio locale di più tornei.
- Formati: girone all'italiana, eliminazione diretta, gironi con fase finale.
- Nel formato con fase finale si scelgono il numero di gironi e le squadre qualificate per girone. Servono almeno 2 gironi, almeno 2 squadre per girone e almeno tante squadre quante sono le qualificate previste in ogni girone. Le squadre vengono distribuite in ordine di inserimento, in modo equilibrato.
- Per completare un tabellone da 2, 4, 8, 16 squadre e così via, si ripescano le migliori squadre nella posizione immediatamente successiva alle qualificate dirette. Si confrontano i punti totali e poi la differenza reti totale, anche se i gironi hanno dimensioni diverse. Se non ci sono abbastanza squadre da ripescare, occorre modificare la configurazione.
- In caso di parità decisiva per il ripescaggio, le squadre interessate giocano uno spareggio, o un girone di spareggio se sono più di due. Non sono ammessi pareggi nelle partite di spareggio. La classifica dello spareggio usa punti e differenza reti; se rimane una parità decisiva, le squadre ancora in parità giocano un nuovo spareggio.
- Generazione automatica di calendario e tabellone; nelle eliminazioni dirette le squadre avanzano al turno successivo.
- Inserimento dei risultati e classifica aggiornata (3 punti per la vittoria, 1 per il pareggio).
- Dati conservati nel `localStorage` del browser.

I tornei restano sul dispositivo e sul browser in cui sono stati creati; non è prevista la sincronizzazione tra dispositivi.

Per i tornei a gironi creati prima di questa modifica restano valide le regole originali. Nel formato a eliminazione diretta senza gironi, se le squadre non sono 2, 4, 8, 16 e così via, alcune passano automaticamente il primo turno.
