# Architecture Overview

**Ariba Online Whiteboard** is built using a clean, Object-Oriented Programming (OOP) architecture with Vanilla JavaScript. It separates concerns between data (Model), visualization (View/Renderer), and logic (Controller/App).

## Core Components

The application is divided into four main classes:

### 1. `Element` (Model)
Represents a single item on the whiteboard.
- **Responsibility**: Stores data (positions, color, type) and handles hit-testing logic.
- **Types**: `brush`, `eraser`, `rect`, `circle`, `line`, `text`, `sticky`, `image`.
- **Key Method**: `isHit(x, y)` - Determines if a mouse click interacts with this element.

### 2. `StateManager` (Model / State Store)
Manages the collection of elements and the undo/redo history.
- **Responsibility**:
    - Stores the active list of elements (`this.elements`).
    - Manages the `history` stack for Undo/Redo operations.
    - Handles Serialization/Deserialization (JSON export/import).
- **flow**: `addElement` -> `saveToHistory` -> `renderCallback`.

### 3. `Renderer` (View)
Handles all HTML5 Canvas interactions.
- **Responsibility**:
    - Clears and redraws the canvas 60fps (or on demand).
    - Handles **Coordinate Transformation** (Screen <-> World) for Pan/Zoom.
    - Draws specific shapes based on `Element` type.
    - Renders the infinite grid.

### 4. `WhiteboardApp` (Controller)
The main entry point that wires everything together.
- **Responsibility**:
    - Initializes the App.
    - Binds DOM Events (Mouse, Touch, Keyboard).
    - Maps UI interactions (Buttons, Tools) to Logic.
    - Orchestrates the loop: `Event` -> `Update State` -> `Request Render`.

## Data Flow

1.  **User Action**: User clicks and drags on the canvas (`mousedown` -> `mousemove`).
2.  **App Controller**: `WhiteboardApp` captures the event.
    - Converts event coordinates to "World Coordinates" using `Renderer`.
    - Updates a temporary `currentElement` (e.g., adding points to a brush stroke).
3.  **Render Loop**: `WhiteboardApp` requests a render frame.
4.  **Visualization**: `Renderer` clears the canvas, applies Pan/Zoom transforms, and draws all `elements` + `currentElement`.
5.  **Action End**: User releases mouse (`mouseup`).
    - `WhiteboardApp` pushes `currentElement` to `StateManager`.
    - `StateManager` saves a snapshot for Undo history.

## Coordinate System

The app uses two coordinate systems:
1.  **Screen Coordinates**: The raw pixel position on the user's screen (e.g., `e.clientX`).
2.  **World Coordinates**: The logic position on the infinite canvas.

**Transformation Formula**:
```javascript
WorldX = (ScreenX - PanX) / Scale
WorldY = (ScreenY - PanY) / Scale
```
This allows drawings to stay "pinned" to the canvas while the user zooms and pans around them.
