# A spec's first render compiles React Native on a cold cache, inside the first test's wait

**Date**: 2026-11-22
**Category**: testing
**Key files**: `node_modules/react-native/index.js`, `components/home/Home.test.tsx`

## Detail

React Native's `index.js` exports its components through getters
(`get ScrollView() { return require(...) }`), so a component's module is only
required the first time something renders it, not when the spec imports the
screen. When Jest's transform cache doesn't have that module, Babel compiles it
right then, in the middle of the render. CI starts with no cache, and so does a
local run right after a merge or a `bun i`.

On a screen like Home, the first full render pulls in `ScrollView`,
`RefreshControl`, `ActivityIndicator` and the icons. A CPU profile put that at
about 900 ms when the file ran alone, and more in the busy parallel suite. It
lands inside whatever the first test waits on next. React Native Testing
Library's `findBy*` and `waitFor` give up after 1000 ms by default
(`asyncUtilTimeout`). The rendered tree in the failure shows the screen
already laid out, with the data missing.

The signature: only the first test of one file fails. It fails only when the
suite runs cold, often only in the full suite, and passes on a rerun or when
the file runs alone with a warm cache. The usual reading of "fails in the
suite, passes alone" is shared state between specs. In this case nothing is
shared; the test is waiting for a one-time cost.

To reproduce:

```bash
bunx jest --runInBand --no-cache <file>   # the first test's duration shows it
```

Rules:

- When a spec's first test runs about a second slower than the others under
  `--no-cache`, render the screen once in a `beforeAll` with a generous wait and
  its own hook timeout, then unmount it. `Home.test.tsx` does this. The tests
  keep the default timeouts, so a real regression still fails fast.
- Don't raise the timeout in the test itself to absorb the compile cost. The
  test would still pay it, and the cost grows with the suite and the machine.
- To see where cold time goes, profile one run:
  `node --cpu-prof node_modules/jest/bin/jest.js --runInBand --no-cache <file>`.
  Samples under `@babel` whose nearest project frame is a component's render
  are this compile cost.
