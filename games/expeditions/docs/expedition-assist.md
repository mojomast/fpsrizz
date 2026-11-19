# Optional expedition assistance

## Integration

The bundled catalog registers `expedition/assist`, and the Silt, Salt and Common Ground presets select it alongside
`mechanics/hints`. Other compatible compositions can enable both plugins and select
`"sdk/mechanic-hints": "mechanics/hints"`; the manifest's role dependency orders the selected provider first.

## Behavior and limits

The native button and polite live region reveal one hint per request, with a second, more specific hint on request.
No hint is revealed automatically. The HUD reads only public detached state and never issues commands. It uses Silt's
visible threats, resources and progress, Salt's battle and active journal, and Common Ground's needs, household and
projects. It does not inspect unrevealed Silt rooms, locked Salt journal entries, or forecast outcomes. If multiple
family services exist, precedence is Silt, Salt, then Hearth. The HUD hides without a supported service or `Ui`.

Each observed state change clears the text and resets the shared ledger. Launcher pause blocks reveals. Household
pause also blocks reveals. If context changes during launcher pause, the display stays hidden until the ledger can
reset on resume. Both in-game changes and host restart are observed; Silt exposes no revision or run ID, so a restart
that produces an identical snapshot between observations cannot be detected. Hint state is session-local and owned
by the consumer and provider scopes. Because the provider blocks reset during launcher pause, reset is deferred rather
than displaying a stale hint. Frequent state updates may clear guidance; request it again for the latest state.

## Reuse decision

`mechanics/hints` supplies the owned pause-aware reveal ledger, composed using `hintMechanic`; `portfolio/assist`
and its [composition note](../../puzzles/docs/portfolio-assist.md) demonstrate UI and context-reset policy. The three family services
provide observations; only the family-specific interpretation is new. The ledger deliberately stores neither text
nor context, and no second ledger, gameplay authority, or spoiler-generating solver is introduced.
