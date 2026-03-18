
# Mystical Dice Roller

A web-based 3D mystical dice roller for tabletop RPGs, built with Three.js and Cannon-es.

## Features

- **3D Dice Engine**: Physically simulated dice (d4, d6, d8, d10, d12, d20).
- **Rune Interpretation**: Each roll reveals a mystical rune with atmospheric meaning.
- **History**: Keeps track of your last 20 rolls.
- **Modular Architecture**: Clean separation of Physics, Rendering, Data, and UI.

## Architecture

### 1. Rendering (Three.js)
The visual layer handles the 3D scene, lights, shadows, and mesh synchronization.
- **Scene Graph**: Contains the floor, lights, and dice meshes.
- **Meshes**: Standard geometries (Box, Tetrahedron, Octahedron, Dodecahedron, Icosahedron) are used.
- **Materials**: Standard material with roughness/metalness for a physical look.

### 2. Physics (Cannon-es)
The physics world runs in parallel with the visual scene.
- **Bodies**: Each visual mesh has a corresponding physics body.
- **Shapes**: `ConvexPolyhedron` is generated from the visual geometry vertices to ensure accurate collisions.
- **Simulation**: Steps at 60Hz.

### 3. Result Detection
- The system waits for the dice velocity to drop below a threshold for consecutive frames.
- Once rested, it calculates the face normal most aligned with the World UP vector (0, 1, 0).
- For d4 (Tetrahedron), it detects the face pointing DOWN.
- The face index is deterministically mapped to a value (1-N).

### 4. Rune System
- A mapping object in `src/runes.js` links each dice value to a rune symbol, name, and meaning.
- Includes Elder Futhark runes and tarot/astrological concepts.

## Running Locally

Since this project uses ES Modules, you need a local web server to run it (browsers block file:// imports for security).

### Option 1: VS Code Live Server
1. Open the project folder in VS Code.
2. Install the "Live Server" extension.
3. Right-click `index.html` and select "Open with Live Server".

### Option 2: Python SimpleHTTPServer
1. Open a terminal in the project directory.
2. Run `python -m http.server` (or `python3 -m http.server`).
3. Open `http://localhost:8000` in your browser.

### Option 3: Node http-server
1. Run `npx http-server .`
2. Open the displayed URL.

## Dependencies
- **Three.js** (v0.160.0) via CDN
- **Cannon-es** (v0.20.0) via CDN
- **JetBrains Mono** via Google Fonts
