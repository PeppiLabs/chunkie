# Contributing

Thanks for taking an interest. This project exists to make one idea clear to people who have never
built a RAG system, so the bar for a change is simple: does it make something easier to understand,
or does it fix something that is wrong?

## Ways to help

- **Report a confusing explanation.** If a sentence in the app made you stop and reread it, that is
  a bug. Open an issue quoting the sentence and saying what tripped you up.
- **Report a transcript that fails to parse.** Include the shape of the JSON, with any real content
  removed.
- **Improve a visualization.** The chunk view, the vector strip, and the 2D map are all meant to
  make an abstract idea concrete. If you can do that better, please do.
- **Fix a bug.** Small, focused pull requests are easiest to review.

## Getting set up

Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run lint        # must pass
npm run build       # must pass, this also type checks
```

## House style

A few conventions this codebase keeps to. They are not arbitrary, and a review will mention them.

**Write for a reader who is new to the topic.** Any text a visitor sees should avoid jargon, or
define it in the same breath. "Embedding" needs explaining. "Cosine similarity" needs explaining.

**Comments explain why, not what.** The code already says what it does. A comment earns its place by
explaining a decision, a constraint, or a trap that is not obvious from reading the lines below it.

**No em dashes.** Use commas, colons, or parentheses. This applies to code, comments, interface
text, and documentation.

**Keep it running in the browser.** No backend, no API keys, no analytics, no account. If a feature
needs a server, it does not belong here. This constraint is what makes the project safe to use with
a real transcript and free to host.

**Do not add a dependency without a reason worth stating.** Every package is weight a visitor
downloads. The 2D projection is about eighty lines of plain TypeScript rather than a library, and
that was a deliberate call.

## Pull requests

1. Fork and branch from `main`.
2. Keep the change focused. One idea per pull request.
3. Say what you changed and why. If it is visual, a screenshot helps.
4. Confirm `npm run lint` and `npm run build` both pass.

## Reporting a security issue

Please do not open a public issue for a security problem. Email the maintainers instead and give us
a chance to fix it first.

## Code of conduct

Be decent to each other. Assume good faith, critique the work rather than the person, and remember
that somebody asking a basic question is exactly who this project is for.
