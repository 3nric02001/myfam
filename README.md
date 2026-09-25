# MyFam – Familien Organizer

Ein gemeinsamer Ort für die ganze Familie: Einkaufsliste, Termine und Planung. Die App ist für das Smartphone gebaut und lässt sich dort wie eine normale App auf den Startbildschirm legen. Mehrere Familien können dieselbe Installation nutzen, ohne die Daten der anderen zu sehen.

## Stand

| Bereich                           | Stand                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| Konto, Login, Abmelden            | fertig                                                     |
| Familien, Rollen, Einladungslinks | fertig                                                     |
| Einkaufsliste                     | fertig (hinzufügen, abhaken, löschen, Erledigte löschen)   |
| Kalender                          | fertig (Termine mit Sichtbarkeit, deutsche Feiertage)      |
| Planung                           | fertig (Ordner, Karten mit Text, Tabellen, Links, Bildern) |

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
  planning.ts    Planung: Ordner, Karten, Inhalte, Bilder
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
- **Feiertage:** Die bundesweiten Feiertage werden immer angezeigt. Unter **Familie → Feiertage im Kalender** kann ein Admin das Bundesland wählen, dann kommen die regionalen dazu. Die Berechnung läuft offline (Osterformel), es wird kein externer Dienst gebraucht. Feiertage, die nur in Teilen eines Landes gelten (z. B. Mariä Himmelfahrt in Bayern), werden nicht angezeigt.

## Planung

- **Ordner** kann jedes Mitglied anlegen. Die Sichtbarkeit funktioniert wie beim Kalender: ganze Familie (Standard), bestimmte Personen oder nur ich. Nur wer den Ordner angelegt hat, kann das ändern. Admins dürfen Ordner der ganzen Familie umbenennen oder löschen.
- **Karten** liegen in einem Ordner und erben dessen Sichtbarkeit. Wer den Ordner sieht, kann die Karten darin anlegen und bearbeiten.
- **Detailansicht:** Eine Karte besteht aus Inhalten, die man frei hinzufügen, bearbeiten, verschieben und löschen kann: Text mit einfacher Formatierung (`**fett**`, `*kursiv*`, `# Überschrift`, `- Liste`, `- [ ] Aufgabe`), Tabellen, Links und Bilder.
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
- `MARKTGURU_ENABLED=true` schaltet automatische Angebote für die Einkaufsliste ein (siehe unten). Standardmäßig aus.
- Läuft der Proxy selbst in Docker, kannst du den Container stattdessen in dasselbe Docker-Netzwerk hängen und `app:3000` als Ziel nehmen.

Danach unter `https://<deine Domain>/registrieren` die erste Familie anlegen und die anderen über **Familie → Einladungslink erstellen** einladen.

- **Update:** `git pull && docker compose up -d --build`
- **Backup:** Die Datenbank liegt im Volume `app-data` (`/data/myfam.db`), z. B.
  `docker compose exec app node -e "require('better-sqlite3')('/data/myfam.db').backup('/data/backup.db')"` und dann `docker compose cp app:/data/backup.db .`
  Die Bilder aus der Planung liegen im selben Volume unter `/data/uploads` und gehören mit ins Backup: `docker compose cp app:/data/uploads ./uploads`

## Angebote in der Einkaufsliste

Unter **Einkauf → Tipp / Angebote** wählt jede Familie ihre Märkte (und die Postleitzahl). Die App sucht zu jedem offenen Artikel passende Angebote dieser Märkte und empfiehlt den Markt mit den meisten Angeboten, oder zwei Märkte, wenn ein zweiter Stopp weitere Artikel abdeckt.

Ein Angebot zählt sicher, wenn der Artikel als eigenes Wort im Produktnamen steht („Milch“ in „Frische Milch“). Ist er nur das Ende eines längeren Worts („Vollmilch“, „Müllermilch“) oder nennt das Angebot eine andere Produktart („Schokolade“, „Drink“), fragt die App einmal nach, ob das zählt, und merkt sich die Antwort für die Familie. Mitten im Wort („Vollmilchschokolade“, „Milchreis“) passt es nie. Oben auf der Angebote-Seite lässt sich zwischen dieser und der nächsten Woche umschalten.

Angebote kommen aus zwei Quellen:

- **Von Hand eingetragen** (z. B. aus dem Prospekt). Funktioniert immer; abgelaufene Angebote verschwinden von selbst.
- **Automatisch über marktguru.de**, nur wenn `MARKTGURU_ENABLED=true` in der `.env` steht. Es gibt keine offizielle Schnittstelle: die App nutzt dieselbe wie die marktguru-Webseite. Deren [Nutzungsbedingungen](https://info.marktguru.de/agb) (§ 4) verbieten das automatische Auslesen, das Einschalten ist also deine Entscheidung als Betreiber. Die Ergebnisse werden 6 Stunden zwischengespeichert, höchstens 30 Suchen pro Aufruf. Bricht die Quelle weg, zeigt die App einen Hinweis und nutzt nur die eingetragenen Angebote.
