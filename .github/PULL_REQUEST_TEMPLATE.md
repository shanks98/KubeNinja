<!-- Thanks for contributing to KubeNinja! -->

## What & why

<!-- What does this change, and why? Link the issue it closes: "Closes #123". -->

## How I tested it

<!-- Commands run, clusters/kinds exercised, screenshots for UI changes. -->

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] I added/updated tests for behaviour changes
- [ ] **Security invariant preserved:** credentials/tokens still never touch disk
      and never leave the main process (or I've flagged the auth/IPC change for
      careful review below)

## Notes for reviewers

<!-- Anything to look at closely — especially changes to auth, tokens, or the IPC boundary. -->
