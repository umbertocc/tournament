# Fuoriclasse

Web app in italiano per organizzare tornei di calcio balilla. Non richiede installazione o server: apri `index.html` in un browser moderno.

## Funzionalità

- Creazione e salvataggio locale di più tornei.
- Formati: girone all'italiana, eliminazione diretta, gironi con fase finale.
- Nel formato con fase finale, il numero di gironi è selezionabile: servono almeno 2 gironi e 2 squadre per girone. Le squadre vengono distribuite in ordine di inserimento, in modo equilibrato, e le prime 2 di ogni girone accedono alla fase finale.
- Generazione automatica di calendario e tabellone; nelle eliminazioni dirette le squadre avanzano al turno successivo.
- Inserimento dei risultati e classifica aggiornata (3 punti per la vittoria, 1 per il pareggio).
- Dati conservati nel `localStorage` del browser.

I tornei restano sul dispositivo e sul browser in cui sono stati creati; non è prevista la sincronizzazione tra dispositivi.

Se il numero di squadre nella fase finale non è una potenza di due, alcune passano automaticamente il primo turno.
