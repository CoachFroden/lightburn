# LightBurn Nest

En nettleserbasert prototype for å lese LightBurn-filer (`.lbrn2` / `.lbrn`), finne sannsynlige fysiske deler og prøve en mer materialeffektiv plassering på en oppgitt platestørrelse.

## Prototype v0.1

Fungerer nå med:

- lokal opplasting av `.lbrn2` – filen behandles i nettleseren
- parsing av LightBurn XML
- `Path`, `Rect`, grupper og `XForm`-transformasjoner
- gjenbrukte `VertID` / `PrimID`-referanser
- CutSettings og ignorering av lag med `doOutput=0`
- automatisk deldeteksjon basert på lukkede konturer og geometrisk containment
- visning av ytre konturer og innvendige kutt
- valgfri platestørrelse, kantmargin og avstand mellom deler
- valgfri 90° rotasjon
- geometrisk bottom-left nesting med flere sorteringsforsøk
- flere plater dersom alt ikke får plass på én

## Viktige begrensninger

LightBurn-filen sier ikke alltid eksplisitt hva som er én fysisk del. Prototypen antar at en lukket kontur som ligger inni en større lukket kontur er et innvendig kutt i den større delen. Det kan være feil dersom en separat fysisk del bevisst er tegnet inne i et utskåret område.

Kurver brukes foreløpig via kontrollpunktene/vertex-strukturen som en polygonapproksimasjon. Før produksjonsbruk bør Bézier-segmentene tesselleres mer presist.

Nestingen er heuristisk og er ikke garantert å finne globalt optimal plassering.

## Kjør appen

Det er ingen build-prosess og ingen avhengigheter. Åpne `index.html` i en nettleser eller publiser repoet med GitHub Pages.

1. Last inn en `.lbrn2`-fil.
2. Kontroller hvilke deler appen finner.
3. Angi platestørrelse og avstander.
4. Trykk **Finn plassering**.

## Testgrunnlag

Parseren er utviklet mot en reell LightBurn 1.4.03-fil med mange Path-elementer, grupper, transformasjoner, kopiert geometri via ID-referanser og både aktive og deaktiverte CutSettings. Selve brukerens LightBurn-design er ikke lagt i repoet.

## Neste steg

1. Manuell korrigering av deldeteksjon: egen del / slå sammen med del.
2. Nøyaktig Bézier-tessellering.
3. Ekte polygon-offset for sikker minimumsavstand mellom kutt.
4. Bedre global søkestrategi, f.eks. no-fit polygons + genetisk søk eller simulated annealing.
5. Part-in-part nesting i områder som uansett skjæres ut.
6. Eksport tilbake til gyldig `.lbrn2` uten å endre CutSettings, gravering eller jobbdata.
7. Materialbibliotek og lagring av restbiter/offcuts.
