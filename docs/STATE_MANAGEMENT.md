# State Management & Persistence

This document explains how the application manages state, handles undo/redo operations, and persists data.

## The State Model

 The application state is a simple collection of `Element` objects.

```javascript
State = {
    elements: [Element, Element, ...],
    history: [JSONString, JSONString, ...],
    redoStack: [JSONString, JSONString, ...]
}
```

## Undo / Redo Mechanism

The application implement a **Snapshot-based History System**.

1.  **Save Trigger**: Whenever an action is completed (e.g., `mouseup` after drawing), `saveToHistory()` is called.
2.  **Snapshot Creation**: The current `elements` array is serialized to a JSON string.
    - *Why JSON String?* Deep cloning objects with nested arrays (points) is complex. `JSON.stringify` is a fast and reliable way to create a deep immutable snapshot.
3.  **Undo Action**:
    - Pops the last snapshot from `history`.
    - Pushes current state to `redoStack`.
    - Restores state via `restoreFromJSON`.
4.  **Redo Action**:
    - Pops the last snapshot from `redoStack`.
    - Pushes current state to `history`.
    - Restores state via `restoreFromJSON`.

**Limit**: The history stack is capped at **50 snapshots** to prevent memory overflow.

## Persistence (Save / Load)

The application supports saving projects to local files (`.json`) and loading them back.

### JSON Structure

A saved project file looks like this:

```json
[
  {
    "type": "brush",
    "id": 1708234567890,
    "x": 100,
    "y": 100,
    "color": "#ff0000",
    "size": 5,
    "points": [{"x":100, "y":100}, {"x":105, "y":105}, ...]
  },
  {
    "type": "rect",
    "id": 1708234567891,
    "x": 200,
    "y": 200,
    "w": 150,
    "h": 100,
    "color": "#0000ff"
  }
]
```

### Hydration Problem

When loading from JSON, we get plain JavaScript objects. We must specificially **hydrate** them back into `Element` instances.

**Why?**
The `Element` class has methods like `isHit()` that are required for the tool logic (Move, Erase) to work. Plain objects don't have these methods attached.

**Solution**:
The `restoreFromJSON` method loops through the parsed data and re-instantiates the class:

```javascript
this.elements = rawList.map(data => {
    return new Element(data.type, data); // Re-attach prototype methods
});
```
