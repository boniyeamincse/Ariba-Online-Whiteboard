# Technical Blueprint & API Reference

This document provides a detailed breakdown of the classes and methods used in the **Ariba Online Whiteboard**.

## Class Reference

### 1. `Element`
Represents a drawing object.

- **Constructor**: `new Element(type, config)`
    - `type` (String): 'brush', 'eraser', 'rect', 'circle', 'line', 'text', 'sticky', 'image'.
    - `config` (Object): `{ x, y, color, size, alpha, ... }`
- **Properties**:
    - `id` (Number): Unique timestamp-based ID.
    - `points` (Array): `{x, y}` coordinates for freehand drawing.
    - `endX`, `endY` (Number): End coordinates for shapes.
    - `w`, `h` (Number): Width/Height for Rect/Image/Sticky.
- **Methods**:
    - `isHit(x, y)`: Returns `true` if point (x, y) intersects the element.
    - `distToSegment(p, v, w)`: Helper for line collision detection.

### 2. `StateManager`
Handles application state and history.

- **Properties**:
    - `elements` (Array<Element>): The current list of active elements.
    - `history` (Array<String>): Stack of JSON snapshots for Undo.
    - `redoStack` (Array<String>): Stack of JSON snapshots for Redo.
- **Methods**:
    - `getHitElement(x, y)`: Returns the top-most element at (x, y).
    - `addElement(element)`: Adds a new element and saves history.
    - `setElements(elements)`: Replaces current state (used in load).
    - `saveToHistory()`: Pushes current state to `history` stack (Max 50).
    - `undo()`: Reverts to previous state.
    - `redo()`: Re-applies reverted state.
    - `restoreFromJSON(jsonStr)`: Hydrates JSON string back to `Element` instances.
    - `clear()`: Resets the board.

### 3. `Renderer`
Handles Canvas drawing and transformations.

- **Properties**:
    - `ctx` (CanvasRenderingContext2D): The 2D context.
    - `scale` (Number): Current zoom level (Default: 1).
    - `panX`, `panY` (Number): Current pan offset.
    - `showGrid` (Boolean): Toggle grid visibility.
- **Methods**:
    - `resize()`: Updates canvas dimensions on window resize.
    - `screenToWorld(x, y)`: Converts screen pixels to canvas coordinates.
    - `worldToScreen(x, y)`: Converts canvas coordinates to screen pixels.
    - `draw(elements, currentElement)`: Main render loop. Clears canvas, applies transform, draws grid, then elements.
    - `drawElement(el)`: Routes drawing logic based on `el.type`.

### 4. `WhiteboardApp`
The main controller.

- **Properties**:
    - `activeTool` (String): Currently selected tool.
    - `isDrawing`, `isPanning`, `isMoving` (Boolean): State flags.
    - `currentElement` (Element): The element currently being drawn/dragged.
- **Methods**:
    - `init()`: Sets up event listeners and UI.
    - `handleStart(e)`, `handleMove(e)`, `handleEnd(e)`: Core input handlers.
    - `handleWheel(e)`: Zooms the canvas towards the mouse pointer.
    - `startDrawing(x, y)`: Initializes a new element based on `activeTool`.
    - `updateDrawing(x, y)`: Updates the `currentElement`'s geometry during drag.
    - `handleTextTool(e)`: Creates a textarea overlay for text input.
    - `handleStickyTool(x, y)`: Creates a textarea overlay for sticky notes.

## Event System

- **`request_render`**: Custom event dispatched to trigger a redraw.
- **DOM Events**:
    - `mousedown/touchstart`: Start action.
    - `mousemove/touchmove`: Update action/pan.
    - `mouseup/touchend`: Finalize action/save history.
    - `keydown`: Shortcuts (Space for Pan).
