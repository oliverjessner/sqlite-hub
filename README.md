# sqlite-hub

A cyberpunk inspired management app for sqlite

![](/assets/mockups/home.png)

## Install

### Homebrew

```bash
brew install oliverjessner/tap/sqlite-hub
```

Or tap first and then install:

```bash
brew tap oliverjessner/tap
brew install sqlite-hub
```

### NPM

```bash
npm install sqlite-hub
```

## Run

Start the app and open it automatically in the default browser:

```bash
npm start
```

Use a custom port via CLI. If omitted, `4173` is used:

```bash
npm start -- --port:1203
```

After linking or installing globally, the binary can also be called directly:

```bash
sqlite-hub --port:1203
```

App state such as recent connections, SQL history, and local settings is stored in the user profile instead of the install directory. On macOS this lives under `~/Library/Application Support/sqlite-hub/`, so Homebrew upgrades keep the internal state across versions.
