import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AppStateStore } from '../main/store';

describe('AppStateStore', () => {
  it('detects first run and creates empty state', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pokedesk-test-'));
    try {
      const filePath = join(tempDir, 'state.json');
      const store = new AppStateStore(filePath, new Set(['pikachu']), ['1']);

      assert.equal(store.isFirstRun, true);
      assert.deepEqual(store.state.pets, []);
      assert.equal(store.state.preferences.size, 'medium');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists state atomically and loads back', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pokedesk-test-'));
    try {
      const filePath = join(tempDir, 'state.json');
      const store = new AppStateStore(filePath, new Set(['pikachu']), ['1']);

      store.update((state) => {
        state.preferences.size = 'large';
        state.pets.push({
          id: 'test-1',
          pokemonId: 'pikachu',
          displayId: '1',
          x: 0.5,
          y: 1,
          direction: 1,
          speed: 40,
        });
      });

      const loaded = new AppStateStore(filePath, new Set(['pikachu']), ['1']);
      assert.equal(loaded.isFirstRun, false);
      assert.equal(loaded.state.preferences.size, 'large');
      assert.equal(loaded.state.pets.length, 1);
      assert.equal(loaded.state.pets[0]?.id, 'test-1');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('debounces update and flushes state to disk', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pokedesk-test-'));
    try {
      const filePath = join(tempDir, 'state.json');
      const store = new AppStateStore(filePath, new Set(['pikachu']), ['1']);

      store.update((state) => {
        state.preferences.size = 'small';
      }, false);

      // Flushed explicitly
      store.flush();

      const loaded = new AppStateStore(filePath, new Set(['pikachu']), ['1']);
      assert.equal(loaded.state.preferences.size, 'small');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('recovers gracefully from corrupted JSON file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pokedesk-test-'));
    try {
      const filePath = join(tempDir, 'state.json');
      writeFileSync(filePath, '{ corrupted json ...');

      const store = new AppStateStore(filePath, new Set(['pikachu']), ['1']);
      assert.equal(store.isFirstRun, false);
      assert.deepEqual(store.state.pets, []);
      assert.equal(store.state.preferences.size, 'medium');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
