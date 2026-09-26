# MyFam – Familien Organizer

Ein gemeinsamer Ort für die ganze Familie: Einkaufsliste, Termine und Planung. Die App ist für das Smartphone gebaut und lässt sich dort wie eine normale App auf den Startbildschirm legen. Mehrere Familien können dieselbe Installation nutzen, ohne die Daten der anderen zu sehen.

## Stand

| Bereich                           | Stand                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| Konto, Login, Abmelden            | fertig                                                     |
| Familien, Rollen, Einladungslinks | fertig                                                     |
| Einkaufsliste                     | fertig (hinzufügen, abhaken, löschen, Erledigte löschen)   |
| Kalender                          | fertig (Termine mit Sichtbarkeit, Feiertage, CalDAV-Abos)  |
| Planung                           | fertig (Ordner, Karten mit Text, Tabellen, Links, Bildern) |
| Erinnerungen per Push             | fertig für Termine und Planungs-Kommentare                 |

## Technik

- [SvelteKit](https://svelte.dev) mit TypeScript, Tailwind CSS, `adapter-node`
- SQLite über [Drizzle ORM](https://orm.drizzle.team) (`better-sqlite3`), Migrationen in `drizzle/` laufen beim Start automatisch
- Eigene Anmeldung: Passwörter mit Argon2id, Sitzungen per `httpOnly`-Cookie (in der Datenbank liegt nur ein Hash des Tokens)
- Mandanten: Jede Tabelle mit Familiendaten hat eine `family_id`, und alle Abfragen in `src/lib/server/*.ts` filtern danach

```
src/lib/server/
  auth.ts        Passwörter, Sitzungen
  families.ts    Familien, Mitglieder, Einladungen
  shopping.ts    Einkaufsliste
  calendar.ts    Kalender: Termine, Sichtbarkeit, Freigaben
  meals.ts       Essensplan, Zutaten auf die Einkaufsliste
  tasks.ts       Aufgaben mit Zuständigen und Fälligkeit
  planning.ts    Planung: Ordner, Karten, Inhalte, Bilder
  push.ts        Web Push: VAPID-Schlüssel, Geräte, Versand
  reminders.ts   Erinnerungen: was fällig ist, Scheduler im App-Prozess
  visibility.ts  Gemeinsames Sichtbarkeitsmodell (Familie / bestimmte Personen / nur ich)
  uploads.ts     Hochgeladene Bilder im Dateisystem
  db/schema.ts   Datenbankschema
src/lib/holidays.ts  Deutsche Feiertage (offline berechnet, optional je Bundesland)
src/routes/
  (auth)/        Login, Registrieren, Einladung annehmen
  (app)/         Einkauf, Kalender, Planung, Familie
```

## Kalender

- **Sichtbarkeit pro Termin:** ganze Familie (Standard), bestimmte Personen oder nur ich. Wer einen Termin nicht sehen darf, bekommt ihn auch über den direkten Link nicht (404).
- **Bearbeiten:** Die Person, die den Termin angelegt hat. Admins dürfen zusätzlich Termine der ganzen Familie ändern oder löschen, aber deren Sichtbarkeit nicht ändern. Private und geteilte Termine bleiben allein bei ihrer Person.
- **Kalender-Abos:** Unter **Kalender → Kalender-Abos** (oder **Familie → Kalender-Abos**) kann ein Admin CalDAV-Kalender (z. B. Nextcloud) oder öffentliche ICS-Links (auch `webcal://`) einbinden. Die Termine sieht die ganze Familie, mit dem Namen des Abos als Quelle und einer eigenen Farbe. Sie sind nur lesbar. Abgleich alle 15 Minuten und per Knopf. Wiederkehrende Termine (inkl. Ausnahmen und verschobener Termine) werden ein Jahr zurück und zwei Jahre voraus berechnet. Termine, die in Nextcloud als privat oder vertraulich markiert sind, erscheinen nur als „Privat“ ohne Details.
  - Nextcloud: Adresse über Kalender → „…“ neben dem Kalendernamen → **Interne Adresse kopieren**, dazu Benutzername und ein **App-Passwort** (Einstellungen → Sicherheit). Wird die Adresse aller Kalender eingetragen, nennt die App die gefundenen Kalender.
  - Das Passwort wird mit AES-256-GCM verschlüsselt gespeichert. Den Schlüssel legt die App beim ersten Abo als `secret.key` neben der Datenbank an (im Docker-Volume), oder er kommt aus `SECRET_KEY` in der `.env`. Geht der Schlüssel verloren, müssen die Passwörter neu eingegeben werden.
- **Feiertage:** Die bundesweiten Feiertage werden immer angezeigt. Unter **Familie → Feiertage im Kalender** kann ein Admin das Bundesland wählen, dann kommen die regionalen dazu. Die Berechnung läuft offline (Osterformel), es wird kein externer Dienst gebraucht. Feiertage, die nur in Teilen eines Landes gelten (z. B. Mariä Himmelfahrt in Bayern), werden nicht angezeigt.
- **Essensplan:** In der Tagesansicht des Kalenders stehen Frühstück, Mittag und Abend als schlanke Zeilen, leere Mahlzeiten als „+“-Knöpfe. „Woche planen“ zeigt die ganze Woche. Frühere Gerichte werden beim Tippen vorgeschlagen und bringen ihre Zutaten mit. Ein Tipp auf den Einkaufswagen setzt die Zutaten auf die Einkaufsliste (Mengen wie „500 g“ werden erkannt, was schon offen auf der Liste steht, wird übersprungen). Der Essensplan ist für die ganze Familie sichtbar und bearbeitbar.
- **Aufgaben:** Jede Aufgabe hat ein Fälligkeitsdatum und optional eine zuständige Person. Sie erscheint am Fälligkeitstag im Kalender, überfällige offene Aufgaben zusätzlich am heutigen Tag. Unter „Alle“ gibt es die ganze Liste, gruppiert nach überfällig, heute, morgen, nächste 7 Tage und später, mit dem Filter „Meine“ (mir zugewiesen oder von mir ohne Zuständige angelegt). Abhaken darf jeder, der die Aufgabe sieht. Sichtbarkeit und Bearbeiten funktionieren wie bei Terminen. Eine private Aufgabe lässt sich nur sich selbst zuweisen, und bei geteilten Aufgaben wird die zuständige Person automatisch mit eingeschlossen. Per Push erfährt die zuständige Person sofort, wenn ihr jemand eine Aufgabe gibt, und am Fälligkeitstag um 8 Uhr kommt eine Erinnerung an offene Aufgaben (an die zuständige Person, sonst an die Person, die sie angelegt hat).

## Erinnerungen per Push

- **Standardmäßig an:** Browser erlauben Benachrichtigungen nur nach einem Tippen. Deshalb fragt MyFam auf jedem neuen Gerät einmal oben in der App nach („Einschalten“ oder „Später“). Hat das Gerät die Erlaubnis schon, wird es ohne Nachfrage angemeldet. Nach „Später“ oder dem Ausschalten in den Einstellungen fragt die App auf diesem Gerät nicht mehr.
- **Einschalten** geht jederzeit auch pro Gerät unter **Einstellungen → Benachrichtigungen**. Wer mehrere Geräte nutzt, schaltet es auf jedem ein. Dort gibt es auch eine Testnachricht und die Liste der eigenen Geräte.
- **iPhone/iPad:** nur ab iOS 16.4 und nur, wenn MyFam über „Teilen → Zum Home-Bildschirm“ als App installiert ist. Die Einstellungsseite erklärt das.
- **Pro Termin** wählt man die Erinnerung im Terminformular: bei Terminen mit Uhrzeit standardmäßig 30 Minuten vorher, bei ganztägigen am Vortag um 18 Uhr (oder „Keine“). Die Erinnerung geht an alle, die den Termin sehen dürfen und Benachrichtigungen eingeschaltet haben. Termine, die vor diesem Update angelegt wurden, haben keine Erinnerung.
- **Technik:** Web Push mit eigenem VAPID-Schlüssel, ohne Konto bei einem Drittanbieter. Der Server schickt die verschlüsselte Nachricht direkt an den Push-Dienst des Browsers (Google, Apple, Mozilla, Microsoft), der Container braucht dafür ausgehendes HTTPS. Der Schlüssel wird beim ersten Start erzeugt und in der Datenbank gespeichert. Alternativ `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` setzen (`npx web-push generate-vapid-keys`); ändert sich der Schlüssel, muss jedes Gerät neu eingeschaltet werden.
- **Zeitplan:** Ein Timer im App-Prozess prüft jede Minute, was fällig ist (deutsche Zeit, auch über die Zeitumstellung). War der Server kurz weg, werden bis zu 30 Minuten alte Erinnerungen nachgeholt, jede genau einmal. Weitere Arten (z. B. Aufgaben) hängen sich als eigene Quelle in `src/lib/server/reminders.ts` ein.
- **Kommentare in der Planung:** Schreibt jemand einen Kommentar unter eine Karte, bekommen alle anderen, die den Ordner sehen dürfen, eine Nachricht mit Name, Kartentitel und dem Anfang des Kommentars. Mehrere Kommentare zur selben Karte ersetzen die vorherige Nachricht, statt sich zu stapeln. Geänderte Kommentare lösen keine neue Nachricht aus.
- Der Service Worker (`src/service-worker.ts`) zeigt nur Benachrichtigungen an und speichert keine Seiten zwischen.

## Planung

- **Ordner** kann jedes Mitglied anlegen. Die Sichtbarkeit funktioniert wie beim Kalender: ganze Familie (Standard), bestimmte Personen oder nur ich. Nur wer den Ordner angelegt hat, kann das ändern. Admins dürfen Ordner der ganzen Familie umbenennen oder löschen.
- **Karten** liegen in einem Ordner und erben dessen Sichtbarkeit. Wer den Ordner sieht, kann die Karten darin anlegen und bearbeiten.
- **Detailansicht:** Eine Karte besteht aus Inhalten, die man frei hinzufügen, bearbeiten, verschieben und löschen kann: Text mit einfacher Formatierung (`**fett**`, `*kursiv*`, `# Überschrift`, `- Liste`, `- [ ] Aufgabe`), Tabellen, Links und Bilder.
- **Kommentare:** Unter jeder Karte können alle, die die Karte sehen, Kommentare schreiben. Eigene Kommentare lassen sich bearbeiten und löschen. Die Kartenübersicht zeigt, wie viele Kommentare eine Karte hat.
- **Bilder** werden im Browser auf höchstens 2000 px verkleinert (dabei fallen auch GPS-Daten weg) und dürfen bis 10 MB groß sein. Erlaubt sind JPEG, PNG, WebP und GIF, geprüft wird der Dateiinhalt. Sie liegen im Ordner `uploads/` neben der Datenbank (im Docker-Volume unter `/data/uploads`) und werden nur an Personen ausgeliefert, die die Karte sehen dürfen. Mit `UPLOAD_DIR` lässt sich ein anderer Ordner wählen.

## Design

- **Farben** stehen zentral in `src/routes/layout.css`: `brand` (Petrol-Grün, Buttons und aktive Elemente), `accent` (Bernstein, z. B. Feiertage und Angebote), `slate` (warme Grautöne) und `surface` (Hintergrund von Karten). Komponenten nutzen nur diese Namen.
- **Hell/Dunkel** lässt sich unter Einstellungen → Darstellung pro Gerät wählen (Cookie `theme`), Standard ist „Automatisch“ nach der Geräteeinstellung. Dafür werden die Farbskalen getauscht, Komponenten brauchen keine `dark:`-Klassen.
- **Schrift** ist Manrope, selbst ausgeliefert über `@fontsource-variable/manrope` (keine Anfrage an Google).
- **Piktogramme** kommen aus [Lucide](https://lucide.dev) (`@lucide/svelte`), keine Emojis.

## Entwickeln

```sh
cp .env.example .env
npm install
npm run dev
```

Nützliche Befehle: `npm test` (Unit-Tests), `npm run check` (Typen), `npm run lint`.
Nach einer Änderung an `src/lib/server/db/schema.ts`: `npm run db:generate` erzeugt eine neue Migration.

## Lokal mit Docker testen

```sh
docker compose up -d --build
```

Dann `http://localhost:3000` öffnen. Wichtig: genau diese Adresse benutzen, nicht `127.0.0.1` oder die IP des Rechners, sonst lehnt die App Formulare ab. Die App zeigt in dem Fall oben einen roten Hinweis an. Für eine andere Adresse oder einen anderen Port `PUBLIC_URL` bzw. `PORT` in der `.env` setzen.

## Betrieb mit Docker (Ubuntu)

Die App läuft als ein Container hinter deinem eigenen Reverse Proxy (z. B. nginx, Traefik oder Nginx Proxy Manager). Der Proxy kümmert sich um HTTPS und leitet per HTTP an den Container weiter.

```sh
git clone https://github.com/3nric02001/myfam.git && cd myfam
echo "PUBLIC_URL=https://myfam.deine-domain.de" > .env
docker compose up -d --build
```

Danach lauscht die App auf `127.0.0.1:3000`. Im Reverse Proxy leitest du die Domain dorthin weiter, z. B. mit nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

- `PUBLIC_URL` muss genau die Adresse sein, die im Browser steht. SvelteKit prüft damit die Herkunft von Formularen (CSRF-Schutz), und die Einladungslinks werden daraus gebaut.
- `PORT` ändert den Port auf dem Host. `BIND=0.0.0.0` macht ihn im Netzwerk erreichbar, falls der Proxy auf einem anderen Rechner läuft.
- `SECRET_KEY` (optional, beliebiger langer Text) verschlüsselt die Passwörter der Kalender-Abos. Ohne Angabe wird `/data/secret.key` erzeugt.
- `MARKTGURU_ENABLED=true` schaltet automatische Angebote für die Einkaufsliste ein (siehe unten). Standardmäßig aus.
- Läuft der Proxy selbst in Docker, kannst du den Container stattdessen in dasselbe Docker-Netzwerk hängen und `app:3000` als Ziel nehmen.

Danach unter `https://<deine Domain>/registrieren` die erste Familie anlegen und die anderen über **Familie → Einladungslink erstellen** einladen.

- **Update:** `git pull && docker compose up -d --build`
- **Backup:** Die Datenbank liegt im Volume `app-data` (`/data/myfam.db`), z. B.
  `docker compose exec app node -e "require('better-sqlite3')('/data/myfam.db').backup('/data/backup.db')"` und dann `docker compose cp app:/data/backup.db .`
  Die Bilder aus der Planung liegen im selben Volume unter `/data/uploads` und gehören mit ins Backup: `docker compose cp app:/data/uploads ./uploads`. Ebenso `/data/secret.key` (Schlüssel für die Passwörter der Kalender-Abos).

## Bereiche in der Einkaufsliste

Die offenen Einträge sind nach Supermarkt-Bereichen gruppiert (Obst & Gemüse, Brot, Milch/Käse/Eier, Fleisch/Fisch, Vorrat, Süßes, Getränke, Tiefkühl, Drogerie, Haushalt, Baby & Tier, Sonstiges). Die App rät den Bereich anhand einer Stichwortliste (`src/lib/categories.ts`), ganz ohne Internet. Liegt sie daneben, lässt sich der Bereich über **Bereiche ändern** korrigieren; die Familie behält die Korrektur für diesen Artikel.

## Angebote in der Einkaufsliste

Unter **Einkauf → Tipp / Angebote** wählt jede Familie ihre Märkte (und die Postleitzahl). Die App sucht zu jedem offenen Artikel passende Angebote dieser Märkte und empfiehlt den Markt mit den meisten Angeboten, oder zwei Märkte, wenn ein zweiter Stopp weitere Artikel abdeckt.

Ein Angebot zählt sicher, wenn der Artikel als eigenes Wort im Produktnamen steht („Milch“ in „Frische Milch“). Ist er nur das Ende eines längeren Worts („Vollmilch“, „Müllermilch“) oder nennt das Angebot eine andere Produktart („Schokolade“, „Drink“), fragt die App einmal nach, ob das zählt, und merkt sich die Antwort für die Familie. Mitten im Wort („Vollmilchschokolade“, „Milchreis“) passt es nie. Oben auf der Angebote-Seite lässt sich zwischen dieser und der nächsten Woche umschalten.

**Preise:** Beim Abhaken lässt sich über das €-Symbol eintragen, was ein Artikel gekostet hat (Markt, Preis, optional das genaue Produkt wie „Gut&Günstig Mozzarella“). Daraus und aus den Angeboten schätzt die App den Gesamtpreis der offenen Liste. Ist ein gemerkter Preis niedriger als das beste Angebot, zeigt die Liste die günstigere Alternative. Ein Tipp auf einen Eintrag öffnet seine Detailansicht: Name, Menge und Bereich ändern, alle Angebote mit Quelle, Bild und Link (bei marktguru die Seite der Marke in diesem Markt, z. B. /rb/lidl/milbona, weil die API keine Seite für das einzelne Angebot nennt) sowie die gemerkten Preise. Abgehakt wird nur über den Kreis links. Eine freie Quelle für normale Regalpreise gibt es nicht, deshalb lernt die App sie beim Einkaufen.

Angebote kommen aus zwei Quellen:

- **Von Hand eingetragen** (z. B. aus dem Prospekt). Funktioniert immer; abgelaufene Angebote verschwinden von selbst.
- **Automatisch über marktguru.de**, nur wenn `MARKTGURU_ENABLED=true` in der `.env` steht. Es gibt keine offizielle Schnittstelle: die App nutzt dieselbe wie die marktguru-Webseite. Deren [Nutzungsbedingungen](https://info.marktguru.de/agb) (§ 4) verbieten das automatische Auslesen, das Einschalten ist also deine Entscheidung als Betreiber. Die Ergebnisse werden 6 Stunden zwischengespeichert, höchstens 30 Suchen pro Aufruf. Bricht die Quelle weg, zeigt die App einen Hinweis und nutzt nur die eingetragenen Angebote.
