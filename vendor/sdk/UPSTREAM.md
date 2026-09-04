# Vendored Paws Agent browser runtime

This directory is a minimal, pinned source snapshot of the browser runtime from `packages/paws-agent`:

- Repository: `https://github.com/wangjs-jacky/happy`
- Base extraction commit: `42a6773e38e3ea919ec75cc9286d447b14de2e79`
- Browser runtime synchronized through SDK commit: `2bbf57f77f132f6023244679bb2f3ce37671928f`
- Package version: `0.1.0-beta.1`
- Included surface: `PawsAgentClient`, browser account linking, browser credentials, transports, resources, encryption and public browser types

It keeps a fresh clone independently buildable while the SDK is not yet available from npm. Replace the root `workspace:*` dependency with the published SDK version and remove this directory in the same change after npm bootstrap is complete.
